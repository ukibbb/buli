import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { PromptContextCandidate } from "@buli/engine";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

export type PromptContextSelectionPaneProps = {
  promptContextCandidates: readonly PromptContextCandidate[];
  highlightedPromptContextCandidateIndex: number;
};

const MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT = 6;

export function PromptContextSelectionPane(props: PromptContextSelectionPaneProps): ReactNode {
  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.border}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      marginBottom={1}
      paddingX={1}
    >
      <text fg={chatScreenTheme.textMuted}>Context</text>
      {props.promptContextCandidates.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching files or folders.</text>
      ) : (
        <SelectionPaneSelect
          optionNames={props.promptContextCandidates.map((promptContextCandidate) => promptContextCandidate.displayPath)}
          highlightedOptionIndex={props.highlightedPromptContextCandidateIndex}
          maxVisibleOptionCount={MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT}
        />
      )}
    </box>
  );
}
