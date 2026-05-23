import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantResponseEvent, BuliDiagnosticLogEvent, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import { ProjectInstructionTracker, type ProjectInstructionFile } from "../src/projectInstructions.ts";
import type { ProviderConversationTurn, ProviderToolResultSubmission } from "../src/provider.ts";
import {
  type AutoApprovedReadOnlyRequestedToolCall,
  isAutoApprovedReadOnlyToolCallRequest,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "../src/runtimeReadOnlyToolCallExecution.ts";
import { RuntimeReadOnlyToolCallConcurrencyLimiter } from "../src/runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import { RuntimeToolResultSessionRecorder } from "../src/runtimeToolResultSessionRecorder.ts";

class RecordingProviderConversationTurn implements ProviderConversationTurn {
  readonly submittedToolResults: ProviderToolResultSubmission[] = [];

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {}

  async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    this.submittedToolResults.push(input);
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class DeferredCompletion {
  readonly promise: Promise<void>;
  private resolvePromise: (() => void) | undefined;

  constructor() {
    this.promise = new Promise<void>((resolvePromise) => {
      this.resolvePromise = resolvePromise;
    });
  }

  complete(): void {
    this.resolvePromise?.();
  }
}

class BlockingProjectInstructionTracker extends ProjectInstructionTracker {
  readonly expectedActiveDiscoveryCount: number;
  readonly expectedActiveDiscoveriesReached = new DeferredCompletion();
  readonly releaseDiscoveries = new DeferredCompletion();
  startedDiscoveryCount = 0;
  activeDiscoveryCount = 0;
  maximumActiveDiscoveryCount = 0;

  constructor(input: { workspaceRootPath: string; expectedActiveDiscoveryCount: number }) {
    super({ workspaceRootPath: input.workspaceRootPath });
    this.expectedActiveDiscoveryCount = input.expectedActiveDiscoveryCount;
  }

  override async discoverNewProjectInstructionsForDirectory(): Promise<readonly ProjectInstructionFile[]> {
    this.startedDiscoveryCount += 1;
    this.activeDiscoveryCount += 1;
    this.maximumActiveDiscoveryCount = Math.max(this.maximumActiveDiscoveryCount, this.activeDiscoveryCount);
    if (this.activeDiscoveryCount === this.expectedActiveDiscoveryCount) {
      this.expectedActiveDiscoveriesReached.complete();
    }

    await this.releaseDiscoveries.promise;
    this.activeDiscoveryCount -= 1;
    return [];
  }
}

async function collectReadOnlyToolCallEvents(input: Parameters<
  typeof streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall
>[0]): Promise<AssistantResponseEvent[]> {
  const assistantResponseEvents: AssistantResponseEvent[] = [];
  for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall(input)) {
    assistantResponseEvents.push(assistantResponseEvent);
  }
  return assistantResponseEvents;
}

async function collectReadOnlyToolCallBatchEvents(input: Parameters<
  typeof streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls
>[0]): Promise<AssistantResponseEvent[]> {
  const assistantResponseEvents: AssistantResponseEvent[] = [];
  for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls(input)) {
    assistantResponseEvents.push(assistantResponseEvent);
  }
  return assistantResponseEvents;
}

