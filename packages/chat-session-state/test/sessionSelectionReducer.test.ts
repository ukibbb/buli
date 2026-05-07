import { expect, test } from "bun:test";
import {
  createInitialChatSessionState,
  moveHighlightedConversationSessionSelectionDown,
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
