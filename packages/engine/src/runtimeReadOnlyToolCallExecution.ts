import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ToolCallRequest,
  type WorkspaceInspectionToolCallRequest,
  type WorkspaceInspectionToolRequestName,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { WorkspaceCodebaseKnowledgeIndex } from "./codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts";
import type { ProviderConversationTurn } from "./provider.ts";
import type { ProjectInstructionTracker } from "./projectInstructions.ts";
import {
  createReadOnlyToolCallExecutionKey,
  createSameStepDuplicateReadOnlyToolResultText,
} from "./readOnlyToolCallCoalescing.ts";
import {
  RuntimeReadOnlyToolCallConcurrencyLimiter,
  type RuntimeReadOnlyToolCallConcurrencyCategory,
} from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { runGlobToolCall } from "./tools/globTool.ts";
import { runGrepToolCall } from "./tools/grepTool.ts";
import { runLocateCodebaseSymbolsToolCall } from "./tools/locateCodebaseSymbolsTool.ts";
import { runReadToolCall } from "./tools/readTool.ts";
import type { ToolCallOutcome } from "./tools/toolCallOutcome.ts";

export type AutoApprovedReadOnlyToolCallRequest = WorkspaceInspectionToolCallRequest;

type AutoApprovedReadOnlyToolName = WorkspaceInspectionToolRequestName;
type SingleReadOnlyToolName = AutoApprovedReadOnlyToolName;
type AutoApprovedReadOnlyToolCallRequestByName<ToolName extends AutoApprovedReadOnlyToolName> = Extract<
  AutoApprovedReadOnlyToolCallRequest,
  { toolName: ToolName }
>;

type AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName extends AutoApprovedReadOnlyToolName> = {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequestByName<ToolName>;
  toolCallId: string;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  workspaceCodebaseKnowledgeIndex?: WorkspaceCodebaseKnowledgeIndex | undefined;
  abortSignal: AbortSignal;
};

type AutoApprovedReadOnlyToolCallExecutor<ToolName extends AutoApprovedReadOnlyToolName> = {
  runToolCall(input: AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName>): Promise<ToolCallOutcome>;
};

const autoApprovedReadOnlyToolCallExecutorByName: {
  readonly [ToolName in AutoApprovedReadOnlyToolName]: AutoApprovedReadOnlyToolCallExecutor<ToolName>;
} = {
  read: {
    runToolCall: runReadAutoApprovedReadOnlyToolCall,
  },
  glob: {
    runToolCall: runGlobAutoApprovedReadOnlyToolCall,
  },
  grep: {
    runToolCall: runGrepAutoApprovedReadOnlyToolCall,
  },
  locate_codebase_symbols: {
    runToolCall: runLocateCodebaseSymbolsAutoApprovedReadOnlyToolCall,
  },
};

export type StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  toolCallId: string;
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  conversationHistory?: InMemoryConversationHistory | undefined;
  workspaceCodebaseKnowledgeIndex?: WorkspaceCodebaseKnowledgeIndex | undefined;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  readOnlyToolCallConcurrencyLimiter?: RuntimeReadOnlyToolCallConcurrencyLimiter;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type AutoApprovedReadOnlyRequestedToolCall = {
  toolCallId: string;
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
};

export type StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallsInput = Omit<
  StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput,
  "toolCallId" | "toolCallRequest"
> & {
  requestedToolCalls: readonly AutoApprovedReadOnlyRequestedToolCall[];
};

type PendingAutoApprovedReadOnlyToolCallExecution = AutoApprovedReadOnlyRequestedToolCall & {
  toolCallPartId: string;
  toolCallStartedAtMs: number;
  startedToolCallDetail: ReturnType<typeof createStartedToolCallDetailFromRequest>;
};

type FulfilledAutoApprovedReadOnlyToolCallExecution = {
  executionResultKind: "fulfilled";
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  toolCallOutcome: ToolCallOutcome;
};

type RejectedAutoApprovedReadOnlyToolCallExecution = {
  executionResultKind: "rejected";
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  error: unknown;
};

type SettledAutoApprovedReadOnlyToolCallExecution =
  | FulfilledAutoApprovedReadOnlyToolCallExecution
  | RejectedAutoApprovedReadOnlyToolCallExecution;

type PendingAutoApprovedReadOnlyToolCallExecutionGroup = {
  canonicalPendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  duplicatePendingToolCallExecutions: readonly PendingAutoApprovedReadOnlyToolCallExecution[];
};

