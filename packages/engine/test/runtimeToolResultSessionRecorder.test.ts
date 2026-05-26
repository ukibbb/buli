import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent, ConversationSessionEntry, ToolCallDetail } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/conversationHistory.ts";
import { RuntimeToolResultSessionRecorder } from "../src/runtimeToolResultSessionRecorder.ts";

const acceptedToolCallConversationSessionEntries: ConversationSessionEntry[] = [
  {
    entryKind: "user_prompt",
    promptText: "Run pwd",
    modelFacingPromptText: "Run pwd",
  },
  {
    entryKind: "tool_call",
    toolCallId: "call_bash_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Show working directory",
    },
  },
];

const bashToolCallDetail: ToolCallDetail = {
  toolName: "bash",
  commandLine: "pwd",
  commandDescription: "Show working directory",
};

test("RuntimeToolResultSessionRecorder records a completed tool result with diagnostics", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: acceptedToolCallConversationSessionEntries,
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationTurnId: "conversation-turn-1",
    conversationHistory,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const toolResultText = "Working directory: /repo";

  toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
    toolCallId: "call_bash_1",
    toolCallDetail: bashToolCallDetail,
    toolResultText,
  });

  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    ...acceptedToolCallConversationSessionEntries,
    {
      entryKind: "completed_tool_result",
      toolCallId: "call_bash_1",
      toolCallDetail: bashToolCallDetail,
      toolResultText,
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "completed_tool_result",
        toolCallId: "call_bash_1",
        toolName: "bash",
        toolResultTextLength: toolResultText.length,
        conversationSessionEntryCount: 3,
      },
    },
  ]);
});

test("RuntimeToolResultSessionRecorder records a failed tool result with diagnostics", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: acceptedToolCallConversationSessionEntries,
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationTurnId: "conversation-turn-1",
    conversationHistory,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const toolResultText = "Command execution failed before completion: executor failed";
  const failureExplanation = "executor failed";

  toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: "call_bash_1",
    toolCallDetail: bashToolCallDetail,
    toolResultText,
    failureExplanation,
  });

  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    ...acceptedToolCallConversationSessionEntries,
    {
      entryKind: "failed_tool_result",
      toolCallId: "call_bash_1",
      toolCallDetail: bashToolCallDetail,
      toolResultText,
      failureExplanation,
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "failed_tool_result",
        toolCallId: "call_bash_1",
        toolName: "bash",
        toolResultTextLength: toolResultText.length,
        failureExplanation,
        conversationSessionEntryCount: 3,
      },
    },
  ]);
});

test("RuntimeToolResultSessionRecorder records a denied tool result with diagnostics", () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: acceptedToolCallConversationSessionEntries,
  });
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationTurnId: "conversation-turn-1",
    conversationHistory,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const toolResultText = "The user denied this bash command, so it was not executed.";

  toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
    toolCallId: "call_bash_1",
    toolCallDetail: bashToolCallDetail,
    toolResultText,
    denialExplanation: toolResultText,
  });

  expect(conversationHistory.listConversationSessionEntries()).toEqual<ConversationSessionEntry[]>([
    ...acceptedToolCallConversationSessionEntries,
    {
      entryKind: "denied_tool_result",
      toolCallId: "call_bash_1",
      toolCallDetail: bashToolCallDetail,
      toolResultText,
      denialExplanation: toolResultText,
    },
  ]);
  expect(diagnosticEvents).toEqual<BuliDiagnosticLogEvent[]>([
    {
      subsystem: "engine",
      eventName: "conversation_history.entry_appended",
      fields: {
        conversationTurnId: "conversation-turn-1",
        entryKind: "denied_tool_result",
        toolCallId: "call_bash_1",
        toolName: "bash",
        toolResultTextLength: toolResultText.length,
        conversationSessionEntryCount: 3,
      },
    },
  ]);
});
