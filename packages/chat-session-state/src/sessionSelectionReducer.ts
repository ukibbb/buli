import type { ConversationSessionSummary } from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

export function showConversationSessionSelectionLoadingState(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    conversationSessionSelectionState: { step: "loading_conversation_sessions" },
    promptContextSelectionState: { step: "hidden" },
    slashCommandSelectionState: { step: "hidden" },
    modelAndReasoningSelectionState: { step: "hidden" },
    isCommandHelpModalVisible: false,
  };
}

export function showAvailableConversationSessionsForSelection(
  chatSessionState: ChatSessionState,
  conversationSessions: readonly ConversationSessionSummary[],
  activeConversationSessionId: string | undefined,
  options: { highlightedConversationSessionIndex?: number } = {},
): ChatSessionState {
  const activeConversationSessionIndex = activeConversationSessionId
    ? conversationSessions.findIndex((conversationSession) => conversationSession.sessionId === activeConversationSessionId)
    : -1;
  const defaultHighlightedConversationSessionIndex = activeConversationSessionIndex === -1 ? 0 : activeConversationSessionIndex;
  const highlightedConversationSessionIndex = clampConversationSessionSelectionIndex(
    options.highlightedConversationSessionIndex ?? defaultHighlightedConversationSessionIndex,
    conversationSessions.length,
  );

  return {
    ...chatSessionState,
    conversationSessionSelectionState: {
      step: "showing_conversation_sessions",
      conversationSessions,
      highlightedConversationSessionIndex,
      activeConversationSessionId,
      pendingDeletionConversationSessionId: undefined,
    },
    promptContextSelectionState: { step: "hidden" },
    slashCommandSelectionState: { step: "hidden" },
    modelAndReasoningSelectionState: { step: "hidden" },
    isCommandHelpModalVisible: false,
  };
}

export function showConversationSessionSelectionLoadingError(
  chatSessionState: ChatSessionState,
  errorMessage: string,
): ChatSessionState {
  return {
    ...chatSessionState,
    conversationSessionSelectionState: {
      step: "showing_session_loading_error",
      errorMessage,
    },
  };
}

export function hideConversationSessionSelection(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.conversationSessionSelectionState.step === "hidden") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    conversationSessionSelectionState: { step: "hidden" },
  };
}

export function moveHighlightedConversationSessionSelectionUp(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
    return chatSessionState;
  }

  const conversationSessionCount = chatSessionState.conversationSessionSelectionState.conversationSessions.length;
  if (conversationSessionCount === 0) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    conversationSessionSelectionState: {
      ...chatSessionState.conversationSessionSelectionState,
      highlightedConversationSessionIndex:
        (chatSessionState.conversationSessionSelectionState.highlightedConversationSessionIndex - 1 + conversationSessionCount) %
        conversationSessionCount,
      pendingDeletionConversationSessionId: undefined,
    },
  };
}

export function moveHighlightedConversationSessionSelectionDown(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
    return chatSessionState;
  }

  const conversationSessionCount = chatSessionState.conversationSessionSelectionState.conversationSessions.length;
  if (conversationSessionCount === 0) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    conversationSessionSelectionState: {
      ...chatSessionState.conversationSessionSelectionState,
      highlightedConversationSessionIndex:
        (chatSessionState.conversationSessionSelectionState.highlightedConversationSessionIndex + 1) % conversationSessionCount,
      pendingDeletionConversationSessionId: undefined,
    },
  };
}

export function requestConversationSessionDeletionConfirmation(
  chatSessionState: ChatSessionState,
  conversationSessionId: string,
): ChatSessionState {
  if (chatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
    return chatSessionState;
  }

  if (
    !canDeleteConversationSessionFromSelection(
      chatSessionState.conversationSessionSelectionState.conversationSessions,
      conversationSessionId,
    )
  ) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    conversationSessionSelectionState: {
      ...chatSessionState.conversationSessionSelectionState,
      pendingDeletionConversationSessionId: conversationSessionId,
    },
  };
}

export function selectHighlightedConversationSessionForDeletion(
  chatSessionState: ChatSessionState,
): ConversationSessionSummary | undefined {
  if (chatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
    return undefined;
  }

  const selectedConversationSession =
    chatSessionState.conversationSessionSelectionState.conversationSessions[
      chatSessionState.conversationSessionSelectionState.highlightedConversationSessionIndex
    ];
  if (!selectedConversationSession) {
    return undefined;
  }

  return canDeleteConversationSessionFromSelection(
    chatSessionState.conversationSessionSelectionState.conversationSessions,
    selectedConversationSession.sessionId,
  )
    ? selectedConversationSession
    : undefined;
}

export function canDeleteConversationSessionFromSelection(
  conversationSessions: readonly ConversationSessionSummary[],
  conversationSessionId: string,
): boolean {
  const conversationSession = conversationSessions.find(
    (candidateConversationSession) => candidateConversationSession.sessionId === conversationSessionId,
  );
  if (!conversationSession) {
    return false;
  }

  return conversationSessions.length > 1 || conversationSession.conversationSessionEntryCount > 0;
}

export function selectHighlightedConversationSession(chatSessionState: ChatSessionState): {
  nextChatSessionState: ChatSessionState;
  selectedConversationSession: ConversationSessionSummary | undefined;
} {
  if (chatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
    return { nextChatSessionState: chatSessionState, selectedConversationSession: undefined };
  }

  const selectedConversationSession =
    chatSessionState.conversationSessionSelectionState.conversationSessions[
      chatSessionState.conversationSessionSelectionState.highlightedConversationSessionIndex
    ];
  if (!selectedConversationSession) {
    return { nextChatSessionState: chatSessionState, selectedConversationSession: undefined };
  }

  return {
    selectedConversationSession,
    nextChatSessionState: {
      ...chatSessionState,
      conversationSessionSelectionState: { step: "hidden" },
      promptDraft: "",
      promptDraftCursorOffset: 0,
    },
  };
}

function clampConversationSessionSelectionIndex(highlightedConversationSessionIndex: number, conversationSessionCount: number): number {
  if (conversationSessionCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(highlightedConversationSessionIndex, conversationSessionCount - 1));
}
