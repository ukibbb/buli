import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { PromptContextCandidate } from "@buli/engine";

export type PromptContextSelectionPaneProps = {
  promptContextCandidates: readonly PromptContextCandidate[];
  highlightedPromptContextCandidateIndex: number;
};

export function PromptContextSelectionPane(props: PromptContextSelectionPaneProps): ReactNode {
  const visiblePromptContextCandidates = props.promptContextCandidates.slice(0, 6);

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
      <text fg={chatScreenTheme.textMuted}>Desktop context</text>
      {visiblePromptContextCandidates.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching files or folders.</text>
      ) : (
        visiblePromptContextCandidates.map((promptContextCandidate, index) => {
          const isHighlightedPromptContextCandidate = index === props.highlightedPromptContextCandidateIndex;
          return (
            <box key={`${promptContextCandidate.kind}:${promptContextCandidate.displayPath}`} flexDirection="row" gap={1}>
              <text fg={isHighlightedPromptContextCandidate ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
                {isHighlightedPromptContextCandidate ? ">" : " "}
              </text>
              <text fg={isHighlightedPromptContextCandidate ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}>
                {promptContextCandidate.displayPath}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}
