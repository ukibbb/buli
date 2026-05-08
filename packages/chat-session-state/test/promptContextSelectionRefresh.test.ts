import { expect, test } from "bun:test";
import {
  createInitialChatSessionState,
  decidePromptContextSelectionRefreshForCurrentDraft,
  insertTextIntoPromptDraftAtCursor,
  showCommandHelpModal,
  showPromptContextCandidatesForSelection,
  type PromptContextSelectionRefreshDecision,
} from "../src/index.ts";

test("decidePromptContextSelectionRefreshForCurrentDraft requests a fuzzy candidate load for an active text query", () => {
  const chatSessionState = insertTextIntoPromptDraftAtCursor(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "@pr",
  );

  const decision = decidePromptContextSelectionRefreshForCurrentDraft({
    chatSessionState,
    dismissedPromptContextQueryIdentity: undefined,
  });

  expect(decision).toEqual({
    decisionType: "load_prompt_context_candidates",
    promptContextQueryIdentity: {
      promptContextQueryStartOffset: 0,
      promptContextRawQueryText: "pr",
    },
    promptContextQueryText: "pr",
    promptContextQueryLoadStrategy: "fuzzy_query",
  } satisfies PromptContextSelectionRefreshDecision);
});

test("decidePromptContextSelectionRefreshForCurrentDraft hides the picker when another interaction owns the screen", () => {
  const decision = decidePromptContextSelectionRefreshForCurrentDraft({
    chatSessionState: showCommandHelpModal(createInitialChatSessionState({ selectedModelId: "gpt-5.4" })),
    dismissedPromptContextQueryIdentity: undefined,
  });

  expect(decision).toEqual({
    decisionType: "hide_prompt_context_selection",
    reason: "interaction_scope_changed",
  } satisfies PromptContextSelectionRefreshDecision);
});

test("decidePromptContextSelectionRefreshForCurrentDraft keeps an already loaded query visible", () => {
  const chatSessionState = showPromptContextCandidatesForSelection(
    insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "@pr"),
    "pr",
    [],
  );

  const decision = decidePromptContextSelectionRefreshForCurrentDraft({
    chatSessionState,
    dismissedPromptContextQueryIdentity: undefined,
  });

  expect(decision).toEqual({
    decisionType: "keep_current_prompt_context_selection",
  } satisfies PromptContextSelectionRefreshDecision);
});

test("decidePromptContextSelectionRefreshForCurrentDraft hides a dismissed query", () => {
  const chatSessionState = insertTextIntoPromptDraftAtCursor(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "@pr",
  );

  const decision = decidePromptContextSelectionRefreshForCurrentDraft({
    chatSessionState,
    dismissedPromptContextQueryIdentity: {
      promptContextQueryStartOffset: 0,
      promptContextRawQueryText: "pr",
    },
  });

  expect(decision).toEqual({
    decisionType: "hide_prompt_context_selection",
    reason: "query_dismissed",
    promptContextQueryLength: 2,
  } satisfies PromptContextSelectionRefreshDecision);
});
