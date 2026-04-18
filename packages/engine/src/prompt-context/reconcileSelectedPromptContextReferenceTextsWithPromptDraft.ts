export function reconcileSelectedPromptContextReferenceTextsWithPromptDraft(input: {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[];
}): string[] {
  const reconciledPromptContextReferenceTexts: string[] = [];
  let searchStartOffset = 0;

  for (const selectedPromptContextReferenceText of input.selectedPromptContextReferenceTexts) {
    const matchedOffset = input.promptDraft.indexOf(selectedPromptContextReferenceText, searchStartOffset);
    if (matchedOffset === -1) {
      continue;
    }

    reconciledPromptContextReferenceTexts.push(selectedPromptContextReferenceText);
    searchStartOffset = matchedOffset + selectedPromptContextReferenceText.length;
  }

  return reconciledPromptContextReferenceTexts;
}
