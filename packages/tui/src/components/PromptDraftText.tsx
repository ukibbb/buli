import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { buildPromptContextDisplaySegments, type PromptDraftDisplaySegment } from "@buli/engine";

export type PromptDraftTextProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  selectedPromptContextReferenceTexts: readonly string[] | undefined;
  cursorCharacter: string;
  shouldRenderPromptDraftOnSingleLine?: boolean;
};

function splitPromptDraftDisplaySegmentsAtCursorOffset(
  promptDraftDisplaySegments: readonly PromptDraftDisplaySegment[],
  promptDraftCursorOffset: number,
): {
  promptDraftDisplaySegmentsBeforeCursor: PromptDraftDisplaySegment[];
  promptDraftDisplaySegmentsAfterCursor: PromptDraftDisplaySegment[];
} {
  const promptDraftDisplaySegmentsBeforeCursor: PromptDraftDisplaySegment[] = [];
  const promptDraftDisplaySegmentsAfterCursor: PromptDraftDisplaySegment[] = [];
  let remainingPromptDraftCursorOffset = promptDraftCursorOffset;

  for (const promptDraftDisplaySegment of promptDraftDisplaySegments) {
    if (remainingPromptDraftCursorOffset <= 0) {
      promptDraftDisplaySegmentsAfterCursor.push(promptDraftDisplaySegment);
      continue;
    }

    if (remainingPromptDraftCursorOffset >= promptDraftDisplaySegment.text.length) {
      promptDraftDisplaySegmentsBeforeCursor.push(promptDraftDisplaySegment);
      remainingPromptDraftCursorOffset -= promptDraftDisplaySegment.text.length;
      continue;
    }

    promptDraftDisplaySegmentsBeforeCursor.push({
      ...promptDraftDisplaySegment,
      text: promptDraftDisplaySegment.text.slice(0, remainingPromptDraftCursorOffset),
    });
    promptDraftDisplaySegmentsAfterCursor.push({
      ...promptDraftDisplaySegment,
      text: promptDraftDisplaySegment.text.slice(remainingPromptDraftCursorOffset),
    });
    remainingPromptDraftCursorOffset = 0;
  }

  return {
    promptDraftDisplaySegmentsBeforeCursor: promptDraftDisplaySegmentsBeforeCursor.filter(
      (promptDraftDisplaySegment) => promptDraftDisplaySegment.text.length > 0,
    ),
    promptDraftDisplaySegmentsAfterCursor: promptDraftDisplaySegmentsAfterCursor.filter(
      (promptDraftDisplaySegment) => promptDraftDisplaySegment.text.length > 0,
    ),
  };
}

function renderPromptDraftDisplaySegments(promptDraftDisplaySegments: readonly PromptDraftDisplaySegment[]): ReactNode {
  return promptDraftDisplaySegments.map((promptDraftDisplaySegment, index) => (
    <span
      key={`${promptDraftDisplaySegment.segmentKind}-${index}`}
      fg={
        promptDraftDisplaySegment.segmentKind === "selected_prompt_context_reference"
          ? chatScreenTheme.promptContextReferenceText
          : chatScreenTheme.textPrimary
      }
    >
      {promptDraftDisplaySegment.text}
    </span>
  ));
}

export function PromptDraftText(props: PromptDraftTextProps): ReactNode {
  const promptDraftDisplaySegments = buildPromptContextDisplaySegments({
    promptDraft: props.promptDraft,
    selectedPromptContextReferenceTexts: props.selectedPromptContextReferenceTexts ?? [],
  });
  const {
    promptDraftDisplaySegmentsBeforeCursor,
    promptDraftDisplaySegmentsAfterCursor,
  } = splitPromptDraftDisplaySegmentsAtCursorOffset(
    promptDraftDisplaySegments,
    Math.max(0, Math.min(props.promptDraftCursorOffset, props.promptDraft.length)),
  );

  return (
    <text
      {...(props.shouldRenderPromptDraftOnSingleLine
        ? {
            wrapMode: "none" as const,
            truncate: true,
          }
        : {})}
    >
      {renderPromptDraftDisplaySegments(promptDraftDisplaySegmentsBeforeCursor)}
      <span fg={chatScreenTheme.textPrimary}>{props.cursorCharacter}</span>
      {renderPromptDraftDisplaySegments(promptDraftDisplaySegmentsAfterCursor)}
    </text>
  );
}
