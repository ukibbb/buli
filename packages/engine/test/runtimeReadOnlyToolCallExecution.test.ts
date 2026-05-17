import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantResponseEvent, BuliDiagnosticLogEvent, ProviderStreamEvent, ProviderTurnReplay } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import type { ProviderConversationTurn, ProviderToolResultSubmission } from "../src/provider.ts";
import {
  isAutoApprovedReadOnlyToolCallRequest,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
} from "../src/runtimeReadOnlyToolCallExecution.ts";
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

async function collectReadOnlyToolCallEvents(input: Parameters<
  typeof streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall
>[0]): Promise<AssistantResponseEvent[]> {
  const assistantResponseEvents: AssistantResponseEvent[] = [];
  for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall(input)) {
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
