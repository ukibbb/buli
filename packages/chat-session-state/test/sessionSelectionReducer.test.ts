import { expect, test } from "bun:test";
import {
  createInitialChatSessionState,
  moveHighlightedConversationSessionSelectionDown,
  moveHighlightedConversationSessionSelectionUp,
  requestConversationSessionDeletionConfirmation,
  selectHighlightedConversationSession,
  showAvailableConversationSessionsForSelection,
} from "../src/index.ts";

const conversationSessionSummaries = [
  {
    sessionId: "session-a",
    title: "First session",
    createdAtMs: 1000,
    updatedAtMs: 2000,
    conversationSessionEntryCount: 2,
  },
  {
    sessionId: "session-b",
    title: "Second session",
    createdAtMs: 3000,
    updatedAtMs: 4000,
    conversationSessionEntryCount: 4,
  },
] as const;

test("session selection highlights the active session when sessions are shown", () => {
  const chatSessionState = showAvailableConversationSessionsForSelection(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessionSummaries,
    "session-b",
  );

  expect(chatSessionState.conversationSessionSelectionState).toEqual({
    step: "showing_conversation_sessions",
    conversationSessions: conversationSessionSummaries,
    highlightedConversationSessionIndex: 1,
    activeConversationSessionId: "session-b",
    pendingDeletionConversationSessionId: undefined,
  });
});

test("session selection returns the highlighted session", () => {
  const chatSessionState = moveHighlightedConversationSessionSelectionDown(
    showAvailableConversationSessionsForSelection(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      conversationSessionSummaries,
      "session-a",
    ),
  );

  const selection = selectHighlightedConversationSession(chatSessionState);

  expect(selection.selectedConversationSession?.sessionId).toBe("session-b");
  expect(selection.nextChatSessionState.conversationSessionSelectionState).toEqual({ step: "hidden" });
});

test("session selection records the session waiting for delete confirmation", () => {
  const chatSessionState = requestConversationSessionDeletionConfirmation(
    showAvailableConversationSessionsForSelection(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      conversationSessionSummaries,
      "session-a",
    ),
    "session-b",
  );

  expect(chatSessionState.conversationSessionSelectionState).toMatchObject({
    step: "showing_conversation_sessions",
    pendingDeletionConversationSessionId: "session-b",
  });
});

test("session selection records empty session deletion when another session remains", () => {
  const emptyConversationSession = {
    sessionId: "session-empty",
    title: "New session",
    createdAtMs: 5000,
    updatedAtMs: 5000,
    conversationSessionEntryCount: 0,
  } as const;
  const chatSessionState = requestConversationSessionDeletionConfirmation(
    showAvailableConversationSessionsForSelection(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      [...conversationSessionSummaries, emptyConversationSession],
      "session-a",
    ),
    "session-empty",
  );

  expect(chatSessionState.conversationSessionSelectionState).toMatchObject({
    step: "showing_conversation_sessions",
    pendingDeletionConversationSessionId: "session-empty",
  });
});

test("session selection does not record delete confirmation for the only empty session", () => {
  const onlyEmptyConversationSession = {
    sessionId: "session-empty",
    title: "New session",
    createdAtMs: 5000,
    updatedAtMs: 5000,
    conversationSessionEntryCount: 0,
  } as const;
  const chatSessionState = requestConversationSessionDeletionConfirmation(
    showAvailableConversationSessionsForSelection(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      [onlyEmptyConversationSession],
      "session-empty",
    ),
    "session-empty",
  );

  expect(chatSessionState.conversationSessionSelectionState).toMatchObject({
    step: "showing_conversation_sessions",
    pendingDeletionConversationSessionId: undefined,
  });
});

test("session selection clears delete confirmation when the highlighted session changes", () => {
  const chatSessionState = requestConversationSessionDeletionConfirmation(
    showAvailableConversationSessionsForSelection(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      conversationSessionSummaries,
      "session-a",
    ),
    "session-b",
  );

  const nextChatSessionState = moveHighlightedConversationSessionSelectionUp(chatSessionState);

  expect(nextChatSessionState.conversationSessionSelectionState).toMatchObject({
    step: "showing_conversation_sessions",
    pendingDeletionConversationSessionId: undefined,
  });
});

test("session selection can keep the highlighted row near a refreshed list", () => {
  const chatSessionState = showAvailableConversationSessionsForSelection(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessionSummaries.slice(0, 1),
    "session-a",
    { highlightedConversationSessionIndex: 10 },
  );

  expect(chatSessionState.conversationSessionSelectionState).toMatchObject({
    step: "showing_conversation_sessions",
    highlightedConversationSessionIndex: 0,
  });
});
