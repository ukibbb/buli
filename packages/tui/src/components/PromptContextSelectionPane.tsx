import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { PromptContextCandidate } from "@buli/engine";
import { SelectionPaneFrame } from "./SelectionPaneFrame.tsx";
import { SelectionPaneSelect } from "./SelectionPaneSelect.tsx";

export type PromptContextSelectionPaneProps = {
  promptContextCandidates: readonly PromptContextCandidate[];
  highlightedPromptContextCandidateIndex: number;
  accentColor: string;
};

const MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT = 6;

export function PromptContextSelectionPane(props: PromptContextSelectionPaneProps): ReactNode {
  return (
    <SelectionPaneFrame headingText="Context" accentColor={props.accentColor}>
      {props.promptContextCandidates.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching files or folders.</text>
      ) : (
        <SelectionPaneSelect
          optionNames={props.promptContextCandidates.map((promptContextCandidate) => promptContextCandidate.displayPath)}
          highlightedOptionIndex={props.highlightedPromptContextCandidateIndex}
          maxVisibleOptionCount={MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT}
        />
      )}
    </SelectionPaneFrame>
  );
}
