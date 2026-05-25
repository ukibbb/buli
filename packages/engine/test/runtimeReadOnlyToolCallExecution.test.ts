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
import { runReadManyToolCall } from "../src/tools/readManyTool.ts";

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

class BlockingProviderConversationTurn extends RecordingProviderConversationTurn {
  readonly expectedStartedSubmissionCount: number;
  readonly expectedStartedSubmissionsReached = new DeferredCompletion();
  readonly releaseSubmissions = new DeferredCompletion();
  startedSubmissionCount = 0;

  constructor(input: { expectedStartedSubmissionCount: number }) {
    super();
    this.expectedStartedSubmissionCount = input.expectedStartedSubmissionCount;
  }

  override async submitToolResult(input: ProviderToolResultSubmission): Promise<void> {
    this.startedSubmissionCount += 1;
    if (this.startedSubmissionCount === this.expectedStartedSubmissionCount) {
      this.expectedStartedSubmissionsReached.complete();
    }

    await this.releaseSubmissions.promise;
    await super.submitToolResult(input);
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
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "read_many",
    readTargets: [{ readTargetPath: "notes.txt" }],
  })).toBe(true);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "search_many",
    searches: [{ searchKind: "glob", globPattern: "**/*.ts" }],
  })).toBe(true);
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
    toolName: "edit_many",
    edits: [{ editTargetPath: "notes.txt", oldString: "old", newString: "new" }],
  })).toBe(false);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "patch",
    patchText: "*** Begin Patch\n*** End Patch",
  })).toBe(false);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "patch_many",
    patchText: "*** Begin Patch\n*** End Patch",
  })).toBe(false);
  expect(isAutoApprovedReadOnlyToolCallRequest({
    toolName: "write",
    writeTargetPath: "notes.txt",
    fileContent: "new\n",
  })).toBe(false);
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall records read_many partial failures as one completed batch", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-read-many-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\n", "utf8");
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Read many notes",
        modelFacingPromptText: "Read many notes",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_read_many_1",
        toolCallRequest: {
          toolName: "read_many",
          readTargets: [
            { readTargetPath: "notes.txt", offsetLineNumber: 2, maximumLineCount: 1 },
            { readTargetPath: "missing.txt" },
          ],
        },
      },
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEvents = await collectReadOnlyToolCallEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_read_many_1",
    toolCallRequest: {
      toolName: "read_many",
      readTargets: [
        { readTargetPath: "notes.txt", offsetLineNumber: 2, maximumLineCount: 1 },
        { readTargetPath: "missing.txt" },
      ],
    },
    workspaceRootPath,
    toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: new RuntimeReadOnlyToolCallConcurrencyLimiter({
      maximumConcurrentReadOnlyToolCalls: 2,
    }),
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
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
      toolCallDetail: {
        toolName: "read_many",
        requestedReadTargetPaths: ["notes.txt", "missing.txt"],
      },
    },
  });
  expect(assistantResponseEvents[1]).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "completed",
      toolCallDetail: {
        toolName: "read_many",
        completedReadCount: 1,
        failedReadCount: 1,
        readResults: [
          {
            readStatus: "completed",
            readDetail: {
              toolName: "read",
              readFilePath: "notes.txt",
              previewLines: [{ lineNumber: 2, lineText: "beta" }],
            },
          },
          {
            readStatus: "failed",
            readDetail: {
              toolName: "read",
              readFilePath: "missing.txt",
            },
            failureExplanation: expect.stringContaining("File not found: missing.txt"),
          },
        ],
      },
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_read_many_1",
      toolResultText: expect.stringContaining("<summary>1 completed, 1 failed</summary>"),
    },
  ]);
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("2: beta");
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("Read failed: File not found: missing.txt");
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "completed_tool_result",
    toolCallId: "call_read_many_1",
    toolCallDetail: {
      toolName: "read_many",
      completedReadCount: 1,
      failedReadCount: 1,
    },
    toolResultText: expect.stringContaining("<read_many>"),
  });
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall records search_many partial failures as one completed batch", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-search-many-"));
  await mkdir(join(workspaceRootPath, "src"), { recursive: true });
  await writeFile(join(workspaceRootPath, "src", "app.ts"), "export const marker = 'search-many';\n", "utf8");
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Search many files",
        modelFacingPromptText: "Search many files",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_search_many_1",
        toolCallRequest: {
          toolName: "search_many",
          searches: [
            { searchKind: "glob", globPattern: "src/**/*.ts" },
            { searchKind: "grep", regexPattern: "[" },
          ],
        },
      },
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEvents = await collectReadOnlyToolCallEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_search_many_1",
    toolCallRequest: {
      toolName: "search_many",
      searches: [
        { searchKind: "glob", globPattern: "src/**/*.ts" },
        { searchKind: "grep", regexPattern: "[" },
      ],
    },
    workspaceRootPath,
    toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: new RuntimeReadOnlyToolCallConcurrencyLimiter({
      maximumConcurrentReadOnlyToolCalls: 2,
    }),
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
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
      toolCallDetail: {
        toolName: "search_many",
        requestedSearches: [
          { searchKind: "glob", globPattern: "src/**/*.ts" },
          { searchKind: "grep", regexPattern: "[" },
        ],
      },
    },
  });
  expect(assistantResponseEvents[1]).toMatchObject({
    type: "assistant_message_part_updated",
    part: {
      partKind: "assistant_tool_call",
      toolCallStatus: "completed",
      toolCallDetail: {
        toolName: "search_many",
        completedSearchCount: 1,
        failedSearchCount: 1,
        searchResults: [
          {
            searchStatus: "completed",
            searchDetail: {
              toolName: "glob",
              globPattern: "src/**/*.ts",
              matchedPaths: ["src/app.ts"],
            },
          },
          {
            searchStatus: "failed",
            searchDetail: {
              toolName: "grep",
              searchPattern: "[",
            },
            failureExplanation: expect.stringContaining("Invalid regular expression"),
          },
        ],
      },
    },
  });
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_search_many_1",
      toolResultText: expect.stringContaining("<summary>1 completed, 1 failed</summary>"),
    },
  ]);
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("src/app.ts");
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("----- next search result -----");
  expect(providerConversationTurn.submittedToolResults[0]?.toolResultText).toContain("Grep failed:");
  expect(conversationHistory.listConversationSessionEntries().at(-1)).toMatchObject({
    entryKind: "completed_tool_result",
    toolCallId: "call_search_many_1",
    toolCallDetail: {
      toolName: "search_many",
      completedSearchCount: 1,
      failedSearchCount: 1,
    },
    toolResultText: expect.stringContaining("<search_many>"),
  });
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

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls emits fast completions before slower siblings finish", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-fast-completion-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "slow note\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "fast.ts"), "export const fast = true;\n", "utf8");
  const requestedToolCalls: AutoApprovedReadOnlyRequestedToolCall[] = [
    {
      toolCallId: "call_read_slow",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "notes.txt",
      },
    },
    {
      toolCallId: "call_glob_fast",
      toolCallRequest: {
        toolName: "glob",
        globPattern: "src/**/*.ts",
      },
    },
  ];
  const providerConversationTurn = new RecordingProviderConversationTurn();
  const projectInstructionTracker = new BlockingProjectInstructionTracker({
    workspaceRootPath,
    expectedActiveDiscoveryCount: 1,
  });
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Read notes and list source files",
        modelFacingPromptText: "Read notes and list source files",
      },
      ...requestedToolCalls.map((requestedToolCall) => ({
        entryKind: "tool_call" as const,
        toolCallId: requestedToolCall.toolCallId,
        toolCallRequest: requestedToolCall.toolCallRequest,
      })),
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });
  const assistantResponseEventIterator = streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    requestedToolCalls,
    workspaceRootPath,
    projectInstructionTracker,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
  })[Symbol.asyncIterator]();

  const firstAssistantResponseEvent = await readNextAssistantResponseEvent(assistantResponseEventIterator);
  const secondAssistantResponseEvent = await readNextAssistantResponseEvent(assistantResponseEventIterator);
  const thirdAssistantResponseEventPromise = readNextAssistantResponseEvent(assistantResponseEventIterator);
  await waitForPromiseWithTimeout({
    promise: projectInstructionTracker.expectedActiveDiscoveriesReached.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Slow read tool call did not reach the blocking project instruction discovery."),
  });
  const thirdAssistantResponseEvent = await waitForPromiseWithTimeout({
    promise: thirdAssistantResponseEventPromise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Fast glob completion was not emitted while slow read was still blocked."),
  });

  expect(listToolCallPartStatuses([
    firstAssistantResponseEvent,
    secondAssistantResponseEvent,
    thirdAssistantResponseEvent,
  ])).toEqual([
    "call_read_slow:running",
    "call_glob_fast:running",
    "call_glob_fast:completed",
  ]);
  expect(providerConversationTurn.submittedToolResults).toEqual([]);

  const fourthAssistantResponseEventPromise = readNextAssistantResponseEvent(assistantResponseEventIterator);
  projectInstructionTracker.releaseDiscoveries.complete();
  const fourthAssistantResponseEvent = await waitForPromiseWithTimeout({
    promise: fourthAssistantResponseEventPromise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Slow read completion was not emitted after release."),
  });

  expect(listToolCallPartStatuses([fourthAssistantResponseEvent])).toEqual(["call_read_slow:completed"]);
  expect(await assistantResponseEventIterator.next()).toEqual({ done: true, value: undefined });
  expect(providerConversationTurn.submittedToolResults.map((submittedToolResult) => submittedToolResult.toolCallId)).toEqual([
    "call_glob_fast",
    "call_read_slow",
  ]);
  expect(conversationHistory.listConversationSessionEntries()).toEqual(expect.arrayContaining([
    expect.objectContaining({ entryKind: "completed_tool_result", toolCallId: "call_glob_fast" }),
    expect.objectContaining({ entryKind: "completed_tool_result", toolCallId: "call_read_slow" }),
  ]));
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls does not block sibling completions on provider submission", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-provider-submission-"));
  await writeFile(join(workspaceRootPath, "first.txt"), "first\n", "utf8");
  await writeFile(join(workspaceRootPath, "second.txt"), "second\n", "utf8");
  const requestedToolCalls: AutoApprovedReadOnlyRequestedToolCall[] = [
    {
      toolCallId: "call_read_first",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "first.txt",
      },
    },
    {
      toolCallId: "call_read_second",
      toolCallRequest: {
        toolName: "read",
        readTargetPath: "second.txt",
      },
    },
  ];
  const providerConversationTurn = new BlockingProviderConversationTurn({ expectedStartedSubmissionCount: 1 });
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Read both files",
        modelFacingPromptText: "Read both files",
      },
      ...requestedToolCalls.map((requestedToolCall) => ({
        entryKind: "tool_call" as const,
        toolCallId: requestedToolCall.toolCallId,
        toolCallRequest: requestedToolCall.toolCallRequest,
      })),
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });
  const assistantResponseEventIterator = streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    requestedToolCalls,
    workspaceRootPath,
    toolResultSessionRecorder,
    abortSignal: new AbortController().signal,
    throwIfConversationTurnInterrupted: () => {},
  })[Symbol.asyncIterator]();

  const firstAssistantResponseEvent = await readNextAssistantResponseEvent(assistantResponseEventIterator);
  const secondAssistantResponseEvent = await readNextAssistantResponseEvent(assistantResponseEventIterator);
  const firstCompletedAssistantResponseEvent = await readNextAssistantResponseEvent(assistantResponseEventIterator);
  const secondCompletedAssistantResponseEventPromise = readNextAssistantResponseEvent(assistantResponseEventIterator);
  await waitForPromiseWithTimeout({
    promise: providerConversationTurn.expectedStartedSubmissionsReached.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("First provider tool-result submission did not start."),
  });
  const secondCompletedAssistantResponseEvent = await waitForPromiseWithTimeout({
    promise: secondCompletedAssistantResponseEventPromise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Second completion waited for the first provider submission."),
  });

  expect(listToolCallPartStatuses([
    firstAssistantResponseEvent,
    secondAssistantResponseEvent,
    firstCompletedAssistantResponseEvent,
    secondCompletedAssistantResponseEvent,
  ])).toEqual([
    "call_read_first:running",
    "call_read_second:running",
    expect.stringMatching(/^call_read_(first|second):completed$/),
    expect.stringMatching(/^call_read_(first|second):completed$/),
  ]);
  expect(providerConversationTurn.submittedToolResults).toEqual([]);

  providerConversationTurn.releaseSubmissions.complete();
  expect(await assistantResponseEventIterator.next()).toEqual({ done: true, value: undefined });
  expect(providerConversationTurn.submittedToolResults.map((submittedToolResult) => submittedToolResult.toolCallId).toSorted()).toEqual([
    "call_read_first",
    "call_read_second",
  ]);
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls limits concurrent execution and submits every result", async () => {
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
  expect(providerConversationTurn.submittedToolResults.map((submittedToolResult) => submittedToolResult.toolCallId).toSorted()).toEqual(
    requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId).toSorted(),
  );
  const toolCallPartStatuses = listToolCallPartStatuses(assistantResponseEvents);
  expect(toolCallPartStatuses.slice(0, requestedToolCalls.length)).toEqual(
    requestedToolCalls.map((requestedToolCall) => `${requestedToolCall.toolCallId}:running`),
  );
  expect(toolCallPartStatuses.slice(requestedToolCalls.length).toSorted()).toEqual(
    requestedToolCalls.map((requestedToolCall) => `${requestedToolCall.toolCallId}:completed`).toSorted(),
  );
});

