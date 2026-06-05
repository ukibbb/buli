import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AssistantResponseEvent,
  BuliDiagnosticLogEvent,
  ConversationSessionEntry,
  ProviderStreamEvent,
  ProviderTurnReplay,
} from "@buli/contracts";
import type {
  ConversationTurnProvider,
  ProviderConversationTurn,
  ProviderConversationTurnRequest,
  ProviderToolResultSubmission,
} from "@buli/engine";
import { AssistantConversationRuntime } from "@buli/engine";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

const softElapsedTimeCheckpointMilliseconds = 5;
const delayBeforeSecondSubagentToolMilliseconds = 10;

type SubmittedToolResult = Readonly<{
  toolCallId: string;
  toolResultText: string;
}>;

type CompletedToolResultConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "completed_tool_result" }>;
type CompletedTaskToolResultConversationSessionEntry = CompletedToolResultConversationSessionEntry & {
  toolCallDetail: Extract<CompletedToolResultConversationSessionEntry["toolCallDetail"], { toolName: "task" }>;
};

export const taskSubagentRuntimeScenario: PerformanceScenario = {
  scenarioName: "task-subagent-runtime",
  description:
    "Measures deterministic task-subagent execution, parent wait, concurrent-group attribution, checkpointing, and result payload shape.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 5,
  async runIteration(input) {
    const workspaceRootPath = await createTaskSubagentRuntimeWorkspace(input);
    const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
    const taskSubagentRuntimeProvider = new TaskSubagentRuntimeScenarioProvider();
    const runtime = new AssistantConversationRuntime({
      conversationTurnProvider: taskSubagentRuntimeProvider,
      workspaceRootPath,
      promptContextBrowseRootPath: workspaceRootPath,
      taskSubagentSoftElapsedTimeCheckpointMilliseconds: softElapsedTimeCheckpointMilliseconds,
      diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    });
    const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
    const conversationTurnReplay = await measureDurationMs(() => collectAssistantResponseEvents(
      runtime.startConversationTurn({
        userPromptText: "Use an Explorer subagent to inspect the demo workspace.",
        selectedModelId: "gpt-5.5",
      }),
    ));
    const heapUsedAfterScenario = process.memoryUsage().heapUsed;
    const completedTaskToolResults = listCompletedTaskToolResults(runtime.conversationHistory.listConversationSessionEntries());
    const elapsedCheckpointTaskToolResult = readCompletedTaskToolResult({
      conversationSessionEntries: runtime.conversationHistory.listConversationSessionEntries(),
      toolCallId: "call_explore_elapsed",
      diagnosticEvents,
    });
    const taskSubagentCheckpoint = elapsedCheckpointTaskToolResult.toolCallDetail.subagentResearchCheckpoint;
    const taskExecutionDurationMs = sumDiagnosticDurationMs(
      diagnosticEvents.filter((diagnosticEvent) =>
        diagnosticEvent.subsystem === "engine" &&
        diagnosticEvent.eventName === "tool_call.execution_finished" &&
        readStringField(diagnosticEvent.fields, "toolName") === "task"
      ),
    );
    const taskGroupWallTimeMs = sumDiagnosticDurationMs(
      diagnosticEvents.filter((diagnosticEvent) =>
        diagnosticEvent.subsystem === "engine" &&
        diagnosticEvent.eventName === "tool_call.concurrent_group_finished" &&
        readStringArrayField(diagnosticEvent.fields, "toolNames")?.every((toolName) => toolName === "task") === true
      ),
    );
    const checkpointRequestCount = diagnosticEvents.filter((diagnosticEvent) =>
      diagnosticEvent.subsystem === "engine" &&
      diagnosticEvent.eventName === "tool_call.task_subagent_research_checkpoint_requested"
    ).length;
    const terminalTaskSubagentDiagnosticEvents = listTerminalTaskSubagentDiagnosticEvents(diagnosticEvents);
    const parentVisibleFailedTaskResultCount = countParentVisibleFailedTaskResults(terminalTaskSubagentDiagnosticEvents);
    const requestedToolsAfterCheckpointFailureCount = countRequestedToolsAfterCheckpointFailures(
      terminalTaskSubagentDiagnosticEvents,
    );
    const checkpointCompletedTaskResultCount = countCompletedCheckpointTaskResults(terminalTaskSubagentDiagnosticEvents);

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: [
        createDurationMetric({
          metricName: "task_subagent_runtime.turn.duration_ms",
          durationMs: conversationTurnReplay.durationMs,
          budget: { warnAbove: 75, failAbove: 250 },
        }),
        createDurationMetric({
          metricName: "task_subagent_runtime.task_execution.duration_ms",
          durationMs: taskExecutionDurationMs,
          budget: { warnAbove: 75, failAbove: 250 },
        }),
        createDurationMetric({
          metricName: "task_subagent_runtime.task_group_wall_time.duration_ms",
          durationMs: taskGroupWallTimeMs,
          budget: { warnAbove: 75, failAbove: 250 },
        }),
        createDurationMetric({
          metricName: "task_subagent_runtime.parent_task_result_wait.duration_ms",
          durationMs: taskSubagentRuntimeProvider.parentProviderTurn.taskResultWaitDurationMs,
          budget: { warnAbove: 75, failAbove: 250 },
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.assistant_event_count",
          count: conversationTurnReplay.measuredValue.length,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.checkpoint_request_count",
          count: checkpointRequestCount,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.parent_visible_failed_task_result_count",
          count: parentVisibleFailedTaskResultCount,
          budget: { warnAbove: 0, failAbove: 0 },
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.requested_tools_after_checkpoint_failure_count",
          count: requestedToolsAfterCheckpointFailureCount,
          budget: { warnAbove: 0, failAbove: 0 },
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.checkpoint_completed_task_result_count",
          count: checkpointCompletedTaskResultCount,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.subagent_child_tool_call_count",
          count: elapsedCheckpointTaskToolResult.toolCallDetail.subagentChildToolCalls?.length ?? 0,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "task_subagent_runtime.checkpoint_elapsed_ms",
          count: taskSubagentCheckpoint?.elapsedMilliseconds ?? 0,
        }),
        createBytesMetric({
          metricName: "task_subagent_runtime.parent_task_result_text_bytes",
          bytes: sumToolResultTextLength(completedTaskToolResults),
        }),
        createBytesMetric({
          metricName: "task_subagent_runtime.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterScenario - heapUsedBeforeScenario),
          budget: { warnAbove: 8_000_000, failAbove: 16_000_000 },
        }),
      ],
      diagnosticEvents,
    };
  },
};

