import type { ActivePromptContextQuery } from "./types.ts";

export function replaceActivePromptContextQueryWithSelectedReference(input: {
  promptDraft: string;
  activePromptContextQuery: ActivePromptContextQuery;
  selectedPromptContextReferenceText: string;
}): string {
  const promptDraftPrefix = input.promptDraft.slice(0, input.activePromptContextQuery.startOffset);
  const promptDraftSuffix = input.promptDraft.slice(input.activePromptContextQuery.endOffset);
  return `${promptDraftPrefix}${input.selectedPromptContextReferenceText}${promptDraftSuffix}`;
}
