import React from "react";
import { Text } from "ink";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { buildPromptContextDisplaySegments } from "@buli/engine";

export type PromptDraftTextProps = {
  promptDraft: string;
  selectedPromptContextReferenceTexts: readonly string[] | undefined;
  cursorCharacter: string;
};

export function PromptDraftText(props: PromptDraftTextProps) {
  const promptDraftDisplaySegments = buildPromptContextDisplaySegments({
    promptDraft: props.promptDraft,
    selectedPromptContextReferenceTexts: props.selectedPromptContextReferenceTexts ?? [],
  });

  return (
    <Text>
      {promptDraftDisplaySegments.map((promptDraftDisplaySegment, index) => (
        <Text
          key={`${promptDraftDisplaySegment.segmentKind}-${index}`}
          color={
            promptDraftDisplaySegment.segmentKind === "selected_prompt_context_reference"
              ? chatScreenTheme.promptContextReferenceText
              : chatScreenTheme.textPrimary
          }
        >
          {promptDraftDisplaySegment.text}
        </Text>
      ))}
      <Text color={chatScreenTheme.textPrimary}>{props.cursorCharacter}</Text>
    </Text>
  );
}
