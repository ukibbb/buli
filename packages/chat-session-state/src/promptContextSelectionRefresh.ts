import {
  determinePromptContextQueryLoadStrategy,
  extractActivePromptContextQueryFromPromptDraft,
  type PromptContextQueryLoadStrategy,
} from "@buli/engine";
import type { ChatSessionState } from "./chatSessionState.ts";
import {
  buildPromptContextQueryIdentity,
  doPromptContextQueriesMatch,
  shouldHideResolvedPromptContextCandidatesForQuery,
  type PromptContextQueryIdentity,
} from "./promptContextQueryIdentity.ts";

export type PromptContextSelectionRefreshDecision =
  | {
      decisionType: "hide_prompt_context_selection";
      reason: "interaction_scope_changed" | "no_active_query" | "query_dismissed";
      promptContextQueryLength?: number | undefined;
    }
  | {
      decisionType: "keep_current_prompt_context_selection";
    }
  | {
      decisionType: "load_prompt_context_candidates";
      promptContextQueryIdentity: PromptContextQueryIdentity;
      promptContextQueryText: string;
      promptContextQueryLoadStrategy: PromptContextQueryLoadStrategy;
    };

export function shouldClearDismissedPromptContextQueryForPromptDraft(input: {
  chatSessionState: ChatSessionState;
  dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined;
}): boolean {
  const currentPromptContextQueryIdentity = buildPromptContextQueryIdentity(
    extractActivePromptContextQueryFromPromptDraft(
      input.chatSessionState.promptDraft,
      input.chatSessionState.promptDraftCursorOffset,
    ),
  );

  return !doPromptContextQueriesMatch(currentPromptContextQueryIdentity, input.dismissedPromptContextQueryIdentity);
}

export function decidePromptContextSelectionRefreshForCurrentDraft(input: {
  chatSessionState: ChatSessionState;
  dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined;
}): PromptContextSelectionRefreshDecision {
  const shouldHidePromptContextSelection =
    input.chatSessionState.isCommandHelpModalVisible ||
    input.chatSessionState.conversationTurnStatus !== "waiting_for_user_input" ||
    input.chatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
    input.chatSessionState.conversationSessionSelectionState.step !== "hidden" ||
    input.chatSessionState.slashCommandSelectionState.step !== "hidden";

  if (shouldHidePromptContextSelection) {
    return {
      decisionType: "hide_prompt_context_selection",
      reason: "interaction_scope_changed",
    };
  }

  const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
    input.chatSessionState.promptDraft,
    input.chatSessionState.promptDraftCursorOffset,
  );
  if (!activePromptContextQuery) {
    return {
      decisionType: "hide_prompt_context_selection",
      reason: "no_active_query",
    };
  }

  const requestedPromptContextQueryIdentity = buildPromptContextQueryIdentity(activePromptContextQuery);
  if (!requestedPromptContextQueryIdentity) {
    return { decisionType: "keep_current_prompt_context_selection" };
  }

  if (doPromptContextQueriesMatch(requestedPromptContextQueryIdentity, input.dismissedPromptContextQueryIdentity)) {
    return {
      decisionType: "hide_prompt_context_selection",
      reason: "query_dismissed",
      promptContextQueryLength: activePromptContextQuery.decodedQueryText.length,
    };
  }

  if (
    input.chatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" &&
    input.chatSessionState.promptContextSelectionState.promptContextQueryText === activePromptContextQuery.decodedQueryText
  ) {
    return { decisionType: "keep_current_prompt_context_selection" };
  }

  return {
    decisionType: "load_prompt_context_candidates",
    promptContextQueryIdentity: requestedPromptContextQueryIdentity,
    promptContextQueryText: activePromptContextQuery.decodedQueryText,
    promptContextQueryLoadStrategy: determinePromptContextQueryLoadStrategy(activePromptContextQuery.decodedQueryText),
  };
}

export function shouldHideLoadedPromptContextCandidatesForCurrentDraft(input: {
  chatSessionState: ChatSessionState;
  dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined;
  requestedPromptContextQueryIdentity: PromptContextQueryIdentity;
}): boolean {
  const currentPromptContextQueryIdentity = buildPromptContextQueryIdentity(
    extractActivePromptContextQueryFromPromptDraft(
      input.chatSessionState.promptDraft,
      input.chatSessionState.promptDraftCursorOffset,
    ),
  );

  return shouldHideResolvedPromptContextCandidatesForQuery({
    currentPromptContextQueryIdentity,
    dismissedPromptContextQueryIdentity: input.dismissedPromptContextQueryIdentity,
    requestedPromptContextQueryIdentity: input.requestedPromptContextQueryIdentity,
  });
}