type SubmittedAutoApprovedReadOnlyToolResultKind = "completed" | "failed";

type RecordedAutoApprovedReadOnlyToolCallOutcome = {
  assistantResponseEvent: AssistantResponseEvent;
  providerToolResult: {
    toolCallId: string;
    toolResultText: string;
    toolResultKind: SubmittedAutoApprovedReadOnlyToolResultKind;
  };
};

type PendingProviderToolResultSubmission = {
  toolCallId: string;
  submissionOutcome: Promise<ProviderToolResultSubmissionOutcome>;
};

type ProviderToolResultSubmissionOutcome =
  | {
    submissionStatus: "fulfilled";
    toolCallId: string;
  }
  | {
    submissionStatus: "rejected";
    toolCallId: string;
    error: unknown;
  };

export async function* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall(
  input: StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const { toolCallId, toolCallRequest, ...sharedInput } = input;

  yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
    ...sharedInput,
    requestedToolCalls: [{ toolCallId, toolCallRequest }],
  });
}

export async function* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls(
  input: StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallsInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Cannot execute an empty read-only tool-call batch.");
  }

  const readOnlyToolCallConcurrencyLimiter = input.readOnlyToolCallConcurrencyLimiter ?? new RuntimeReadOnlyToolCallConcurrencyLimiter({
    diagnosticLogger: input.diagnosticLogger,
  });

  const pendingToolCallExecutions = input.requestedToolCalls.map((requestedToolCall): PendingAutoApprovedReadOnlyToolCallExecution => ({
    ...requestedToolCall,
    toolCallPartId: randomUUID(),
    toolCallStartedAtMs: Date.now(),
    startedToolCallDetail: createStartedToolCallDetailFromRequest(requestedToolCall.toolCallRequest),
  }));

  for (const pendingToolCallExecution of pendingToolCallExecutions) {
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: pendingToolCallExecution.toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: pendingToolCallExecution.toolCallId,
        toolCallStatus: "running",
        toolCallStartedAtMs: pendingToolCallExecution.toolCallStartedAtMs,
        toolCallDetail: pendingToolCallExecution.startedToolCallDetail,
      }),
    }));
  }

  input.throwIfConversationTurnInterrupted();
  const pendingToolCallExecutionGroups = groupPendingAutoApprovedReadOnlyToolCallExecutions(pendingToolCallExecutions);
  const pendingToolCallExecutionGroupByCanonicalPartId = new Map(
    pendingToolCallExecutionGroups.map((pendingToolCallExecutionGroup) => [
      pendingToolCallExecutionGroup.canonicalPendingToolCallExecution.toolCallPartId,
      pendingToolCallExecutionGroup,
    ]),
  );
  const activeToolCallExecutionPromisesByPartId = new Map(
    pendingToolCallExecutionGroups.map((pendingToolCallExecutionGroup) => [
      pendingToolCallExecutionGroup.canonicalPendingToolCallExecution.toolCallPartId,
      runPendingAutoApprovedReadOnlyToolCallExecution({
        pendingToolCallExecution: pendingToolCallExecutionGroup.canonicalPendingToolCallExecution,
        readOnlyToolCallConcurrencyLimiter,
        workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
    ]),
  );
  const pendingProviderToolResultSubmissions: PendingProviderToolResultSubmission[] = [];

  try {
    while (activeToolCallExecutionPromisesByPartId.size > 0) {
      input.throwIfConversationTurnInterrupted();
      const settledToolCallExecution = await Promise.race(activeToolCallExecutionPromisesByPartId.values());
      if (!activeToolCallExecutionPromisesByPartId.delete(settledToolCallExecution.pendingToolCallExecution.toolCallPartId)) {
        throw new Error(
          `Received a completed read-only tool-call execution for inactive part ${settledToolCallExecution.pendingToolCallExecution.toolCallPartId}.`,
        );
      }
      input.throwIfConversationTurnInterrupted();

      if (settledToolCallExecution.executionResultKind === "rejected") {
        throw settledToolCallExecution.error;
      }

      const pendingToolCallExecutionGroup = pendingToolCallExecutionGroupByCanonicalPartId.get(
        settledToolCallExecution.pendingToolCallExecution.toolCallPartId,
      );
      if (!pendingToolCallExecutionGroup) {
        throw new Error(
          `Missing read-only tool-call execution group for canonical part ${settledToolCallExecution.pendingToolCallExecution.toolCallPartId}.`,
        );
      }

      for (const { pendingToolCallExecution, toolCallOutcome } of listToolCallOutcomesForSettledReadOnlyExecution({
        settledToolCallExecution,
        pendingToolCallExecutionGroup,
      })) {
        const recordedToolCallOutcome = recordAutoApprovedReadOnlyToolCallOutcome({
          assistantResponseMessageId: input.assistantResponseMessageId,
          pendingToolCallExecution,
          toolCallOutcome,
          toolResultSessionRecorder: input.toolResultSessionRecorder,
          diagnosticLogger: input.diagnosticLogger,
        });
        yield recordedToolCallOutcome.assistantResponseEvent;
        pendingProviderToolResultSubmissions.push(startProviderToolResultSubmission({
          providerConversationTurn: input.providerConversationTurn,
          providerToolResult: recordedToolCallOutcome.providerToolResult,
          conversationTurnId: input.conversationTurnId,
          diagnosticLogger: input.diagnosticLogger,
        }));
      }
    }
  } catch (error) {
    await waitForPendingProviderToolResultSubmissionsToSettle(pendingProviderToolResultSubmissions);
    throw error;
  }

  await throwIfAnyProviderToolResultSubmissionFailed(pendingProviderToolResultSubmissions);
}

function startProviderToolResultSubmission(input: {
  providerConversationTurn: ProviderConversationTurn;
  providerToolResult: RecordedAutoApprovedReadOnlyToolCallOutcome["providerToolResult"];
  conversationTurnId: string;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): PendingProviderToolResultSubmission {
  const toolCallId = input.providerToolResult.toolCallId;
  return {
    toolCallId,
    submissionOutcome: submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId,
      toolResultText: input.providerToolResult.toolResultText,
      toolResultKind: input.providerToolResult.toolResultKind,
      diagnosticLogger: input.diagnosticLogger,
    }).then(
      (): ProviderToolResultSubmissionOutcome => ({ submissionStatus: "fulfilled", toolCallId }),
      (error: unknown): ProviderToolResultSubmissionOutcome => ({ submissionStatus: "rejected", toolCallId, error }),
    ),
  };
}

