import { expect, test } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type {
  BuliDiagnosticLogEvent,
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ModelContextItem,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "@buli/engine";
import { summarizeConversationSessionTitle } from "../src/conversationSession/conversationSessionTitle.ts";
import { SqliteConversationSessionStore } from "../src/conversationSession/index.ts";

test("SqliteConversationSessionStore creates an empty active session when the database is missing", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-empty-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    nowMs: () => 1000,
  });

  try {
    expect(conversationSessionStore.loadConversationSessionEntries()).toEqual([]);
    expect(conversationSessionStore.loadActiveConversationSession()).toEqual({
      sessionId: "session-1",
      modelSelection: undefined,
      conversationSessionEntries: [],
    });
    expect((await stat(conversationSessionStore.storagePath)).mode & 0o777).toBe(0o600);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore saves and loads conversation session entries", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-save-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createQueuedNumberFactory([1000, 1001, 1002]),
  });
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

  try {
    replaceActiveConversationSessionEntries(conversationSessionStore, conversationSessionEntries);

    expect(conversationSessionStore.loadConversationSessionEntries()).toEqual(conversationSessionEntries);
    expect(conversationSessionStore.listConversationSessions()).toEqual([
      {
        sessionId: "session-1",
        title: "Say hello",
        createdAtMs: 1000,
        updatedAtMs: 1002,
        conversationSessionEntryCount: 2,
      },
    ]);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore loads ordered conversation entry record slices", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-entry-record-slices-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createQueuedNumberFactory([1000, 1001, 1002, 1003, 1004, 1005, 1006]),
  });
  const conversationSessionEntries: ConversationSessionEntry[] = [
    createUserPromptConversationSessionEntry("Prompt 0"),
    createUserPromptConversationSessionEntry("Prompt 1"),
    {
      entryKind: "conversation_compaction_summary",
      summaryText: "Compacted earlier work.",
      compactedEntryCount: 2,
      retainedRecentConversationSessionEntryCount: 0,
    },
    createUserPromptConversationSessionEntry("Prompt 3"),
    createUserPromptConversationSessionEntry("Prompt 4"),
    createUserPromptConversationSessionEntry("Prompt 5"),
  ];

  try {
    replaceActiveConversationSessionEntries(conversationSessionStore, conversationSessionEntries);

    const latestEntryRecordSlice = conversationSessionStore.loadConversationSessionEntryRecords({
      loadKind: "latest",
      limit: 2,
    });
    expect(latestEntryRecordSlice.entryRecords.map((entryRecord) => entryRecord.entrySequence)).toEqual([4, 5]);
    expect(latestEntryRecordSlice.hasOlderEntries).toBe(true);
    expect(latestEntryRecordSlice.hasNewerEntries).toBe(false);
    expect(latestEntryRecordSlice.latestCompactionSummaryEntrySequence).toBe(2);

    const beforeEntryRecordSlice = conversationSessionStore.loadConversationSessionEntryRecords({
      loadKind: "before",
      beforeEntrySequence: 4,
      limit: 2,
    });
    expect(beforeEntryRecordSlice.entryRecords.map((entryRecord) => entryRecord.entrySequence)).toEqual([2, 3]);
    expect(beforeEntryRecordSlice.hasOlderEntries).toBe(true);
    expect(beforeEntryRecordSlice.hasNewerEntries).toBe(true);
    expect(beforeEntryRecordSlice.latestCompactionSummaryEntrySequence).toBe(2);

    const afterEntryRecordSlice = conversationSessionStore.loadConversationSessionEntryRecords({
      loadKind: "after",
      afterEntrySequence: 1,
      limit: 2,
    });
    expect(afterEntryRecordSlice.entryRecords.map((entryRecord) => entryRecord.entrySequence)).toEqual([2, 3]);
    expect(afterEntryRecordSlice.hasOlderEntries).toBe(true);
    expect(afterEntryRecordSlice.hasNewerEntries).toBe(true);
    expect(afterEntryRecordSlice.latestCompactionSummaryEntrySequence).toBe(2);

    const normalizedLimitEntryRecordSlice = conversationSessionStore.loadConversationSessionEntryRecords({
      loadKind: "latest",
      limit: 0,
    });
    expect(normalizedLimitEntryRecordSlice.entryRecords.map((entryRecord) => entryRecord.entrySequence)).toEqual([5]);
    expect(normalizedLimitEntryRecordSlice.hasOlderEntries).toBe(true);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore records SQLite operation summaries", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-diagnostics-"));
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createQueuedNumberFactory([1000, 1001]),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  try {
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "Measure storage",
      modelFacingPromptText: "Measure storage",
    });

    expect(diagnosticEvents).toContainEqual(expect.objectContaining({
      subsystem: "cli",
      eventName: "conversation_session_storage.operation_summary",
      fields: expect.objectContaining({
        operationName: "append_entry",
        transactionKind: "write",
        usesImmediateTransaction: true,
        operationStatus: "completed",
        conversationSessionEntryKind: "user_prompt",
        serializedConversationSessionEntryTextLength: expect.any(Number),
        durationMs: expect.any(Number),
      }),
    }));
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore bounds generated titles", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-title-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createQueuedNumberFactory([1000, 1001]),
  });

  try {
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: `${"Summarize ".repeat(20)}\nwith details`,
      modelFacingPromptText: "Long prompt",
    });

    expect(conversationSessionStore.listConversationSessions()[0]?.title).toBe(
      summarizeConversationSessionTitle([
        {
          entryKind: "user_prompt",
          promptText: `${"Summarize ".repeat(20)}\nwith details`,
          modelFacingPromptText: "Long prompt",
        },
      ]),
    );
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore recovers corrupt persisted entry JSON", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-corrupt-entry-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: () => "session-1",
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createQueuedNumberFactory([1000, 1001, 1002]),
  });

  try {
    replaceActiveConversationSessionEntries(conversationSessionStore, [
      {
        entryKind: "user_prompt",
        promptText: "Prompt before corruption",
        modelFacingPromptText: "Prompt before corruption",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "This row will be corrupted.",
      },
    ]);
  } finally {
    conversationSessionStore.close();
  }

  const database = new Database(databasePath);
  database.run(
    "UPDATE conversation_session_entry SET conversation_session_entry_json = ? WHERE session_id = ? AND entry_sequence = ?",
    ["{", "session-1", 1],
  );
  database.close();

  const reloadedConversationSessionStore = new SqliteConversationSessionStore({ databasePath });
  try {
    expect(reloadedConversationSessionStore.loadConversationSessionEntries()).toMatchObject([
      { entryKind: "user_prompt", promptText: "Prompt before corruption" },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "failed",
        failureExplanation: expect.stringContaining("Could not load persisted conversation session entry 2"),
      },
    ]);
  } finally {
    reloadedConversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore ignores corrupt persisted model selection JSON", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-corrupt-model-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: () => "session-1",
    nowMs: () => 1000,
  });

  try {
    saveActiveConversationSessionModelSelection(conversationSessionStore, { selectedModelId: "gpt-5.4" });
  } finally {
    conversationSessionStore.close();
  }

  const database = new Database(databasePath);
  database.run("UPDATE conversation_session SET current_model_selection_json = ? WHERE session_id = ?", ["{", "session-1"]);
  database.close();

  const reloadedConversationSessionStore = new SqliteConversationSessionStore({ databasePath });
  try {
    expect(reloadedConversationSessionStore.loadActiveConversationSession().modelSelection).toBeUndefined();
    expect(reloadedConversationSessionStore.listConversationSessions()[0]?.modelSelection).toBeUndefined();
  } finally {
    reloadedConversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore keeps scoped appends isolated after another store changes the shared active session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-scoped-append-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const firstConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: createQueuedStringFactory(["session-a"]),
    createSessionEntryId: createQueuedStringFactory(["entry-a-1", "entry-a-2"]),
    nowMs: createQueuedNumberFactory([1000, 1001, 3000]),
  });
  const secondConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: createQueuedStringFactory(["session-b"]),
    createSessionEntryId: createQueuedStringFactory(["entry-b-1"]),
    nowMs: createQueuedNumberFactory([2000, 2001]),
  });

  try {
    const firstConversationSessionId = firstConversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
    firstConversationSessionStore.appendConversationSessionEntryToSession({
      conversationSessionId: firstConversationSessionId,
      conversationSessionEntry: {
        entryKind: "user_prompt",
        promptText: "First prompt",
        modelFacingPromptText: "First prompt",
      },
    });
    const secondConversationSessionId = secondConversationSessionStore.startNewConversationSession().sessionId;
    secondConversationSessionStore.appendConversationSessionEntryToSession({
      conversationSessionId: secondConversationSessionId,
      conversationSessionEntry: {
        entryKind: "user_prompt",
        promptText: "Second prompt",
        modelFacingPromptText: "Second prompt",
      },
    });

    firstConversationSessionStore.appendConversationSessionEntryToSession({
      conversationSessionId: firstConversationSessionId,
      conversationSessionEntry: {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "First answer after second store changed active session",
      },
    });

    expect(firstConversationSessionStore.loadConversationSessionEntries(firstConversationSessionId)).toEqual([
      {
        entryKind: "user_prompt",
        promptText: "First prompt",
        modelFacingPromptText: "First prompt",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "First answer after second store changed active session",
      },
    ]);
    expect(secondConversationSessionStore.loadConversationSessionEntries(secondConversationSessionId)).toEqual([
      {
        entryKind: "user_prompt",
        promptText: "Second prompt",
        modelFacingPromptText: "Second prompt",
      },
    ]);
    expect(secondConversationSessionStore.loadActiveConversationSession().sessionId).toBe(secondConversationSessionId);
  } finally {
    firstConversationSessionStore.close();
    secondConversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore keeps scoped model selection saves isolated after another store changes the shared active session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-scoped-model-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const firstConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: createQueuedStringFactory(["session-a"]),
    nowMs: createQueuedNumberFactory([1000, 3000]),
  });
  const secondConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: createQueuedStringFactory(["session-b"]),
    nowMs: () => 2000,
  });
  const firstModelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "high",
  };
  const secondModelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.5",
    selectedReasoningEffort: "low",
  };

  try {
    const firstConversationSessionId = firstConversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
    const secondConversationSessionId = secondConversationSessionStore.startNewConversationSession({
      modelSelection: secondModelSelection,
    }).sessionId;

    firstConversationSessionStore.saveConversationSessionModelSelectionForSession({
      conversationSessionId: firstConversationSessionId,
      modelSelection: firstModelSelection,
    });

    expect(firstConversationSessionStore.switchActiveConversationSession(firstConversationSessionId).modelSelection).toEqual(
      firstModelSelection,
    );
    expect(secondConversationSessionStore.switchActiveConversationSession(secondConversationSessionId).modelSelection).toEqual(
      secondModelSelection,
    );
  } finally {
    firstConversationSessionStore.close();
    secondConversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore keeps scoped replacement isolated after another store changes the shared active session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-scoped-replace-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const firstConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: createQueuedStringFactory(["session-a"]),
    createSessionEntryId: createQueuedStringFactory(["entry-a-1"]),
    nowMs: createQueuedNumberFactory([1000, 3000]),
  });
  const secondConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: createQueuedStringFactory(["session-b"]),
    createSessionEntryId: createQueuedStringFactory(["entry-b-1"]),
    nowMs: createQueuedNumberFactory([2000, 2001]),
  });
  const replacementEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Replaced first prompt",
      modelFacingPromptText: "Replaced first prompt",
    },
  ];

  try {
    const firstConversationSessionId = firstConversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
    const secondConversationSessionId = secondConversationSessionStore.startNewConversationSession().sessionId;
    secondConversationSessionStore.appendConversationSessionEntryToSession({
      conversationSessionId: secondConversationSessionId,
      conversationSessionEntry: {
        entryKind: "user_prompt",
        promptText: "Second prompt",
        modelFacingPromptText: "Second prompt",
      },
    });

    firstConversationSessionStore.replaceConversationSessionEntriesForSession({
      conversationSessionId: firstConversationSessionId,
      conversationSessionEntries: replacementEntries,
    });

    expect(firstConversationSessionStore.loadConversationSessionEntries(firstConversationSessionId)).toEqual(replacementEntries);
    expect(secondConversationSessionStore.loadConversationSessionEntries(secondConversationSessionId)).toEqual([
      {
        entryKind: "user_prompt",
        promptText: "Second prompt",
        modelFacingPromptText: "Second prompt",
      },
    ]);
  } finally {
    firstConversationSessionStore.close();
    secondConversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore persists the latest active session model selection", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-model-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    nowMs: createIncrementingClockMilliseconds(),
  });
  const firstModelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.4",
    selectedModelDefaultReasoningEffort: "medium",
    selectedReasoningEffort: "high",
  };
  const latestModelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "medium",
  };

  try {
    saveActiveConversationSessionModelSelection(conversationSessionStore, firstModelSelection);
    saveActiveConversationSessionModelSelection(conversationSessionStore, latestModelSelection);

    expect(conversationSessionStore.loadActiveConversationSession().modelSelection).toEqual(latestModelSelection);
    expect(conversationSessionStore.listConversationSessions()).toMatchObject([
      {
        sessionId: "session-1",
        modelSelection: latestModelSelection,
      },
    ]);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore carries model selection into new sessions", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-new-session-model-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: () => "session-1",
    nowMs: () => 1000,
  });
  const modelSelection: ConversationSessionModelSelection = {
    selectedModelId: "gpt-5.4",
    selectedReasoningEffort: "low",
  };

  try {
    const activeConversationSession = conversationSessionStore.startNewConversationSession({ modelSelection });

    expect(activeConversationSession).toEqual({
      sessionId: "session-1",
      modelSelection,
      conversationSessionEntries: [],
    });
    expect(conversationSessionStore.listConversationSessions()).toEqual([
      {
        sessionId: "session-1",
        title: "New session",
        createdAtMs: 1000,
        updatedAtMs: 1000,
        conversationSessionEntryCount: 0,
        modelSelection,
      },
    ]);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore lists sessions by most recent entry timestamp", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-list-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: createQueuedStringFactory(["session-a", "session-b"]),
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createQueuedNumberFactory([1000, 1001, 2000, 2001]),
  });

  try {
    const firstConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    });

    expect(conversationSessionStore.listConversationSessions()).toEqual([
      {
        sessionId: secondConversationSession.sessionId,
        title: "Second prompt",
        createdAtMs: 2000,
        updatedAtMs: 2001,
        conversationSessionEntryCount: 1,
      },
      {
        sessionId: firstConversationSession.sessionId,
        title: "First prompt",
        createdAtMs: 1000,
        updatedAtMs: 1001,
        conversationSessionEntryCount: 1,
      },
    ]);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore switches active sessions", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-switch-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: createQueuedStringFactory(["session-a", "session-b"]),
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createIncrementingClockMilliseconds(),
  });

  try {
    const firstConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    });

    expect(conversationSessionStore.switchActiveConversationSession(firstConversationSession.sessionId)).toMatchObject({
      sessionId: firstConversationSession.sessionId,
      conversationSessionEntries: [
        {
          entryKind: "user_prompt",
          promptText: "First prompt",
          modelFacingPromptText: "First prompt",
        },
      ],
    });
    expect(conversationSessionStore.loadActiveConversationSession().sessionId).toBe(firstConversationSession.sessionId);
    expect(conversationSessionStore.switchActiveConversationSession(secondConversationSession.sessionId).sessionId).toBe(
      secondConversationSession.sessionId,
    );
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore deletes an inactive session without changing the active session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-delete-inactive-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: createQueuedStringFactory(["session-a", "session-b"]),
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createIncrementingClockMilliseconds(),
  });

  try {
    const firstConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    });

    const activeConversationSessionAfterDelete = conversationSessionStore.deleteConversationSession(firstConversationSession.sessionId);

    expect(activeConversationSessionAfterDelete.sessionId).toBe(secondConversationSession.sessionId);
    expect(conversationSessionStore.listConversationSessions().map((conversationSession) => conversationSession.sessionId)).toEqual([
      secondConversationSession.sessionId,
    ]);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore deletes the active session and switches to the latest remaining session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-delete-active-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: createQueuedStringFactory(["session-a", "session-b"]),
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createIncrementingClockMilliseconds(),
  });

  try {
    const firstConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "Second prompt",
      modelFacingPromptText: "Second prompt",
    });
    conversationSessionStore.switchActiveConversationSession(firstConversationSession.sessionId);

    const activeConversationSessionAfterDelete = conversationSessionStore.deleteConversationSession(firstConversationSession.sessionId);

    expect(activeConversationSessionAfterDelete.sessionId).toBe(secondConversationSession.sessionId);
    expect(conversationSessionStore.loadActiveConversationSession().sessionId).toBe(secondConversationSession.sessionId);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore creates a new empty active session after deleting the last session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-delete-last-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionId: createQueuedStringFactory(["session-a", "session-new"]),
    createSessionEntryId: createIncrementingEntryIdFactory(),
    nowMs: createIncrementingClockMilliseconds(),
  });

  try {
    const firstConversationSession = conversationSessionStore.startNewConversationSession();
    appendConversationSessionEntryToActiveSession(conversationSessionStore, {
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });

    const activeConversationSessionAfterDelete = conversationSessionStore.deleteConversationSession(firstConversationSession.sessionId);

    expect(activeConversationSessionAfterDelete).toEqual({
      sessionId: "session-new",
      modelSelection: undefined,
      conversationSessionEntries: [],
    });
    expect(conversationSessionStore.listConversationSessions()).toMatchObject([
      {
        sessionId: "session-new",
        title: "New session",
        conversationSessionEntryCount: 0,
      },
    ]);
  } finally {
    conversationSessionStore.close();
  }
});

