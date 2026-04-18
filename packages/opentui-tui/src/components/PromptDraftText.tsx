import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { buildPromptContextDisplaySegments } from "@buli/engine";

export type PromptDraftTextProps = {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[] | undefined;
  cursorCharacter: string;
};

export function PromptDraftText(props: PromptDraftTextProps): ReactNode {
  const promptDraftDisplaySegments = buildPromptContextDisplaySegments({
    promptDraft: props.promptDraft,
    selectedPromptContextReferenceTexts: props.selectedPromptContextReferenceTexts ?? [],
  });

  return (
    <text>
      {promptDraftDisplaySegments.map((promptDraftDisplaySegment, index) => (
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
      ))}
      <span fg={chatScreenTheme.textPrimary}>{props.cursorCharacter}</span>
    </text>
  );
}
