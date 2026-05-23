import { expect, test } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationSessionEntry, ConversationSessionModelSelection, ModelContextItem } from "@buli/contracts";
import { InMemoryConversationHistory } from "@buli/engine";
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
    conversationSessionStore.saveConversationSessionEntries(conversationSessionEntries);

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

test("SqliteConversationSessionStore appends entries from separate store instances into one active session", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-sqlite-shared-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const firstConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: () => "session-1",
    createSessionEntryId: () => "entry-1",
    nowMs: createQueuedNumberFactory([1000, 1001]),
  });
  const secondConversationSessionStore = new SqliteConversationSessionStore({
    databasePath,
    createSessionId: () => "unused-session-id",
    createSessionEntryId: () => "entry-2",
    nowMs: () => 1002,
  });

  try {
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
    expect(secondConversationSessionStore.listConversationSessions()).toMatchObject([
      {
        sessionId: "session-1",
        title: "First prompt",
        updatedAtMs: 1002,
        conversationSessionEntryCount: 2,
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
    conversationSessionStore.saveActiveConversationSessionModelSelection(firstModelSelection);
    conversationSessionStore.saveActiveConversationSessionModelSelection(latestModelSelection);

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
    conversationSessionStore.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    conversationSessionStore.appendConversationSessionEntry({
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
    conversationSessionStore.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    conversationSessionStore.appendConversationSessionEntry({
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
    conversationSessionStore.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    conversationSessionStore.appendConversationSessionEntry({
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
    conversationSessionStore.appendConversationSessionEntry({
      entryKind: "user_prompt",
      promptText: "First prompt",
      modelFacingPromptText: "First prompt",
    });
    const secondConversationSession = conversationSessionStore.startNewConversationSession();
    conversationSessionStore.appendConversationSessionEntry({
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
    conversationSessionStore.appendConversationSessionEntry({
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
