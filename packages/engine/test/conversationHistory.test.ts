import { expect, test } from "bun:test";
import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import { InMemoryConversationHistory } from "../src/index.ts";

test("InMemoryConversationHistory derives model-context items from completed session turns", () => {
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
  conversationHistory.appendConversationSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Done.",
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
    { itemKind: "assistant_message", messageText: "Done." },
  ]);
});

test("InMemoryConversationHistory derives model-context items from initial session entries", () => {
  const initialConversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
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

test("InMemoryConversationHistory removes an accepted prompt from model context when the turn fails", () => {
  const conversationHistory = new InMemoryConversationHistory();

  conversationHistory.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "First prompt",
    modelFacingPromptText: "First prompt",
  });
  expect(conversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "First prompt" },
  ]);

  conversationHistory.appendConversationSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "failed",
    assistantMessageText: "Partial answer",
    failureExplanation: "Provider failed mid-turn",
  });

  expect(conversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([]);
});

test("InMemoryConversationHistory notifies listeners with the full session entries after each append", () => {
  const observedConversationSessionEntries: ConversationSessionEntry[][] = [];
  const conversationHistory = new InMemoryConversationHistory({
    onConversationSessionEntriesChanged: (conversationSessionEntries) => {
      observedConversationSessionEntries.push([...conversationSessionEntries]);
    },
  });

  conversationHistory.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "Persist this prompt",
    modelFacingPromptText: "Persist this prompt",
  });
  conversationHistory.appendConversationSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Persisted.",
  });

  expect(observedConversationSessionEntries).toEqual<ConversationSessionEntry[][]>([
    [
      {
        entryKind: "user_prompt",
        promptText: "Persist this prompt",
        modelFacingPromptText: "Persist this prompt",
      },
    ],
    [
      {
        entryKind: "user_prompt",
        promptText: "Persist this prompt",
        modelFacingPromptText: "Persist this prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Persisted.",
      },
    ],
  ]);
});
