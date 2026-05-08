import { expect, test } from "bun:test";
import {
  buildPromptContextQueryIdentity,
  doPromptContextQueriesMatch,
  shouldHideResolvedPromptContextCandidatesForQuery,
} from "../src/index.ts";

test("buildPromptContextQueryIdentity_keeps_the_query_start_offset_and_raw_text", () => {
  expect(buildPromptContextQueryIdentity({
    startOffset: 12,
    endOffset: 16,
    rawQueryText: "pro",
    decodedQueryText: "pro",
  })).toEqual({
    promptContextQueryStartOffset: 12,
    promptContextRawQueryText: "pro",
  });
});

test("doPromptContextQueriesMatch_returns_true_only_for_the_same_query_identity", () => {
  const promptContextQueryIdentity = {
    promptContextQueryStartOffset: 7,
    promptContextRawQueryText: "apps/",
  };

  expect(doPromptContextQueriesMatch(promptContextQueryIdentity, promptContextQueryIdentity)).toBe(true);
  expect(doPromptContextQueriesMatch(promptContextQueryIdentity, {
    promptContextQueryStartOffset: 8,
    promptContextRawQueryText: "apps/",
  })).toBe(false);
  expect(doPromptContextQueriesMatch(promptContextQueryIdentity, {
    promptContextQueryStartOffset: 7,
    promptContextRawQueryText: "app",
  })).toBe(false);
});

test("shouldHideResolvedPromptContextCandidatesForQuery_hides_dismissed_and_stale_query_results", () => {
  const requestedPromptContextQueryIdentity = {
    promptContextQueryStartOffset: 4,
    promptContextRawQueryText: "pro",
  };

  expect(shouldHideResolvedPromptContextCandidatesForQuery({
    requestedPromptContextQueryIdentity,
    currentPromptContextQueryIdentity: requestedPromptContextQueryIdentity,
    dismissedPromptContextQueryIdentity: undefined,
  })).toBe(false);
  expect(shouldHideResolvedPromptContextCandidatesForQuery({
    requestedPromptContextQueryIdentity,
    currentPromptContextQueryIdentity: {
      promptContextQueryStartOffset: 4,
      promptContextRawQueryText: "proj",
    },
    dismissedPromptContextQueryIdentity: undefined,
  })).toBe(true);
  expect(shouldHideResolvedPromptContextCandidatesForQuery({
    requestedPromptContextQueryIdentity,
    currentPromptContextQueryIdentity: requestedPromptContextQueryIdentity,
    dismissedPromptContextQueryIdentity: requestedPromptContextQueryIdentity,
  })).toBe(true);
});
