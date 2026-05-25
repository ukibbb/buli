import type {
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
} from "@buli/contracts";
import type { ConversationAutoCompactionRequest, ConversationAutoCompactionResult, ConversationCompactionRequest } from "@buli/engine";
import {
  clearConversationTranscript,
  applyConversationSessionModelSelectionToChatSessionState,
  hydrateConversationTranscriptFromSessionEntries,
  removeConversationCompactionProgressFromTranscript,
  requestConversationSessionDeletionConfirmation,
  showAvailableConversationSessionsForSelection,
  showConversationSessionSelectionLoadingError,
  showConversationSessionSelectionLoadingState,
  type ChatSessionState,
  upsertConversationCompactionProgressInTranscript,
} from "@buli/chat-session-state";
import { startTransition, useEffectEvent, useRef, type Dispatch, type SetStateAction } from "react";
import type { ConversationSessionCompactionStatus, ConversationSessionExportStatus } from "./conversationSessionStatus.ts";

type MutableValueRef<T> = { current: T };

export type ConversationSessionSwitchResult = {
  conversationSessionId: string;
  modelSelection?: ConversationSessionModelSelection | undefined;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ConversationSessionDeleteResult = {
  deletedConversationSessionId: string;
  activeConversationSessionId: string;
  activeConversationSessionModelSelection?: ConversationSessionModelSelection | undefined;
  activeConversationSessionEntries: readonly ConversationSessionEntry[];
  conversationSessions: readonly ConversationSessionSummary[];
};

export type ConversationSessionExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

export type ConversationSessionCompactionResult = {
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type AutoCompactionAfterAssistantTurnRequest = {
  requestTriggerKind?: ConversationAutoCompactionRequest["requestTriggerKind"] | undefined;
};

type ConversationSessionHydrationInput = {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  modelSelection?: ConversationSessionModelSelection | undefined;
};

export type UseChatAppConversationSessionActionsInput = {
  loadConversationSessions?: (() => Promise<readonly ConversationSessionSummary[]> | readonly ConversationSessionSummary[]) | undefined;
  switchConversationSession?:
    | ((conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult)
    | undefined;
  deleteConversationSession?:
    | ((conversationSessionId: string) => Promise<ConversationSessionDeleteResult> | ConversationSessionDeleteResult)
    | undefined;
  exportCurrentConversationSession?: (() => Promise<ConversationSessionExportResult> | ConversationSessionExportResult) | undefined;
  compactCurrentConversationSession?:
    | ((input: ConversationCompactionRequest) => Promise<ConversationSessionCompactionResult> | ConversationSessionCompactionResult)
    | undefined;
  autoCompactCurrentConversationSession?:
    | ((input: ConversationAutoCompactionRequest) => Promise<ConversationAutoCompactionResult> | ConversationAutoCompactionResult)
    | undefined;
  onConversationCleared?: (() => ConversationSessionSwitchResult | void) | undefined;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  latestActiveConversationSessionIdRef: MutableValueRef<string | undefined>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  isConversationCompactionInFlightRef: MutableValueRef<boolean>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  setActiveConversationSessionId: Dispatch<SetStateAction<string | undefined>>;
  setConversationSessionExportStatus: Dispatch<SetStateAction<ConversationSessionExportStatus>>;
  setConversationSessionCompactionStatus: Dispatch<SetStateAction<ConversationSessionCompactionStatus>>;
};

export type UseChatAppConversationSessionActionsResult = {
  hydrateConversationSessionEntriesIntoChatApp: (conversationSessionEntries: readonly ConversationSessionEntry[]) => void;
  loadConversationSessionsForSelection: () => Promise<void>;
  switchToConversationSession: (conversationSessionId: string) => Promise<void>;
  requestConversationSessionDeletion: (conversationSessionId: string) => Promise<void>;
  exportCurrentConversationSession: () => Promise<void>;
  compactCurrentConversationSession: () => Promise<void>;
  autoCompactCurrentConversationSessionAfterAssistantTurn: (
    input?: AutoCompactionAfterAssistantTurnRequest,
  ) => Promise<ConversationAutoCompactionResult | undefined>;
  clearCurrentConversationSession: () => void;
};

export function useChatAppConversationSessionActions(
  input: UseChatAppConversationSessionActionsInput,
): UseChatAppConversationSessionActionsResult {
  const latestConversationSessionListLoadRequestSequenceRef = useRef(0);
  const latestConversationSessionMutationRequestSequenceRef = useRef(0);

  const hydrateConversationSessionIntoChatApp = useEffectEvent(
    (conversationSessionHydrationInput: ConversationSessionHydrationInput): void => {
      const hydratedChatSessionState = hydrateConversationTranscriptFromSessionEntries(
        input.latestChatSessionStateRef.current,
        conversationSessionHydrationInput.conversationSessionEntries,
      );
      const nextChatSessionState = conversationSessionHydrationInput.modelSelection
        ? applyConversationSessionModelSelectionToChatSessionState(
          hydratedChatSessionState,
          conversationSessionHydrationInput.modelSelection,
        )
        : hydratedChatSessionState;
      input.latestChatSessionStateRef.current = nextChatSessionState;
      startTransition(() => {
        input.setChatSessionState(nextChatSessionState);
      });
    },
  );
  const hydrateConversationSessionEntriesIntoChatApp = useEffectEvent(
    (conversationSessionEntries: readonly ConversationSessionEntry[]): void => {
      hydrateConversationSessionIntoChatApp({ conversationSessionEntries });
    },
  );
  const upsertConversationCompactionProgressIntoChatApp = useEffectEvent((inputProgress: {
    source: "manual" | "auto";
    summaryText: string;
    compactionStartedAtMs: number;
  }): void => {
    const nextChatSessionState = upsertConversationCompactionProgressInTranscript({
      chatSessionState: input.latestChatSessionStateRef.current,
      source: inputProgress.source,
      summaryText: inputProgress.summaryText,
      compactionStartedAtMs: inputProgress.compactionStartedAtMs,
    });
    input.latestChatSessionStateRef.current = nextChatSessionState;
    startTransition(() => {
      input.setChatSessionState(nextChatSessionState);
    });
  });
  const removeConversationCompactionProgressFromChatApp = useEffectEvent((): void => {
    const nextChatSessionState = removeConversationCompactionProgressFromTranscript(input.latestChatSessionStateRef.current);
    input.latestChatSessionStateRef.current = nextChatSessionState;
    startTransition(() => {
      input.setChatSessionState(nextChatSessionState);
    });
  });

  const loadConversationSessionsForSelection = useEffectEvent(async (): Promise<void> => {
    if (!input.loadConversationSessions) {
      input.setChatSessionState((currentChatSessionState) =>
        showConversationSessionSelectionLoadingError(currentChatSessionState, "Session switching is unavailable."),
      );
      return;
    }

    const requestSequence = latestConversationSessionListLoadRequestSequenceRef.current + 1;
    latestConversationSessionListLoadRequestSequenceRef.current = requestSequence;
    input.setChatSessionState((currentChatSessionState) => showConversationSessionSelectionLoadingState(currentChatSessionState));
    try {
      const conversationSessions = await input.loadConversationSessions();
      if (requestSequence !== latestConversationSessionListLoadRequestSequenceRef.current) {
        return;
      }
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showAvailableConversationSessionsForSelection(
            currentChatSessionState,
            conversationSessions,
            input.latestActiveConversationSessionIdRef.current,
          ),
        );
      });
    } catch (error) {
      if (requestSequence !== latestConversationSessionListLoadRequestSequenceRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showConversationSessionSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  const switchToConversationSession = useEffectEvent(async (conversationSessionId: string): Promise<void> => {
    if (!input.switchConversationSession) {
      input.setChatSessionState((currentChatSessionState) =>
        showConversationSessionSelectionLoadingError(currentChatSessionState, "Session switching is unavailable."),
      );
      return;
    }

    const requestSequence = latestConversationSessionMutationRequestSequenceRef.current + 1;
    latestConversationSessionMutationRequestSequenceRef.current = requestSequence;
    try {
      const switchedConversationSession = await input.switchConversationSession(conversationSessionId);
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      input.latestActiveConversationSessionIdRef.current = switchedConversationSession.conversationSessionId;
      input.setActiveConversationSessionId(switchedConversationSession.conversationSessionId);
      hydrateConversationSessionIntoChatApp({
        conversationSessionEntries: switchedConversationSession.conversationSessionEntries,
        ...(switchedConversationSession.modelSelection
          ? { modelSelection: switchedConversationSession.modelSelection }
          : {}),
      });
    } catch (error) {
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showConversationSessionSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  const requestConversationSessionDeletion = useEffectEvent(async (conversationSessionId: string): Promise<void> => {
    const currentConversationSessionSelectionState = input.latestChatSessionStateRef.current.conversationSessionSelectionState;
    const isDeletionConfirmed = currentConversationSessionSelectionState.step === "showing_conversation_sessions" &&
      currentConversationSessionSelectionState.pendingDeletionConversationSessionId === conversationSessionId;

    if (!isDeletionConfirmed) {
      input.setChatSessionState((currentChatSessionState) => {
        const nextChatSessionState = requestConversationSessionDeletionConfirmation(
          currentChatSessionState,
          conversationSessionId,
        );
        input.latestChatSessionStateRef.current = nextChatSessionState;
        return nextChatSessionState;
      });
      return;
    }

    if (!input.deleteConversationSession) {
      input.setChatSessionState((currentChatSessionState) =>
        showConversationSessionSelectionLoadingError(currentChatSessionState, "Session deletion is unavailable."),
      );
      return;
    }

    const deletedConversationSessionIndex = currentConversationSessionSelectionState.step === "showing_conversation_sessions"
      ? currentConversationSessionSelectionState.conversationSessions.findIndex(
        (conversationSession) => conversationSession.sessionId === conversationSessionId,
      )
      : 0;
    const requestSequence = latestConversationSessionMutationRequestSequenceRef.current + 1;
    latestConversationSessionMutationRequestSequenceRef.current = requestSequence;
    try {
      const deletedConversationSession = await input.deleteConversationSession(conversationSessionId);
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }

      const nextHighlightedConversationSessionIndex = clampConversationSessionSelectionIndex(
        deletedConversationSessionIndex === -1 ? 0 : deletedConversationSessionIndex,
        deletedConversationSession.conversationSessions.length,
      );
      input.latestActiveConversationSessionIdRef.current = deletedConversationSession.activeConversationSessionId;
      input.setActiveConversationSessionId(deletedConversationSession.activeConversationSessionId);
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) => {
          const hydratedChatSessionState = hydrateConversationTranscriptFromSessionEntries(
            currentChatSessionState,
            deletedConversationSession.activeConversationSessionEntries,
          );
          const hydratedChatSessionStateWithModelSelection = deletedConversationSession.activeConversationSessionModelSelection
            ? applyConversationSessionModelSelectionToChatSessionState(
              hydratedChatSessionState,
              deletedConversationSession.activeConversationSessionModelSelection,
            )
            : hydratedChatSessionState;
          const nextChatSessionState = showAvailableConversationSessionsForSelection(
            hydratedChatSessionStateWithModelSelection,
            deletedConversationSession.conversationSessions,
            deletedConversationSession.activeConversationSessionId,
            { highlightedConversationSessionIndex: nextHighlightedConversationSessionIndex },
          );
          input.latestChatSessionStateRef.current = nextChatSessionState;
          return nextChatSessionState;
        });
      });
    } catch (error) {
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) =>
          showConversationSessionSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  const exportCurrentConversationSession = useEffectEvent(async (): Promise<void> => {
    if (!input.exportCurrentConversationSession) {
      input.setConversationSessionExportStatus({ step: "failed", errorMessage: "Session export is unavailable." });
      return;
    }

    input.setConversationSessionExportStatus({ step: "idle" });
    try {
      await input.exportCurrentConversationSession();
    } catch (error) {
      input.setConversationSessionExportStatus({
        step: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const compactCurrentConversationSession = useEffectEvent(async (): Promise<void> => {
    if (!input.compactCurrentConversationSession) {
      input.setConversationSessionCompactionStatus({ step: "failed", errorMessage: "Session compaction is unavailable." });
      return;
    }

    if (input.isConversationCompactionInFlightRef.current) {
      input.setConversationSessionCompactionStatus({ step: "failed", errorMessage: "Session compaction is already running." });
      return;
    }

    const requestSequence = latestConversationSessionMutationRequestSequenceRef.current + 1;
    latestConversationSessionMutationRequestSequenceRef.current = requestSequence;
    input.isConversationCompactionInFlightRef.current = true;
    const wasPromptSubmissionInFlight = input.isPromptSubmissionInFlightRef.current;
    input.isPromptSubmissionInFlightRef.current = true;
    const compactionStartedAtMs = Date.now();
    input.setConversationSessionCompactionStatus({ step: "compacting", source: "manual" });
    try {
      const compactedConversationSession = await input.compactCurrentConversationSession({
        selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
        ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
          ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
          : {}),
        onCompactionSummaryTextUpdated: (summaryText) => {
          if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
            return;
          }
          upsertConversationCompactionProgressIntoChatApp({
            source: "manual",
            summaryText,
            compactionStartedAtMs,
          });
        },
      });
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      hydrateConversationSessionEntriesIntoChatApp(compactedConversationSession.conversationSessionEntries);
      input.setConversationSessionCompactionStatus({ step: "idle" });
    } catch (error) {
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      removeConversationCompactionProgressFromChatApp();
      input.setConversationSessionCompactionStatus({
        step: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      input.isConversationCompactionInFlightRef.current = false;
      input.isPromptSubmissionInFlightRef.current = wasPromptSubmissionInFlight;
    }
  });

  const autoCompactCurrentConversationSessionAfterAssistantTurn = useEffectEvent(async (
    autoCompactionAfterAssistantTurnRequest: AutoCompactionAfterAssistantTurnRequest = {},
  ): Promise<ConversationAutoCompactionResult | undefined> => {
    if (!input.autoCompactCurrentConversationSession) {
      return undefined;
    }

    const latestContextWindowUsage = input.latestChatSessionStateRef.current.latestContextWindowUsage;
    const requestTriggerKind = autoCompactionAfterAssistantTurnRequest.requestTriggerKind ?? "context_usage";
    if (
      input.isConversationCompactionInFlightRef.current ||
      (requestTriggerKind !== "context_window_overflow" && !latestContextWindowUsage)
    ) {
      return undefined;
    }

    const requestSequence = latestConversationSessionMutationRequestSequenceRef.current + 1;
    latestConversationSessionMutationRequestSequenceRef.current = requestSequence;
    input.isConversationCompactionInFlightRef.current = true;
    const compactionStartedAtMs = Date.now();
    input.setConversationSessionCompactionStatus({ step: "compacting", source: "auto" });
    try {
      const autoCompactionRequest: ConversationAutoCompactionRequest = {
        selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
        ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
          ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
          : {}),
        ...(latestContextWindowUsage ? { latestContextWindowUsage } : {}),
        ...(autoCompactionAfterAssistantTurnRequest.requestTriggerKind !== undefined
          ? { requestTriggerKind: autoCompactionAfterAssistantTurnRequest.requestTriggerKind }
          : {}),
        onCompactionSummaryTextUpdated: (summaryText) => {
          if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
            return;
          }
          upsertConversationCompactionProgressIntoChatApp({
            source: "auto",
            summaryText,
            compactionStartedAtMs,
          });
        },
      };
      const autoCompactionResult = await input.autoCompactCurrentConversationSession(autoCompactionRequest);
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return undefined;
      }
      if (autoCompactionResult.didCompact) {
        hydrateConversationSessionEntriesIntoChatApp(autoCompactionResult.conversationSessionEntries);
      } else {
        removeConversationCompactionProgressFromChatApp();
      }
      input.setConversationSessionCompactionStatus({ step: "idle" });
      return autoCompactionResult;
    } catch (error) {
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return undefined;
      }
      removeConversationCompactionProgressFromChatApp();
      input.setConversationSessionCompactionStatus({
        step: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    } finally {
      input.isConversationCompactionInFlightRef.current = false;
    }
  });

  const clearCurrentConversationSession = useEffectEvent((): void => {
    latestConversationSessionMutationRequestSequenceRef.current += 1;
    input.setConversationSessionCompactionStatus({ step: "idle" });
    const clearedConversationSession = input.onConversationCleared?.();
    if (clearedConversationSession) {
      input.latestActiveConversationSessionIdRef.current = clearedConversationSession.conversationSessionId;
      input.setActiveConversationSessionId(clearedConversationSession.conversationSessionId);
      hydrateConversationSessionIntoChatApp({
        conversationSessionEntries: clearedConversationSession.conversationSessionEntries,
        ...(clearedConversationSession.modelSelection
          ? { modelSelection: clearedConversationSession.modelSelection }
          : {}),
      });
    } else {
      input.setChatSessionState((currentChatSessionState) => {
        const nextChatSessionState = clearConversationTranscript(currentChatSessionState);
        input.latestChatSessionStateRef.current = nextChatSessionState;
        return nextChatSessionState;
      });
    }
  });

  return {
    hydrateConversationSessionEntriesIntoChatApp,
    loadConversationSessionsForSelection,
    switchToConversationSession,
    requestConversationSessionDeletion,
    exportCurrentConversationSession,
    compactCurrentConversationSession,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    clearCurrentConversationSession,
  };
}

function clampConversationSessionSelectionIndex(conversationSessionIndex: number, conversationSessionCount: number): number {
  if (conversationSessionCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(conversationSessionIndex, conversationSessionCount - 1));
}
