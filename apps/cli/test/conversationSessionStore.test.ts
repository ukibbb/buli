import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

test("FileConversationSessionStore appends entries from separate store instances into one active chain", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-shared-writers-"));
  const legacyConversationSessionFilePath = join(directoryPath, "legacy-session.json");
  const firstConversationSessionStore = new FileConversationSessionStore({
    filePath: legacyConversationSessionFilePath,
    createSessionId: () => "session-1",
    createSessionEntryId: () => "entry-1",
    nowMs: () => 1001,
  });
  const secondConversationSessionStore = new FileConversationSessionStore({
    filePath: legacyConversationSessionFilePath,
    createSessionId: () => "unused-session-id",
    createSessionEntryId: () => "entry-2",
    nowMs: () => 1002,
  });

  const activeConversationSession = firstConversationSessionStore.loadActiveConversationSession();
  firstConversationSessionStore.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "First prompt",
    modelFacingPromptText: "First prompt",
  });
  secondConversationSessionStore.appendConversationSessionEntry({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Second answer",
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
  expect(secondConversationSessionStore.loadConversationSessionEntries()).toEqual([
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "Second answer",
    },
  ]);
});

test("FileConversationSessionStore appends after a valid JSONL session without a trailing newline", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-missing-final-newline-"));
  const conversationSessionStore = new FileConversationSessionStore({
    filePath: join(directoryPath, "legacy-session.json"),
    createSessionId: () => "session-1",
    createSessionEntryId: () => "entry-1",
    nowMs: () => 1001,
  });
  const activeConversationSession = conversationSessionStore.loadActiveConversationSession();
  const headerRecordText = (await readFile(activeConversationSession.filePath, "utf8")).trimEnd();
  await writeFile(activeConversationSession.filePath, headerRecordText, "utf8");

  conversationSessionStore.appendConversationSessionEntry({
    entryKind: "user_prompt",
    promptText: "First prompt",
    modelFacingPromptText: "First prompt",
  });

  expect(conversationSessionStore.loadConversationSessionEntries()).toEqual([
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
  ]);
  expect((await readFile(activeConversationSession.filePath, "utf8")).trim().split("\n")).toHaveLength(2);
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

test("FileConversationSessionStore recovers valid records before a partial final JSONL line", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-partial-tail-"));
  const conversationSessionStore = new FileConversationSessionStore({
    filePath: join(directoryPath, "legacy-session.json"),
    createSessionId: () => "session-1",
    createSessionEntryId: (() => {
      let nextEntryId = 0;
      return () => {
        nextEntryId += 1;
        return `entry-${nextEntryId}`;
      };
    })(),
    nowMs: () => Date.UTC(2026, 4, 7, 12, 30, 0),
  });
  const activeConversationSession = conversationSessionStore.startNewConversationSession();
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
  const validJsonlText = await readFile(activeConversationSession.filePath, "utf8");
  await writeFile(
    activeConversationSession.filePath,
    `${validJsonlText}{"recordKind":"conversation_entry","sessionEntryId":"partial-tail"`,
    "utf8",
  );

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

  const sessionFileNames = await readdir(dirname(activeConversationSession.filePath));
  const corruptTailFileName = sessionFileNames.find((fileName) => fileName.includes(".corrupt-tail."));
  expect(corruptTailFileName).toContain("2026-05-07T12-30-00-000Z.txt");
  expect(await readFile(activeConversationSession.filePath, "utf8")).not.toContain("partial-tail");
  expect(await readFile(join(dirname(activeConversationSession.filePath), corruptTailFileName ?? ""), "utf8")).toContain(
    "partial-tail",
  );
});

test("FileConversationSessionStore quarantines a corrupt middle JSONL suffix", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-corrupt-middle-"));
  const conversationSessionStore = new FileConversationSessionStore({
    filePath: join(directoryPath, "legacy-session.json"),
    createSessionId: () => "session-1",
    nowMs: () => Date.UTC(2026, 4, 7, 12, 31, 0),
  });
  const activeConversationSession = conversationSessionStore.startNewConversationSession();
  const headerRecordText = (await readFile(activeConversationSession.filePath, "utf8")).trim();
  const validEntryRecord = {
    recordKind: "conversation_entry" as const,
    sessionEntryId: "entry-1",
    parentSessionEntryId: null,
    recordedAtMs: 1001,
    conversationSessionEntry: {
      entryKind: "user_prompt" as const,
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
  };
  const validButQuarantinedEntryRecord = {
    recordKind: "conversation_entry" as const,
    sessionEntryId: "entry-2",
    parentSessionEntryId: "entry-1",
    recordedAtMs: 1002,
    conversationSessionEntry: {
      entryKind: "assistant_message" as const,
      assistantMessageStatus: "completed" as const,
      assistantMessageText: "This suffix should not load.",
    },
  };
  await writeFile(
    activeConversationSession.filePath,
    [
      headerRecordText,
      JSON.stringify(validEntryRecord),
      "{not-json",
      JSON.stringify(validButQuarantinedEntryRecord),
      "",
    ].join("\n"),
    "utf8",
  );

  expect(conversationSessionStore.loadConversationSessionEntries()).toEqual([
    {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    },
  ]);

  const sessionFileNames = await readdir(dirname(activeConversationSession.filePath));
  const corruptTailFileName = sessionFileNames.find((fileName) => fileName.includes(".corrupt-tail."));
  expect(corruptTailFileName).toContain("2026-05-07T12-31-00-000Z.txt");
  const corruptTailText = await readFile(join(dirname(activeConversationSession.filePath), corruptTailFileName ?? ""), "utf8");
  expect(corruptTailText).toContain("{not-json");
  expect(corruptTailText).toContain("This suffix should not load.");
  expect(await readFile(activeConversationSession.filePath, "utf8")).not.toContain("This suffix should not load.");
});
