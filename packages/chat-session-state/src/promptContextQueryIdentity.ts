import type { ActivePromptContextQuery } from "@buli/engine";

export type PromptContextQueryIdentity = {
  promptContextQueryStartOffset: number;
  promptContextRawQueryText: string;
};

export function buildPromptContextQueryIdentity(
  activePromptContextQuery: ActivePromptContextQuery | undefined,
): PromptContextQueryIdentity | undefined {
  if (!activePromptContextQuery) {
    return undefined;
  }

  return {
    promptContextQueryStartOffset: activePromptContextQuery.startOffset,
    promptContextRawQueryText: activePromptContextQuery.rawQueryText,
  };
}

export function doPromptContextQueriesMatch(
  leftPromptContextQueryIdentity: PromptContextQueryIdentity | undefined,
  rightPromptContextQueryIdentity: PromptContextQueryIdentity | undefined,
): boolean {
  return leftPromptContextQueryIdentity?.promptContextQueryStartOffset === rightPromptContextQueryIdentity?.promptContextQueryStartOffset
    && leftPromptContextQueryIdentity?.promptContextRawQueryText === rightPromptContextQueryIdentity?.promptContextRawQueryText;
}

export function shouldHideResolvedPromptContextCandidatesForQuery(input: {
  currentPromptContextQueryIdentity: PromptContextQueryIdentity | undefined;
  dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined;
  requestedPromptContextQueryIdentity: PromptContextQueryIdentity;
}): boolean {
  if (!doPromptContextQueriesMatch(input.currentPromptContextQueryIdentity, input.requestedPromptContextQueryIdentity)) {
    return true;
  }

  return doPromptContextQueriesMatch(input.currentPromptContextQueryIdentity, input.dismissedPromptContextQueryIdentity);
}
