import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";
import { InMemoryConversationHistory } from "@buli/engine";
import { FileConversationSessionStore } from "../src/conversationSessionStore.ts";

test("FileConversationSessionStore returns no entries when the session file is missing", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-"));
  const conversationSessionStore = new FileConversationSessionStore({ filePath: join(directoryPath, "session.json") });

  expect(conversationSessionStore.loadConversationSessionEntries()).toEqual([]);
});

test("FileConversationSessionStore saves and loads conversation session entries", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-"));
  const conversationSessionFilePath = join(directoryPath, "session.json");
  const conversationSessionStore = new FileConversationSessionStore({ filePath: conversationSessionFilePath });
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Say hello",
      modelFacingPromptText: "Say hello",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Hello.",
    },
  ];

  conversationSessionStore.saveConversationSessionEntries(conversationSessionEntries);

  expect(conversationSessionStore.loadConversationSessionEntries()).toEqual(conversationSessionEntries);
  await expect(readFile(conversationSessionFilePath, "utf8")).resolves.toContain('"schemaVersion": 1');
});

test("FileConversationSessionStore reloads history with safe model context after interrupted turns", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-"));
  const conversationSessionStore = new FileConversationSessionStore({ filePath: join(directoryPath, "session.json") });
  const persistedConversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Completed prompt",
      modelFacingPromptText: "Completed prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Completed answer",
    },
    {
      entryKind: "user_prompt",
      promptText: "Incomplete prompt",
      modelFacingPromptText: "Incomplete prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "incomplete",
      assistantMessageText: "Incomplete answer",
      incompleteReason: "max_output_tokens",
    },
    {
      entryKind: "user_prompt",
      promptText: "Failed prompt",
      modelFacingPromptText: "Failed prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "Unsafe partial answer",
      failureExplanation: "Provider failed mid-turn",
    },
    {
      entryKind: "user_prompt",
      promptText: "Dangling tool prompt",
      modelFacingPromptText: "Dangling tool prompt",
    },
    {
      entryKind: "tool_call",
      toolCallId: "call_1",
      toolCallRequest: {
        toolName: "bash",
        shellCommand: "pwd",
        commandDescription: "Print working directory",
      },
    },
  ];

  conversationSessionStore.saveConversationSessionEntries(persistedConversationSessionEntries);
  const restartedConversationHistory = new InMemoryConversationHistory({
    initialConversationSessionEntries: conversationSessionStore.loadConversationSessionEntries(),
  });
  restartedConversationHistory.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "Next prompt",
    modelFacingPromptText: "Next prompt",
  });

  expect(restartedConversationHistory.listModelContextItems()).toEqual<ModelContextItem[]>([
    { itemKind: "user_message", messageText: "Completed prompt" },
    { itemKind: "assistant_message", messageText: "Completed answer" },
    { itemKind: "user_message", messageText: "Incomplete prompt" },
    { itemKind: "assistant_message", messageText: "Incomplete answer" },
    { itemKind: "user_message", messageText: "Next prompt" },
  ]);
});