test("SqliteConversationSessionStore reloads history with safe model context after interrupted turns", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-safe-context-"));
  const conversationSessionStore = new SqliteConversationSessionStore({
    databasePath: join(directoryPath, "session-store.sqlite"),
    createSessionEntryId: createIncrementingEntryIdFactory(),
  });
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

  try {
    replaceActiveConversationSessionEntries(conversationSessionStore, persistedConversationSessionEntries);
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
  } finally {
    conversationSessionStore.close();
  }
});

function createQueuedStringFactory(queuedValues: readonly string[]): () => string {
  let nextValueIndex = 0;
  return () => {
    const queuedValue = queuedValues[nextValueIndex];
    nextValueIndex += 1;
    return queuedValue ?? `queued-value-${nextValueIndex}`;
  };
}

function createQueuedNumberFactory(queuedValues: readonly number[]): () => number {
  let nextValueIndex = 0;
  return () => {
    const queuedValue = queuedValues[nextValueIndex];
    nextValueIndex += 1;
    return queuedValue ?? nextValueIndex;
  };
}

function createIncrementingEntryIdFactory(): () => string {
  let nextEntryId = 0;
  return () => {
    nextEntryId += 1;
    return `entry-${nextEntryId}`;
  };
}

function createIncrementingClockMilliseconds(): () => number {
  let nextTimestamp = 1000;
  return () => {
    nextTimestamp += 1;
    return nextTimestamp;
  };
}