test("streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall limits read_many child reads", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-only-tool-read-many-concurrency-"));
  const requestedReadTargets = Array.from({ length: 5 }, (_, readTargetIndex) => ({
    readTargetPath: `notes-${readTargetIndex + 1}.txt`,
  }));
  await Promise.all(requestedReadTargets.map((readTarget, readTargetIndex) =>
    writeFile(join(workspaceRootPath, readTarget.readTargetPath), `note ${readTargetIndex + 1}\n`, "utf8")
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
        promptText: "Read many notes",
        modelFacingPromptText: "Read many notes",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call_read_many_1",
        toolCallRequest: {
          toolName: "read_many",
          readTargets: requestedReadTargets,
        },
      },
    ],
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({ conversationHistory });

  const assistantResponseEventsPromise = collectReadOnlyToolCallEvents({
    assistantResponseMessageId: "assistant-message-1",
    providerConversationTurn,
    toolCallId: "call_read_many_1",
    toolCallRequest: {
      toolName: "read_many",
      readTargets: requestedReadTargets,
    },
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
    createTimeoutError: () => new Error("read_many child reads did not reach the expected active concurrency."),
  });
  expect(projectInstructionTracker.startedDiscoveryCount).toBe(2);
  expect(projectInstructionTracker.activeDiscoveryCount).toBe(2);

  projectInstructionTracker.releaseDiscoveries.complete();
  const assistantResponseEvents = await assistantResponseEventsPromise;

  expect(projectInstructionTracker.startedDiscoveryCount).toBe(requestedReadTargets.length);
  expect(projectInstructionTracker.maximumActiveDiscoveryCount).toBe(2);
  expect(providerConversationTurn.submittedToolResults).toEqual([
    {
      toolCallId: "call_read_many_1",
      toolResultText: expect.stringContaining("<summary>5 completed, 0 failed</summary>"),
    },
  ]);
  expect(listToolCallPartStatuses(assistantResponseEvents)).toEqual([
    "call_read_many_1:running",
    "call_read_many_1:completed",
  ]);
});

