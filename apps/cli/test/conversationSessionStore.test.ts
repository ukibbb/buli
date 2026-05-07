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

test("FileConversationSessionStore appends JSONL session records with parent links", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-"));
  const conversationSessionStore = new FileConversationSessionStore({
    filePath: join(directoryPath, "legacy-session.json"),
    createSessionId: () => "session-1",
    createSessionEntryId: (() => {
      let nextId = 0;
      return () => {
        nextId += 1;
        return `entry-${nextId}`;
      };
    })(),
    nowMs: (() => {
      let nextTimestamp = 1000;
      return () => {
        nextTimestamp += 1;
        return nextTimestamp;
      };
    })(),
  });
  const activeConversationSession = conversationSessionStore.loadActiveConversationSession();

  conversationSessionStore.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "Say hello",
    modelFacingPromptText: "Say hello",
  });
  conversationSessionStore.appendConversationSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Hello.",
  });

  const persistedJsonLines = (await readFile(activeConversationSession.filePath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
  expect(persistedJsonLines).toMatchObject([
    { recordKind: "conversation_session", schemaVersion: 1, sessionId: "session-1" },
    { recordKind: "conversation_entry", sessionEntryId: "entry-1", parentSessionEntryId: null },
    { recordKind: "conversation_entry", sessionEntryId: "entry-2", parentSessionEntryId: "entry-1" },
  ]);
  expect(conversationSessionStore.loadConversationSessionEntries()).toEqual([
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
  ]);
});

test("FileConversationSessionStore imports a legacy snapshot into the active JSONL session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-"));
  const legacyConversationSessionFilePath = join(directoryPath, "legacy-session.json");
  const legacyConversationSessionStore = new FileConversationSessionStore({ filePath: legacyConversationSessionFilePath });
  const legacyConversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Legacy prompt",
      modelFacingPromptText: "Legacy prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Legacy answer",
    },
  ];
  legacyConversationSessionStore.saveConversationSessionEntries(legacyConversationSessionEntries);

  const migratedConversationSessionStore = new FileConversationSessionStore({
    filePath: legacyConversationSessionFilePath,
    createSessionId: () => "migrated-session",
    createSessionEntryId: (() => {
      let nextId = 0;
      return () => {
        nextId += 1;
        return `migrated-entry-${nextId}`;
      };
    })(),
    nowMs: () => 2000,
  });

  expect(migratedConversationSessionStore.loadActiveConversationSession()).toMatchObject({
    sessionId: "migrated-session",
    conversationSessionEntries: legacyConversationSessionEntries,
  });
  expect(migratedConversationSessionStore.listConversationSessions()).toMatchObject([
    {
      sessionId: "migrated-session",
      title: "Legacy prompt",
      conversationSessionEntryCount: 2,
    },
  ]);
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
