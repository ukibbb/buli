import { parsePromptContextReferencesFromPromptText } from "./parsePromptContextReferencesFromPromptText.ts";

export function reconcileSelectedPromptContextReferenceTextsWithPromptDraft(input: {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[];
}): string[] {
  const reconciledPromptContextReferenceTexts: string[] = [];
  const parsedPromptContextReferences = parsePromptContextReferencesFromPromptText(input.promptDraft);
  let searchStartOffset = 0;

  for (const selectedPromptContextReferenceText of input.selectedPromptContextReferenceTexts) {
    if (selectedPromptContextReferenceText.length === 0) {
      continue;
    }

    const matchedPromptContextReference = parsedPromptContextReferences.find(
      (parsedPromptContextReference) =>
        parsedPromptContextReference.startOffset >= searchStartOffset &&
        parsedPromptContextReference.promptReferenceText === selectedPromptContextReferenceText,
    );
    if (!matchedPromptContextReference) {
      continue;
    }

    reconciledPromptContextReferenceTexts.push(selectedPromptContextReferenceText);
    searchStartOffset = matchedPromptContextReference.endOffset;
  }

  return reconciledPromptContextReferenceTexts;
}