function createUserPromptConversationSessionEntry(promptText: string): ConversationSessionEntry {
  return {
    entryKind: "user_prompt",
    promptText,
    modelFacingPromptText: promptText,
  };
}

function appendConversationSessionEntryToActiveSession(
  conversationSessionStore: SqliteConversationSessionStore,
  conversationSessionEntry: ConversationSessionEntry,
): void {
  const conversationSessionId = conversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
  conversationSessionStore.appendConversationSessionEntryToSession({
    conversationSessionId,
    conversationSessionEntry,
  });
}

function saveActiveConversationSessionModelSelection(
  conversationSessionStore: SqliteConversationSessionStore,
  modelSelection: ConversationSessionModelSelection,
): void {
  const conversationSessionId = conversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
  conversationSessionStore.saveConversationSessionModelSelectionForSession({
    conversationSessionId,
    modelSelection,
  });
}

function replaceActiveConversationSessionEntries(
  conversationSessionStore: SqliteConversationSessionStore,
  conversationSessionEntries: readonly ConversationSessionEntry[],
): void {
  const conversationSessionId = conversationSessionStore.loadActiveConversationSessionMetadata().sessionId;
  conversationSessionStore.replaceConversationSessionEntriesForSession({
    conversationSessionId,
    conversationSessionEntries,
  });
}