class TaskSubagentRuntimeScenarioProvider implements ConversationTurnProvider {
  readonly parentProviderTurn = new ParentTaskRequestProviderTurn();
  readonly subagentProviderTurn = new ElapsedCheckpointSubagentProviderTurn();
  readonly quickSubagentProviderTurn = new QuickSubagentProviderTurn();
  private startedTurnCount = 0;

  startConversationTurn(_input: ProviderConversationTurnRequest): ProviderConversationTurn {
    this.startedTurnCount += 1;
    if (this.startedTurnCount === 1) {
      return this.parentProviderTurn;
    }
    if (this.startedTurnCount === 2) {
      return this.subagentProviderTurn;
    }
    if (this.startedTurnCount === 3) {
      return this.quickSubagentProviderTurn;
    }

    throw new Error(`Unexpected task-subagent scenario provider turn ${this.startedTurnCount}.`);
  }
}

class ParentTaskRequestProviderTurn implements ProviderConversationTurn {
  readonly submittedToolResults = new SubmittedToolResultStore();
  taskResultWaitDurationMs = 0;

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    const taskResultWaitStartedAtMs = performance.now();
    yield {
      type: "tool_calls_requested",
      requestedToolCalls: [
        {
          toolCallId: "call_explore_elapsed",
          toolCallRequest: {
            toolName: "task",
            subagentName: "explore",
            subagentDescription: "map deterministic runtime fixture with elapsed checkpoint",
            subagentPrompt: "Read README.md, then continue if more evidence is needed.",
          },
        },
        {
          toolCallId: "call_explore_quick",
          toolCallRequest: {
            toolName: "task",
            subagentName: "explore",
            subagentDescription: "summarize deterministic runtime fixture quickly",
            subagentPrompt: "Return a concise summary without requesting tools.",
          },
        },
      ],
    };
    await this.submittedToolResults.waitForSubmittedToolResultCount(2);
    this.taskResultWaitDurationMs = performance.now() - taskResultWaitStartedAtMs;
    yield { type: "text_chunk", text: "Task subagent result accepted." };
    yield { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } };
  }

  async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    this.submittedToolResults.appendSubmittedToolResult(input);
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class QuickSubagentProviderTurn implements ProviderConversationTurn {
  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    yield { type: "text_chunk", text: "Quick subagent summary." };
    yield { type: "completed", usage: { total: 8, input: 4, output: 4, reasoning: 0, cache: { read: 0, write: 0 } } };
  }

  async submitToolResult(_input: ProviderToolResultSubmission): Promise<void> {}

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class ElapsedCheckpointSubagentProviderTurn implements ProviderConversationTurn {
  readonly submittedToolResults = new SubmittedToolResultStore();

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    yield {
      type: "tool_call_requested",
      toolCallId: "call_read_readme_first",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    };
    await this.submittedToolResults.waitForSubmittedToolResultCount(1);
    await delayMilliseconds(delayBeforeSecondSubagentToolMilliseconds);
    yield {
      type: "tool_call_requested",
      toolCallId: "call_read_readme_second",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "README.md",
      },
    };
    await this.submittedToolResults.waitForSubmittedToolResultCount(2);
    yield { type: "text_chunk", text: "README.md defines the deterministic task-subagent benchmark fixture." };
    yield { type: "completed", usage: { total: 20, input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } };
  }

  async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    this.submittedToolResults.appendSubmittedToolResult(input);
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class SubmittedToolResultStore {
  readonly submittedToolResults: SubmittedToolResult[] = [];
  private readonly submittedToolResultWaiters: Array<{
    submittedToolResultCount: number;
    resolveWaiter: () => void;
  }> = [];

  appendSubmittedToolResult(submittedToolResult: SubmittedToolResult): void {
    this.submittedToolResults.push(submittedToolResult);
    this.resolveSubmittedToolResultWaiters();
  }

  waitForSubmittedToolResultCount(submittedToolResultCount: number): Promise<void> {
    if (this.submittedToolResults.length >= submittedToolResultCount) {
      return Promise.resolve();
    }

    return new Promise((resolveWaiter) => {
      this.submittedToolResultWaiters.push({ submittedToolResultCount, resolveWaiter });
    });
  }

  private resolveSubmittedToolResultWaiters(): void {
    for (const waiter of this.submittedToolResultWaiters) {
      if (this.submittedToolResults.length >= waiter.submittedToolResultCount) {
        waiter.resolveWaiter();
      }
    }
  }
}