async function throwIfAnyProviderToolResultSubmissionFailed(
  pendingProviderToolResultSubmissions: readonly PendingProviderToolResultSubmission[],
): Promise<void> {
  const providerToolResultSubmissionOutcomes = await waitForPendingProviderToolResultSubmissionsToSettle(
    pendingProviderToolResultSubmissions,
  );
  const rejectedProviderToolResultSubmission = providerToolResultSubmissionOutcomes.find((submissionOutcome) =>
    submissionOutcome.submissionStatus === "rejected"
  );
  if (rejectedProviderToolResultSubmission?.submissionStatus === "rejected") {
    throw rejectedProviderToolResultSubmission.error;
  }
}

function waitForPendingProviderToolResultSubmissionsToSettle(
  pendingProviderToolResultSubmissions: readonly PendingProviderToolResultSubmission[],
): Promise<ProviderToolResultSubmissionOutcome[]> {
  return Promise.all(
    pendingProviderToolResultSubmissions.map((pendingProviderToolResultSubmission) =>
      pendingProviderToolResultSubmission.submissionOutcome
    ),
  );
}

function groupPendingAutoApprovedReadOnlyToolCallExecutions(
  pendingToolCallExecutions: readonly PendingAutoApprovedReadOnlyToolCallExecution[],
): PendingAutoApprovedReadOnlyToolCallExecutionGroup[] {
  const pendingToolCallExecutionGroupsByKey = new Map<string, PendingAutoApprovedReadOnlyToolCallExecution[]>();
  for (const pendingToolCallExecution of pendingToolCallExecutions) {
    const executionKey = createReadOnlyToolCallExecutionKey(pendingToolCallExecution.toolCallRequest);
    const pendingToolCallExecutionGroup = pendingToolCallExecutionGroupsByKey.get(executionKey);
    if (pendingToolCallExecutionGroup) {
      pendingToolCallExecutionGroup.push(pendingToolCallExecution);
      continue;
    }

    pendingToolCallExecutionGroupsByKey.set(executionKey, [pendingToolCallExecution]);
  }

  return [...pendingToolCallExecutionGroupsByKey.values()].map((pendingToolCallExecutionGroup) => {
    const [canonicalPendingToolCallExecution, ...duplicatePendingToolCallExecutions] = pendingToolCallExecutionGroup;
    if (!canonicalPendingToolCallExecution) {
      throw new Error("Cannot create an empty read-only tool-call execution group.");
    }

    return {
      canonicalPendingToolCallExecution,
      duplicatePendingToolCallExecutions,
    };
  });
}