test("runReadManyToolCall coalesces identical child read targets and preserves every result index", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-many-tool-duplicate-targets-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\n", "utf8");
  const projectInstructionTracker = new BlockingProjectInstructionTracker({
    workspaceRootPath,
    expectedActiveDiscoveryCount: 1,
  });
  const readManyToolCallOutcomePromise = runReadManyToolCall({
    readManyToolCallRequest: {
      toolName: "read_many",
      readTargets: [
        { readTargetPath: "notes.txt", offsetLineNumber: 1, maximumLineCount: 1 },
        { readTargetPath: "notes.txt", offsetLineNumber: 1, maximumLineCount: 1 },
      ],
    },
    workspaceRootPath,
    projectInstructionTracker,
    readOnlyToolCallConcurrencyLimiter: new RuntimeReadOnlyToolCallConcurrencyLimiter({
      maximumConcurrentReadOnlyToolCalls: 2,
    }),
  });

  await waitForPromiseWithTimeout({
    promise: projectInstructionTracker.expectedActiveDiscoveriesReached.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Duplicate read_many targets did not start their shared read."),
  });
  projectInstructionTracker.releaseDiscoveries.complete();
  const readManyToolCallOutcome = await readManyToolCallOutcomePromise;

  expect(projectInstructionTracker.startedDiscoveryCount).toBe(1);
  expect(readManyToolCallOutcome.outcomeKind).toBe("completed");
  expect(readManyToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "read_many",
    completedReadCount: 2,
    failedReadCount: 0,
    readResults: [
      { readStatus: "completed", readDetail: { toolName: "read", readFilePath: "notes.txt" } },
      { readStatus: "completed", readDetail: { toolName: "read", readFilePath: "notes.txt" } },
    ],
  });
  expect(readManyToolCallOutcome.toolResultText).toContain("<index>1</index>");
  expect(readManyToolCallOutcome.toolResultText).toContain("<index>2</index>");
});

