import { extractTrailingPromptContextQueryFromPromptDraft } from "./extractTrailingPromptContextQueryFromPromptDraft.ts";

export function replaceTrailingPromptContextQueryWithSelectedReference(input: {
  promptDraft: string;
  selectedPromptContextReferenceText: string;
}): string {
  const trailingPromptContextQuery = extractTrailingPromptContextQueryFromPromptDraft(input.promptDraft);
  if (!trailingPromptContextQuery) {
    return input.promptDraft;
  }

  const promptDraftPrefix = input.promptDraft.slice(0, trailingPromptContextQuery.startOffset);
  return `${promptDraftPrefix}${input.selectedPromptContextReferenceText}`;
}
