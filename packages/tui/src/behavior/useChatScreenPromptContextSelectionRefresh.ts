import type { BuliDiagnosticLogFields, BuliDiagnosticLogger } from "@buli/contracts";
import {
  decidePromptContextSelectionRefreshForCurrentDraft,
  hidePromptContextSelection,
  refreshPromptContextCandidatesForSelection,
  showPromptContextCandidatesForSelection,
  shouldClearDismissedPromptContextQueryForPromptDraft,
  shouldHideLoadedPromptContextCandidatesForCurrentDraft,
  type ChatSessionState,
  type PromptContextQueryIdentity,
} from "@buli/chat-session-state";
import type { PromptContextCandidate } from "@buli/prompt-context-core";
import { useEffect, useEffectEvent, useRef, type Dispatch, type SetStateAction } from "react";

const FUZZY_PROMPT_CONTEXT_QUERY_DEBOUNCE_MS = 120;

export type LoadChatScreenPromptContextCandidates = (
  promptContextQueryText: string,
) => Promise<readonly PromptContextCandidate[]>;

export type UseChatScreenPromptContextSelectionRefreshInput = {
  chatSessionState: ChatSessionState;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  loadPromptContextCandidates: LoadChatScreenPromptContextCandidates;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type UseChatScreenPromptContextSelectionRefreshResult = {
  dismissActivePromptContextQuery: (dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined) => void;
};

function logChatScreenDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  diagnosticLogger?.({
    subsystem: "tui",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

export function useChatScreenPromptContextSelectionRefresh(
  input: UseChatScreenPromptContextSelectionRefreshInput,
): UseChatScreenPromptContextSelectionRefreshResult {
  const latestChatSessionStateRef = useRef<ChatSessionState>(input.chatSessionState);
  const latestPromptContextLoadRequestSequenceRef = useRef(0);
  const pendingPromptContextLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissedPromptContextQueryRef = useRef<PromptContextQueryIdentity | undefined>(undefined);

  latestChatSessionStateRef.current = input.chatSessionState;

  useEffect(() => {
    if (
      shouldClearDismissedPromptContextQueryForPromptDraft({
        chatSessionState: input.chatSessionState,
        dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
      })
    ) {
      dismissedPromptContextQueryRef.current = undefined;
    }
  }, [input.chatSessionState.promptDraft, input.chatSessionState.promptDraftCursorOffset]);

  const invalidatePendingPromptContextLoads = useEffectEvent(() => {
    latestPromptContextLoadRequestSequenceRef.current += 1;
    if (pendingPromptContextLoadTimeoutRef.current !== undefined) {
      clearTimeout(pendingPromptContextLoadTimeoutRef.current);
      pendingPromptContextLoadTimeoutRef.current = undefined;
    }
  });

  const loadPromptContextCandidatesForQuery = useEffectEvent(
    async (loadRequest: {
      requestSequence: number;
      promptContextQueryIdentity: PromptContextQueryIdentity;
      promptContextQueryText: string;
    }) => {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_load_started", {
        requestSequence: loadRequest.requestSequence,
        promptContextQueryLength: loadRequest.promptContextQueryText.length,
      });
      const promptContextCandidates = await input.loadPromptContextCandidates(loadRequest.promptContextQueryText);
      if (loadRequest.requestSequence !== latestPromptContextLoadRequestSequenceRef.current) {
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_load_discarded", {
          requestSequence: loadRequest.requestSequence,
          activeRequestSequence: latestPromptContextLoadRequestSequenceRef.current,
          promptContextCandidateCount: promptContextCandidates.length,
        });
        return;
      }

      if (
        shouldHideLoadedPromptContextCandidatesForCurrentDraft({
          chatSessionState: latestChatSessionStateRef.current,
          dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
          requestedPromptContextQueryIdentity: loadRequest.promptContextQueryIdentity,
        })
      ) {
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_load_hidden_after_resolution", {
          requestSequence: loadRequest.requestSequence,
          promptContextCandidateCount: promptContextCandidates.length,
        });
        return;
      }

      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_load_completed", {
        requestSequence: loadRequest.requestSequence,
        promptContextQueryLength: loadRequest.promptContextQueryText.length,
        promptContextCandidateCount: promptContextCandidates.length,
      });

      input.setChatSessionState((currentChatSessionState) =>
        currentChatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" &&
          currentChatSessionState.promptContextSelectionState.promptContextQueryText === loadRequest.promptContextQueryText
          ? refreshPromptContextCandidatesForSelection(
            currentChatSessionState,
            loadRequest.promptContextQueryText,
            promptContextCandidates,
          )
          : showPromptContextCandidatesForSelection(
            currentChatSessionState,
            loadRequest.promptContextQueryText,
            promptContextCandidates,
          ),
      );
    },
  );

  const refreshPromptContextSelectionForCurrentDraft = useEffectEvent(async () => {
    const latestChatSessionState = latestChatSessionStateRef.current;
    const promptContextSelectionRefreshDecision = decidePromptContextSelectionRefreshForCurrentDraft({
      chatSessionState: latestChatSessionState,
      dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
    });

    if (promptContextSelectionRefreshDecision.decisionType === "hide_prompt_context_selection") {
      invalidatePendingPromptContextLoads();
      if (
        latestChatSessionState.promptContextSelectionState.step !== "hidden" ||
        promptContextSelectionRefreshDecision.reason === "query_dismissed"
      ) {
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_selection_hidden", {
          reason: promptContextSelectionRefreshDecision.reason,
          conversationTurnStatus: latestChatSessionState.conversationTurnStatus,
          modelSelectionStep: latestChatSessionState.modelAndReasoningSelectionState.step,
          promptContextQueryLength: promptContextSelectionRefreshDecision.promptContextQueryLength ?? null,
        });
      }
      input.setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
      return;
    }

    if (promptContextSelectionRefreshDecision.decisionType === "keep_current_prompt_context_selection") {
      return;
    }

    invalidatePendingPromptContextLoads();
    const requestSequence = latestPromptContextLoadRequestSequenceRef.current;
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_load_scheduled", {
      requestSequence,
      promptContextQueryLength: promptContextSelectionRefreshDecision.promptContextQueryText.length,
      promptContextQueryLoadStrategy: promptContextSelectionRefreshDecision.promptContextQueryLoadStrategy,
    });

    if (promptContextSelectionRefreshDecision.promptContextQueryLoadStrategy === "fuzzy_query") {
      pendingPromptContextLoadTimeoutRef.current = setTimeout(() => {
        pendingPromptContextLoadTimeoutRef.current = undefined;
        void loadPromptContextCandidatesForQuery({
          requestSequence,
          promptContextQueryIdentity: promptContextSelectionRefreshDecision.promptContextQueryIdentity,
          promptContextQueryText: promptContextSelectionRefreshDecision.promptContextQueryText,
        });
      }, FUZZY_PROMPT_CONTEXT_QUERY_DEBOUNCE_MS);
      return;
    }

    void loadPromptContextCandidatesForQuery({
      requestSequence,
      promptContextQueryIdentity: promptContextSelectionRefreshDecision.promptContextQueryIdentity,
      promptContextQueryText: promptContextSelectionRefreshDecision.promptContextQueryText,
    });
  });

  useEffect(
    () => () => {
      latestPromptContextLoadRequestSequenceRef.current += 1;
      if (pendingPromptContextLoadTimeoutRef.current !== undefined) {
        clearTimeout(pendingPromptContextLoadTimeoutRef.current);
        pendingPromptContextLoadTimeoutRef.current = undefined;
      }
    },
    [],
  );

  useEffect(() => {
    void refreshPromptContextSelectionForCurrentDraft();
  }, [
    input.chatSessionState.promptDraft,
    input.chatSessionState.promptDraftCursorOffset,
    input.chatSessionState.conversationTurnStatus,
    input.chatSessionState.modelAndReasoningSelectionState.step,
    input.chatSessionState.conversationSessionSelectionState.step,
    input.chatSessionState.slashCommandSelectionState.step,
    input.chatSessionState.isCommandHelpModalVisible,
  ]);

  const dismissActivePromptContextQuery = useEffectEvent((
    dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined,
  ): void => {
    dismissedPromptContextQueryRef.current = dismissedPromptContextQueryIdentity;
  });

  return { dismissActivePromptContextQuery };
}
