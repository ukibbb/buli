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

export type LoadChatAppPromptContextCandidates = (
  promptContextQueryText: string,
) => Promise<readonly PromptContextCandidate[]>;

export type UseChatAppPromptContextSelectionRefreshInput = {
  chatSessionState: ChatSessionState;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  loadPromptContextCandidates: LoadChatAppPromptContextCandidates;
};

export type UseChatAppPromptContextSelectionRefreshResult = {
  dismissActivePromptContextQuery: (dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined) => void;
  refreshPromptContextSelectionForChatSessionState: (chatSessionState: ChatSessionState) => void;
};

export function useChatAppPromptContextSelectionRefresh(
  input: UseChatAppPromptContextSelectionRefreshInput,
): UseChatAppPromptContextSelectionRefreshResult {
  const latestChatSessionStateRef = useRef<ChatSessionState>(input.chatSessionState);
  const latestPromptContextLoadRequestSequenceRef = useRef(0);
  const pendingPromptContextLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissedPromptContextQueryRef = useRef<PromptContextQueryIdentity | undefined>(undefined);

  latestChatSessionStateRef.current = input.chatSessionState;

  const clearDismissedPromptContextQueryWhenDraftChanges = (chatSessionState: ChatSessionState): void => {
    if (
      shouldClearDismissedPromptContextQueryForPromptDraft({
        chatSessionState,
        dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
      })
    ) {
      dismissedPromptContextQueryRef.current = undefined;
    }
  };

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
      let promptContextCandidates: readonly PromptContextCandidate[];
      try {
        promptContextCandidates = await input.loadPromptContextCandidates(loadRequest.promptContextQueryText);
      } catch {
        if (loadRequest.requestSequence === latestPromptContextLoadRequestSequenceRef.current) {
          input.setChatSessionState((currentChatSessionState) => {
            const nextChatSessionState = hidePromptContextSelection(currentChatSessionState);
            latestChatSessionStateRef.current = nextChatSessionState;
            return nextChatSessionState;
          });
        }
        return;
      }

      if (loadRequest.requestSequence !== latestPromptContextLoadRequestSequenceRef.current) {
        return;
      }

      if (
        shouldHideLoadedPromptContextCandidatesForCurrentDraft({
          chatSessionState: latestChatSessionStateRef.current,
          dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
          requestedPromptContextQueryIdentity: loadRequest.promptContextQueryIdentity,
        })
      ) {
        return;
      }

      input.setChatSessionState((currentChatSessionState) => {
        const nextChatSessionState = currentChatSessionState.promptContextSelectionState.step ===
            "showing_prompt_context_candidates" &&
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
          );
        latestChatSessionStateRef.current = nextChatSessionState;
        return nextChatSessionState;
      });
    },
  );

  const refreshPromptContextSelectionForChatSessionState = useEffectEvent((chatSessionState: ChatSessionState) => {
    latestChatSessionStateRef.current = chatSessionState;
    clearDismissedPromptContextQueryWhenDraftChanges(chatSessionState);
    const promptContextSelectionRefreshDecision = decidePromptContextSelectionRefreshForCurrentDraft({
      chatSessionState,
      dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
    });

    if (promptContextSelectionRefreshDecision.decisionType === "hide_prompt_context_selection") {
      invalidatePendingPromptContextLoads();
      input.setChatSessionState((currentChatSessionState) => {
        const nextChatSessionState = hidePromptContextSelection(currentChatSessionState);
        latestChatSessionStateRef.current = nextChatSessionState;
        return nextChatSessionState;
      });
      return;
    }

    if (promptContextSelectionRefreshDecision.decisionType === "keep_current_prompt_context_selection") {
      return;
    }

    invalidatePendingPromptContextLoads();
    const requestSequence = latestPromptContextLoadRequestSequenceRef.current;

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

  const dismissActivePromptContextQuery = useEffectEvent((
    dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined,
  ): void => {
    dismissedPromptContextQueryRef.current = dismissedPromptContextQueryIdentity;
  });

  return { dismissActivePromptContextQuery, refreshPromptContextSelectionForChatSessionState };
}