function listToolCallOutcomesForSettledReadOnlyExecution(input: {
  settledToolCallExecution: FulfilledAutoApprovedReadOnlyToolCallExecution;
  pendingToolCallExecutionGroup: PendingAutoApprovedReadOnlyToolCallExecutionGroup;
}): Array<{
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  toolCallOutcome: ToolCallOutcome;
}> {
  return [
    {
      pendingToolCallExecution: input.pendingToolCallExecutionGroup.canonicalPendingToolCallExecution,
      toolCallOutcome: input.settledToolCallExecution.toolCallOutcome,
    },
    ...input.pendingToolCallExecutionGroup.duplicatePendingToolCallExecutions.map((duplicatePendingToolCallExecution) => ({
      pendingToolCallExecution: duplicatePendingToolCallExecution,
      toolCallOutcome: createSameStepDuplicateReadOnlyToolCallOutcome({
        canonicalPendingToolCallExecution: input.pendingToolCallExecutionGroup.canonicalPendingToolCallExecution,
        canonicalToolCallOutcome: input.settledToolCallExecution.toolCallOutcome,
      }),
    })),
  ];
}

function createSameStepDuplicateReadOnlyToolCallOutcome(input: {
  canonicalPendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  canonicalToolCallOutcome: ToolCallOutcome;
}): ToolCallOutcome {
  if (input.canonicalToolCallOutcome.outcomeKind === "completed") {
    return {
      outcomeKind: "completed",
      toolCallDetail: input.canonicalToolCallOutcome.toolCallDetail,
      toolResultText: createSameStepDuplicateReadOnlyToolResultText({
        toolName: input.canonicalToolCallOutcome.toolCallDetail.toolName,
        previousToolCallId: input.canonicalPendingToolCallExecution.toolCallId,
      }),
      durationMilliseconds: 0,
    };
  }

  return {
    ...input.canonicalToolCallOutcome,
    durationMilliseconds: 0,
  };
}

async function runPendingAutoApprovedReadOnlyToolCallExecution(input: {
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  workspaceCodebaseKnowledgeIndex?: WorkspaceCodebaseKnowledgeIndex | undefined;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
}): Promise<SettledAutoApprovedReadOnlyToolCallExecution> {
  try {
    return {
      executionResultKind: "fulfilled",
      pendingToolCallExecution: input.pendingToolCallExecution,
      toolCallOutcome: await runAutoApprovedReadOnlyToolCall({
        toolCallRequest: input.pendingToolCallExecution.toolCallRequest,
        toolCallId: input.pendingToolCallExecution.toolCallId,
        readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
        ...(input.workspaceCodebaseKnowledgeIndex ? { workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex } : {}),
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
    };
  } catch (error) {
    return {
      executionResultKind: "rejected",
      pendingToolCallExecution: input.pendingToolCallExecution,
      error,
    };
  }
}

function recordAutoApprovedReadOnlyToolCallOutcome(input: {
  assistantResponseMessageId: string;
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  toolCallOutcome: ToolCallOutcome;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): RecordedAutoApprovedReadOnlyToolCallOutcome {
  if (input.toolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.pendingToolCallExecution.toolCallId,
      toolCallDetail: input.toolCallOutcome.toolCallDetail,
      toolResultText: input.toolCallOutcome.toolResultText,
    });
    return {
      assistantResponseEvent: logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: input.pendingToolCallExecution.toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.pendingToolCallExecution.toolCallId,
          toolCallStatus: "completed",
          toolCallStartedAtMs: input.pendingToolCallExecution.toolCallStartedAtMs,
          toolCallDetail: input.toolCallOutcome.toolCallDetail,
          durationMs: input.toolCallOutcome.durationMilliseconds,
        }),
      })),
      providerToolResult: {
        toolCallId: input.pendingToolCallExecution.toolCallId,
        toolResultText: input.toolCallOutcome.toolResultText,
        toolResultKind: "completed",
      },
    };
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.pendingToolCallExecution.toolCallId,
    toolCallDetail: input.toolCallOutcome.toolCallDetail,
    toolResultText: input.toolCallOutcome.toolResultText,
    failureExplanation: input.toolCallOutcome.failureExplanation,
  });
  return {
    assistantResponseEvent: logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: input.pendingToolCallExecution.toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.pendingToolCallExecution.toolCallId,
        toolCallStatus: "failed",
        toolCallStartedAtMs: input.pendingToolCallExecution.toolCallStartedAtMs,
        toolCallDetail: input.toolCallOutcome.toolCallDetail,
        errorText: input.toolCallOutcome.failureExplanation,
        durationMs: input.toolCallOutcome.durationMilliseconds,
      }),
    })),
    providerToolResult: {
      toolCallId: input.pendingToolCallExecution.toolCallId,
      toolResultText: input.toolCallOutcome.toolResultText,
      toolResultKind: "failed",
    },
  };
}

export function isAutoApprovedReadOnlyToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is AutoApprovedReadOnlyToolCallRequest {
  return isWorkspaceInspectionToolCallRequest(toolCallRequest);
}

function runAutoApprovedReadOnlyToolCall(input: {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  toolCallId: string;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  workspaceCodebaseKnowledgeIndex?: WorkspaceCodebaseKnowledgeIndex | undefined;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  const toolCallExecutor = resolveAutoApprovedReadOnlyToolCallExecutor(input.toolCallRequest);
  return toolCallExecutor.runToolCall(input);
}

function resolveAutoApprovedReadOnlyToolCallExecutor<ToolName extends AutoApprovedReadOnlyToolName>(
  toolCallRequest: AutoApprovedReadOnlyToolCallRequestByName<ToolName>,
): AutoApprovedReadOnlyToolCallExecutor<ToolName> {
  return autoApprovedReadOnlyToolCallExecutorByName[toolCallRequest.toolName] as AutoApprovedReadOnlyToolCallExecutor<ToolName>;
}

function runReadAutoApprovedReadOnlyToolCall(
  input: AutoApprovedReadOnlyToolCallExecutorRunInput<"read">,
): Promise<ToolCallOutcome> {
  return runSingleAutoApprovedReadOnlyToolCall(input, "read", () =>
    runReadToolCall({
      readToolCallRequest: input.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
      abortSignal: input.abortSignal,
    })
  );
}

function runGlobAutoApprovedReadOnlyToolCall(
  input: AutoApprovedReadOnlyToolCallExecutorRunInput<"glob">,
): Promise<ToolCallOutcome> {
  return runSingleAutoApprovedReadOnlyToolCall(input, "glob", () =>
    runGlobToolCall({
      globToolCallRequest: input.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    })
  );
}

function runGrepAutoApprovedReadOnlyToolCall(
  input: AutoApprovedReadOnlyToolCallExecutorRunInput<"grep">,
): Promise<ToolCallOutcome> {
  return runSingleAutoApprovedReadOnlyToolCall(input, "grep", () =>
    runGrepToolCall({
      grepToolCallRequest: input.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    })
  );
}

function runLocateCodebaseSymbolsAutoApprovedReadOnlyToolCall(
  input: AutoApprovedReadOnlyToolCallExecutorRunInput<"locate_codebase_symbols">,
): Promise<ToolCallOutcome> {
  if (!input.workspaceCodebaseKnowledgeIndex) {
    throw new Error("Codebase knowledge index is not available for locate_codebase_symbols.");
  }
  const workspaceCodebaseKnowledgeIndex = input.workspaceCodebaseKnowledgeIndex;

  return runSingleAutoApprovedReadOnlyToolCall(input, "locate_codebase_symbols", () =>
    runLocateCodebaseSymbolsToolCall({
      locateCodebaseSymbolsToolCallRequest: input.toolCallRequest,
      workspaceCodebaseKnowledgeIndex,
      abortSignal: input.abortSignal,
    })
  );
}

function runSingleAutoApprovedReadOnlyToolCall<ToolName extends SingleReadOnlyToolName>(
  input: AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName>,
  toolName: ToolName,
  runToolCall: () => Promise<ToolCallOutcome>,
): Promise<ToolCallOutcome> {
  const concurrencyCategory = resolveReadOnlyToolCallConcurrencyCategory(toolName);
  return input.readOnlyToolCallConcurrencyLimiter.run(
    runToolCall,
    {
      toolCallId: input.toolCallId,
      toolName,
    },
    concurrencyCategory,
  );
}

function resolveReadOnlyToolCallConcurrencyCategory(
  toolName: SingleReadOnlyToolName,
): RuntimeReadOnlyToolCallConcurrencyCategory {
  if (toolName === "read") {
    return "read";
  }

  if (toolName === "locate_codebase_symbols") {
    return "knowledge";
  }

  return "search";
}