async function createTaskSubagentRuntimeWorkspace(input: {
  runOutputDirectoryPath: string;
  iterationIndex: number;
  isWarmup: boolean;
}): Promise<string> {
  const workspaceRootPath = resolve(
    input.runOutputDirectoryPath,
    "task-subagent-runtime",
    `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
  );
  await mkdir(workspaceRootPath, { recursive: true });
  await writeFile(
    join(workspaceRootPath, "README.md"),
    [
      "# Task Subagent Runtime Fixture",
      "",
      "This fixture gives the Explorer subagent one deterministic file to inspect.",
      "The second requested child tool should be converted into an elapsed-time checkpoint.",
    ].join("\n"),
    "utf8",
  );
  return workspaceRootPath;
}

async function collectAssistantResponseEvents(
  activeConversationTurn: ReturnType<AssistantConversationRuntime["startConversationTurn"]>,
): Promise<readonly AssistantResponseEvent[]> {
  const assistantResponseEvents: AssistantResponseEvent[] = [];
  for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
    assistantResponseEvents.push(assistantResponseEvent);
  }
  return assistantResponseEvents;
}

function listCompletedTaskToolResults(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): CompletedTaskToolResultConversationSessionEntry[] {
  return conversationSessionEntries.filter(
    (conversationSessionEntry): conversationSessionEntry is CompletedTaskToolResultConversationSessionEntry =>
      conversationSessionEntry.entryKind === "completed_tool_result" && conversationSessionEntry.toolCallDetail.toolName === "task",
  );
}

function readCompletedTaskToolResult(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  toolCallId: string;
  diagnosticEvents: readonly BuliDiagnosticLogEvent[];
}): CompletedTaskToolResultConversationSessionEntry {
  const completedTaskToolResult = listCompletedTaskToolResults(input.conversationSessionEntries).find((conversationSessionEntry) =>
    conversationSessionEntry.toolCallId === input.toolCallId
  );
  if (!completedTaskToolResult) {
    throw new Error(
      `Task-subagent runtime scenario did not produce a completed task tool result for ${input.toolCallId}. Entries: ${JSON.stringify(input.conversationSessionEntries.map(summarizeConversationSessionEntry))}. Diagnostics: ${JSON.stringify(input.diagnosticEvents.map(summarizeDiagnosticEvent))}`,
    );
  }

  return completedTaskToolResult;
}

function sumToolResultTextLength(toolResultEntries: readonly CompletedTaskToolResultConversationSessionEntry[]): number {
  return toolResultEntries.reduce((totalTextLength, toolResultEntry) => totalTextLength + toolResultEntry.toolResultText.length, 0);
}

function summarizeConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): string {
  if (
    conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result"
  ) {
    return `${conversationSessionEntry.entryKind}:${conversationSessionEntry.toolCallId}:${conversationSessionEntry.toolCallDetail.toolName}`;
  }

  if (conversationSessionEntry.entryKind === "tool_call") {
    return `${conversationSessionEntry.entryKind}:${conversationSessionEntry.toolCallId}:${conversationSessionEntry.toolCallRequest.toolName}`;
  }

  return conversationSessionEntry.entryKind;
}

function summarizeDiagnosticEvent(diagnosticEvent: BuliDiagnosticLogEvent): string {
  return `${diagnosticEvent.subsystem}:${diagnosticEvent.eventName}:${JSON.stringify(diagnosticEvent.fields ?? {})}`;
}

function sumDiagnosticDurationMs(diagnosticEvents: readonly BuliDiagnosticLogEvent[]): number {
  return diagnosticEvents.reduce(
    (totalDurationMs, diagnosticEvent) => totalDurationMs + readNumberField(diagnosticEvent.fields, "durationMs"),
    0,
  );
}

function listTerminalTaskSubagentDiagnosticEvents(
  diagnosticEvents: readonly BuliDiagnosticLogEvent[],
): readonly BuliDiagnosticLogEvent[] {
  return diagnosticEvents.filter((diagnosticEvent) =>
    diagnosticEvent.subsystem === "engine" && diagnosticEvent.eventName === "tool_call.task_subagent_finished"
  );
}

function countParentVisibleFailedTaskResults(terminalTaskSubagentDiagnosticEvents: readonly BuliDiagnosticLogEvent[]): number {
  return terminalTaskSubagentDiagnosticEvents.filter((diagnosticEvent) =>
    readStringField(diagnosticEvent.fields, "parentVisibleToolResultKind") === "failed"
  ).length;
}

function countRequestedToolsAfterCheckpointFailures(
  terminalTaskSubagentDiagnosticEvents: readonly BuliDiagnosticLogEvent[],
): number {
  return terminalTaskSubagentDiagnosticEvents.filter((diagnosticEvent) =>
    readStringField(diagnosticEvent.fields, "failureKind") === "requested_tools_after_checkpoint"
  ).length;
}

function countCompletedCheckpointTaskResults(terminalTaskSubagentDiagnosticEvents: readonly BuliDiagnosticLogEvent[]): number {
  return terminalTaskSubagentDiagnosticEvents.filter((diagnosticEvent) =>
    readStringField(diagnosticEvent.fields, "parentVisibleToolResultKind") === "completed" &&
    readStringField(diagnosticEvent.fields, "checkpointReason") !== undefined
  ).length;
}

function readNumberField(fields: BuliDiagnosticLogEvent["fields"] | undefined, fieldName: string): number {
  const value = fields?.[fieldName];
  return typeof value === "number" ? value : 0;
}

function readStringField(fields: BuliDiagnosticLogEvent["fields"] | undefined, fieldName: string): string | undefined {
  const value = fields?.[fieldName];
  return typeof value === "string" ? value : undefined;
}

function readStringArrayField(fields: BuliDiagnosticLogEvent["fields"] | undefined, fieldName: string): readonly string[] | undefined {
  const value = fields?.[fieldName];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }

  return value;
}

function delayMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