async function readNextAssistantResponseEvent(
  assistantResponseEventIterator: AsyncIterator<AssistantResponseEvent>,
): Promise<AssistantResponseEvent> {
  const nextAssistantResponseEvent = await assistantResponseEventIterator.next();
  if (nextAssistantResponseEvent.done) {
    throw new Error("Expected another assistant response event before the stream ended.");
  }

  return nextAssistantResponseEvent.value;
}

function listToolCallPartStatuses(assistantResponseEvents: readonly AssistantResponseEvent[]): string[] {
  return assistantResponseEvents.flatMap((assistantResponseEvent) =>
    (assistantResponseEvent.type === "assistant_message_part_added" || assistantResponseEvent.type === "assistant_message_part_updated") &&
      assistantResponseEvent.part.partKind === "assistant_tool_call"
      ? [`${assistantResponseEvent.part.toolCallId}:${assistantResponseEvent.part.toolCallStatus}`]
      : []
  );
}

async function waitForPromiseWithTimeout<T>(input: {
  promise: Promise<T>;
  timeoutMilliseconds: number;
  createTimeoutError: () => Error;
}): Promise<T> {
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timeoutHandle = setTimeout(() => rejectPromise(input.createTimeoutError()), input.timeoutMilliseconds);
    input.promise.then(resolvePromise, rejectPromise).finally(() => clearTimeout(timeoutHandle));
  });
}
