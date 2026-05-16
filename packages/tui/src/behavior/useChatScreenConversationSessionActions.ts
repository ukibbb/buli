import { emitBuliDiagnosticLogEvent, type ConversationSessionEntry, type ConversationSessionSummary, type BuliDiagnosticLogFields, type BuliDiagnosticLogger } from "@buli/contracts";
import type { ConversationAutoCompactionRequest, ConversationAutoCompactionResult, ConversationCompactionRequest } from "@buli/engine";
import {
  clearConversationTranscript,
  hydrateConversationTranscriptFromSessionEntries,
  showAvailableConversationSessionsForSelection,
  showConversationSessionSelectionLoadingError,
  showConversationSessionSelectionLoadingState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { startTransition, useEffectEvent, useRef, type Dispatch, type SetStateAction } from "react";
import type { ConversationSessionCompactionStatus, ConversationSessionExportStatus } from "./chatScreenConversationSessionStatus.ts";

type MutableValueRef<T> = { current: T };

export type ConversationSessionSwitchResult = {
  conversationSessionId: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ConversationSessionExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

export type ConversationSessionCompactionResult = {
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type UseChatScreenConversationSessionActionsInput = {
  loadConversationSessions?: (() => Promise<readonly ConversationSessionSummary[]> | readonly ConversationSessionSummary[]) | undefined;
  switchConversationSession?:
    | ((conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult)
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
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type UseChatScreenConversationSessionActionsResult = {
  hydrateConversationSessionEntriesIntoChatScreen: (conversationSessionEntries: readonly ConversationSessionEntry[]) => void;
  loadConversationSessionsForSelection: () => Promise<void>;
  switchToConversationSession: (conversationSessionId: string) => Promise<void>;
  exportCurrentConversationSession: () => Promise<void>;
  compactCurrentConversationSession: () => Promise<void>;
  autoCompactCurrentConversationSessionAfterAssistantTurn: () => Promise<void>;
  clearCurrentConversationSession: () => void;
};

function logChatScreenDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "tui",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

export function useChatScreenConversationSessionActions(
  input: UseChatScreenConversationSessionActionsInput,
): UseChatScreenConversationSessionActionsResult {
  const latestConversationSessionListLoadRequestSequenceRef = useRef(0);
  const latestConversationSessionMutationRequestSequenceRef = useRef(0);

  const hydrateConversationSessionEntriesIntoChatScreen = useEffectEvent(
    (conversationSessionEntries: readonly ConversationSessionEntry[]): void => {
      startTransition(() => {
        input.setChatSessionState((currentChatSessionState) => {
          const nextChatSessionState = hydrateConversationTranscriptFromSessionEntries(
            currentChatSessionState,
            conversationSessionEntries,
          );
          input.latestChatSessionStateRef.current = nextChatSessionState;
          return nextChatSessionState;
        });
      });
    },
  );

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
      hydrateConversationSessionEntriesIntoChatScreen(switchedConversationSession.conversationSessionEntries);
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
    input.setConversationSessionCompactionStatus({ step: "compacting", source: "manual" });
    try {
      const compactedConversationSession = await input.compactCurrentConversationSession({
        selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
        ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
          ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
          : {}),
      });
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      hydrateConversationSessionEntriesIntoChatScreen(compactedConversationSession.conversationSessionEntries);
      input.setConversationSessionCompactionStatus({ step: "idle" });
    } catch (error) {
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      input.setConversationSessionCompactionStatus({
        step: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      input.isConversationCompactionInFlightRef.current = false;
      input.isPromptSubmissionInFlightRef.current = wasPromptSubmissionInFlight;
    }
  });

  const autoCompactCurrentConversationSessionAfterAssistantTurn = useEffectEvent(async (): Promise<void> => {
    if (!input.autoCompactCurrentConversationSession) {
      return;
    }

    const latestTokenUsage = input.latestChatSessionStateRef.current.latestTokenUsage;
    if (!latestTokenUsage || input.isConversationCompactionInFlightRef.current) {
      return;
    }

    const requestSequence = latestConversationSessionMutationRequestSequenceRef.current + 1;
    latestConversationSessionMutationRequestSequenceRef.current = requestSequence;
    input.isConversationCompactionInFlightRef.current = true;
    input.setConversationSessionCompactionStatus({ step: "compacting", source: "auto" });
    try {
      const autoCompactionRequest: ConversationAutoCompactionRequest = {
        selectedModelId: input.latestChatSessionStateRef.current.selectedModelId,
        ...(input.latestChatSessionStateRef.current.selectedReasoningEffort
          ? { selectedReasoningEffort: input.latestChatSessionStateRef.current.selectedReasoningEffort }
          : {}),
        latestTokenUsage,
      };
      const autoCompactionResult = await input.autoCompactCurrentConversationSession(autoCompactionRequest);
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      if (autoCompactionResult.didCompact) {
        hydrateConversationSessionEntriesIntoChatScreen(autoCompactionResult.conversationSessionEntries);
      }
      input.setConversationSessionCompactionStatus({ step: "idle" });
    } catch (error) {
      if (requestSequence !== latestConversationSessionMutationRequestSequenceRef.current) {
        return;
      }
      input.setConversationSessionCompactionStatus({
        step: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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
      hydrateConversationSessionEntriesIntoChatScreen(clearedConversationSession.conversationSessionEntries);
    } else {
      input.setChatSessionState((currentChatSessionState) => {
        const nextChatSessionState = clearConversationTranscript(currentChatSessionState);
        input.latestChatSessionStateRef.current = nextChatSessionState;
        return nextChatSessionState;
      });
    }
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.conversation_cleared");
  });

  return {
    hydrateConversationSessionEntriesIntoChatScreen,
    loadConversationSessionsForSelection,
    switchToConversationSession,
    exportCurrentConversationSession,
    compactCurrentConversationSession,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    clearCurrentConversationSession,
  };
}