test("isAutoApprovedReadOnlyToolCallRequest accepts only read-only tool calls", () => {
  expect(isAutoApprovedReadOnlyToolCallRequest({ toolName: "read", readTargetPath: "notes.txt" })).toBe(true);
  expect(isAutoApprovedReadOnlyToolCallRequest({ toolName: "glob", globPattern: "**/*.ts" })).toBe(true);
  expect(isAutoApprovedReadOnlyToolCallRequest({ toolName: "grep", regexPattern: "TODO" })).toBe(true);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "bash",
    shellCommand: "pwd",
    commandDescription: "Show working directory",
  })).toBe(false);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "edit",
    editTargetPath: "notes.txt",
    oldString: "old",
    newString: "new",
  })).toBe(false);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "write",
    writeTargetPath: "notes.txt",
    fileContent: "new\n",
  })).toBe(false);
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall records and submits completed read results", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-read-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\n", "utf8");
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Read notes",
        modelFacingPromptText: "Read notes",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_read_1",
        toolCallRequest: {
          toolName: "read",
          readTargetPath: "notes.txt",
        },
      },
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEvents = await collectReadOnlyToolCallEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_read_1",
    toolCallRequest: {
      toolName: "read",
      readTargetPath: "notes.txt",
    },
    workspaceRootPath,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_message_part_updated",
  ]);
  expect(assistantResponseEvents[0]).toMatchObject({
    type: "assistant_message_part_added",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "running",
      toolCallDetail: { toolName: "read", readFilePath: "notes.txt" },
    },
  });
  expect(assistantResponseEvents[1]).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "completed",
      toolCallDetail: { toolName: "read", readFilePath: "notes.txt" },
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_read_1",
      toolResultText: expect.stringContaining("1: alpha"),
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "completed_tool_result",
    toolCallId: "call_read_1",
    toolCallDetail: { toolName: "read", readFilePath: "notes.txt" },
    toolResultText: expect.stringContaining("2: beta"),
  });
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "assistant_response_event.emitted").map(
    (diagnosticEvent) => diagnosticEvent.fields?.["toolCallStatus"],
  )).toEqual(["running", "completed"]);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "provider_turn.tool_result_submitted"))
    .toEqual([
      expect.objectContaining({
        subsystem: "engine",
        fields: expect.objectContaining({
          toolCallId: "call_read_1",
          toolResultKind: "completed",
          toolResultTextLength: providerConversationTurn.submittedToolResults[0]?.toolResultText.length,
        }),
      }),
    ]);
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall records and submits completed glob results", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-glob-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "src", "app.ts"), "export const app = true;\n", "utf8");
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Find TypeScript files",
        modelFacingPromptText: "Find TypeScript files",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_glob_1",
        toolCallRequest: {
          toolName: "glob",
          globPattern: "**/*.ts",
        },
      },
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEvents = await collectReadOnlyToolCallEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_glob_1",
    toolCallRequest: {
      toolName: "glob",
      globPattern: "**/*.ts",
    },
    workspaceRootPath,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_message_part_updated",
  ]);
  expect(assistantResponseEvents[1]).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "completed",
      toolCallDetail: { toolName: "glob", globPattern: "**/*.ts" },
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_glob_1",
      toolResultText: expect.stringContaining("src/app.ts"),
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "completed_tool_result",
    toolCallId: "call_glob_1",
    toolCallDetail: { toolName: "glob", globPattern: "**/*.ts" },
    toolResultText: expect.stringContaining("src/app.ts"),
  });
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall records and submits failed grep results", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-grep-"));
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Search notes",
        modelFacingPromptText: "Search notes",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_grep_1",
        toolCallRequest: {
          toolName: "grep",
          regexPattern: "[",
        },
      },
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEvents = await collectReadOnlyToolCallEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_grep_1",
    toolCallRequest: {
      toolName: "grep",
      regexPattern: "[",
    },
    workspaceRootPath,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
  });

  expect(assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type)).toEqual([
    "assistant_message_part_added",
    "assistant_message_part_updated",
  ]);
  expect(assistantResponseEvents[1]).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "failed",
      toolCallDetail: { toolName: "grep", searchPattern: "[" },
      errorText: expect.stringContaining("Invalid regular expression"),
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_grep_1",
      toolResultText: expect.stringContaining("Grep failed: Invalid regular expression"),
    },
  ]);
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "failed_tool_result",
    toolCallId: "call_grep_1",
    toolCallDetail: { toolName: "grep", searchPattern: "[" },
    toolResultText: expect.stringContaining("Grep failed: Invalid regular expression"),
    failureExplanation: expect.stringContaining("Invalid regular expression"),
  });
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls limits concurrent execution and submits ordered results", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-concurrency-"));
  const requestedToolCalls: AutoApprovedReadOnlyRequestedToolCall[] = Array.from({ length: 5 }, (_, toolCallIndex) => ({
    toolCallId: `call_read_${toolCallIndex + 1}`,
    toolCallRequest: {
      toolName: "read",
      readTargetPath: `notes-${toolCallIndex + 1}.txt`,
    },
  }));
  await Promise.all(requestedToolCalls.map((_requestedToolCall, toolCallIndex) =>
    writeFile(join(workspaceRootPath, `notes-${toolCallIndex + 1}.txt`), `note ${toolCallIndex + 1}\n`, "utf8")
  ));
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const projectInstructionTracker = new BlockingProjectInstructionTracker({
    workspaceRootPath,
    expectedActiveDiscoveryCount: 2,
  });
  const readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter({
    maximumConcurrentReadOnlyToolCalls: 2,
  });
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Read notes",
        modelFacingPromptText: "Read notes",
      },
      ...requestedToolCalls.map((requestedToolCall) => ({
        entryKind: "tool_call" as const,
        toolCallId: requestedToolCall.toolCallId,
        toolCallRequest: requestedToolCall.toolCallRequest,
      })),
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEventsPromise = collectReadOnlyToolCallBatchEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    requestedToolCalls,
    workspaceRootPath,
    projectInstructionTracker,
    toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter,
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
  });

  await waitForPromiseWithTimeout({
    promise: projectInstructionTracker.expectedActiveDiscoveriesReached.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Read-only tool calls did not reach the expected active concurrency."),
  });
  expect(projectInstructionTracker.startedDiscoveryCount).toBe(2);
  expect(projectInstructionTracker.activeDiscoveryCount).toBe(2);

  projectInstructionTracker.releaseDiscoveries.complete();
  const assistantResponseEvents = await assistantResponseEventsPromise;

  expect(projectInstructionTracker.startedDiscoveryCount).toBe(requestedToolCalls.length);
  expect(projectInstructionTracker.maximumActiveDiscoveryCount).toBe(2);
  expect(providerConversationTurn.submittedToolResults.map((submittedToolResult) => submittedToolResult.toolCallId)).toEqual(
    requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId),
  );
  expect(assistantResponseEvents.flatMap((assistantResponseEvent) =>
    (assistantResponseEvent.type === "assistant_message_part_added" || assistantResponseEvent.type === "assistant_message_part_updated") &&
      assistantResponseEvent.part.partKind === "assistant_tool_call"
      ? [`${assistantResponseEvent.part.toolCallId}:${assistantResponseEvent.part.toolCallStatus}`]
      : []
  )).toEqual([
    ...requestedToolCalls.map((requestedToolCall) => `${requestedToolCall.toolCallId}:running`),
    ...requestedToolCalls.map((requestedToolCall) => `${requestedToolCall.toolCallId}:completed`),
  ]);
});

async function waitForPromiseWithTimeout(input: {
  promise: Promise<void>;
  timeoutMilliseconds: number;
  createTimeoutError: () => Error;
}): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const timeoutHandle = setTimeout(() => rejectPromise(input.createTimeoutError()), input.timeoutMilliseconds);
    input.promise.then(resolvePromise, rejectPromise).finally(() => clearTimeout(timeoutHandle));
  });
}
