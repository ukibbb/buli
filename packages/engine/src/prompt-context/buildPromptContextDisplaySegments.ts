import type { PromptDraftDisplaySegment } from "./types.ts";

export function buildPromptContextDisplaySegments(input: {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[];
}): PromptDraftDisplaySegment[] {
  if (input.promptDraft.length === 0) {
    return [{ segmentKind: "plain_text", text: "" }];
  }

  const promptDraftDisplaySegments: PromptDraftDisplaySegment[] = [];
  let cursorOffset = 0;

  for (const selectedPromptContextReferenceText of input.selectedPromptContextReferenceTexts) {
    const matchedOffset = input.promptDraft.indexOf(selectedPromptContextReferenceText, cursorOffset);
    if (matchedOffset === -1) {
      continue;
    }

    if (matchedOffset > cursorOffset) {
      promptDraftDisplaySegments.push({
        segmentKind: "plain_text",
        text: input.promptDraft.slice(cursorOffset, matchedOffset),
      });
    }

    promptDraftDisplaySegments.push({
      segmentKind: "selected_prompt_context_reference",
      text: selectedPromptContextReferenceText,
    });
    cursorOffset = matchedOffset + selectedPromptContextReferenceText.length;
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
