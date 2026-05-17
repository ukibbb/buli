import type { PromptDraftDisplaySegment } from "./types.ts";
import { parsePromptContextReferencesFromPromptText } from "./parsePromptContextReferencesFromPromptText.ts";

export function buildPromptContextDisplaySegments(input: {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[];
}): PromptDraftDisplaySegment[] {
  if (input.promptDraft.length === 0) {
    return [{ segmentKind: "plain_text", text: "" }];
  }

  const promptDraftDisplaySegments: PromptDraftDisplaySegment[] = [];
  const parsedPromptContextReferences = parsePromptContextReferencesFromPromptText(input.promptDraft);
  let cursorOffset = 0;

  for (const selectedPromptContextReferenceText of input.selectedPromptContextReferenceTexts) {
    const matchedPromptContextReference = parsedPromptContextReferences.find(
      (parsedPromptContextReference) =>
        parsedPromptContextReference.startOffset >= cursorOffset &&
        parsedPromptContextReference.promptReferenceText === selectedPromptContextReferenceText,
    );
    if (!matchedPromptContextReference) {
      continue;
    }

    if (matchedPromptContextReference.startOffset > cursorOffset) {
      promptDraftDisplaySegments.push({
        segmentKind: "plain_text",
        text: input.promptDraft.slice(cursorOffset, matchedPromptContextReference.startOffset),
      });
    }

    promptDraftDisplaySegments.push({
      segmentKind: "selected_prompt_context_reference",
      text: selectedPromptContextReferenceText,
    });
    cursorOffset = matchedPromptContextReference.endOffset;
  }

  if (cursorOffset < input.promptDraft.length) {
    promptDraftDisplaySegments.push({
      segmentKind: "plain_text",
      text: input.promptDraft.slice(cursorOffset),
    });
  }

  if (promptDraftDisplaySegments.length === 0) {
    return [{ segmentKind: "plain_text", text: input.promptDraft }];
  }

  return promptDraftDisplaySegments;
}
