import { expect, test } from "bun:test";
import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/index.ts";

test("InMemoryConversationHistory incrementally keeps model-context items in sync with appended session entries", () => {
  const conversationHistory = new InMemoryConversationHistory();

  conversationHistory.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "Run pwd",
    modelFacingPromptText: "Run pwd",
  });
  conversationHistory.appendConversationSessionEntry({
    entryKind: "tool_call",
    toolCallId: "call_1",
    toolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
    },
  });
  conversationHistory.appendConversationSessionEntry({
    entryKind: "completed_tool_result",
    toolCallId: "call_1",
    toolCallDetail: {
      toolName: "bash",
      commandLine: "pwd",
      commandDescription: "Print working directory",
    },
    toolResultText: "Working directory: /tmp/demo",
  });

  expect(conversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Run pwd" },
    {
      itemKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
    {
      itemKind: "tool_result",
      toolCallId: "call_1",
      toolResultText: "Working directory: /tmp/demo",
    },
  ]);
});

test("InMemoryConversationHistory hydrates cached model-context items from initial session entries", () => {
  const initialConversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageText: "First answer",
    },
  ];
  const conversationHistory = new InMemoryConversationHistory({ initialConversationSessionEntries });

  expect(conversationHistory.listConversationSessionEntries()).toEqual(initialConversationSessionEntries);
  expect(conversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "First prompt" },
    { itemKind: "assistant_message", messageText: "First answer" },
  ]);
});
