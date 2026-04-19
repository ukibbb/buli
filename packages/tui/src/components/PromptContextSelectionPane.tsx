import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { PromptContextCandidate } from "@buli/engine";

export type PromptContextSelectionPaneProps = {
  promptContextCandidates: readonly PromptContextCandidate[];
  highlightedPromptContextCandidateIndex: number;
};

const MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT = 6;

function selectVisiblePromptContextCandidateWindow(input: {
  promptContextCandidates: readonly PromptContextCandidate[];
  highlightedPromptContextCandidateIndex: number;
}): {
  firstVisiblePromptContextCandidateIndex: number;
  visiblePromptContextCandidates: readonly PromptContextCandidate[];
} {
  const latestFirstVisiblePromptContextCandidateIndex = Math.max(
    0,
    input.promptContextCandidates.length - MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT,
  );
  const firstVisiblePromptContextCandidateIndex = Math.min(
    Math.max(0, input.highlightedPromptContextCandidateIndex - (MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT - 1)),
    latestFirstVisiblePromptContextCandidateIndex,
  );

  return {
    firstVisiblePromptContextCandidateIndex,
    visiblePromptContextCandidates: input.promptContextCandidates.slice(
      firstVisiblePromptContextCandidateIndex,
      firstVisiblePromptContextCandidateIndex + MAX_VISIBLE_PROMPT_CONTEXT_CANDIDATE_COUNT,
    ),
  };
}

export function PromptContextSelectionPane(props: PromptContextSelectionPaneProps): ReactNode {
  const { firstVisiblePromptContextCandidateIndex, visiblePromptContextCandidates } = selectVisiblePromptContextCandidateWindow({
    promptContextCandidates: props.promptContextCandidates,
    highlightedPromptContextCandidateIndex: props.highlightedPromptContextCandidateIndex,
  });

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
      {visiblePromptContextCandidates.length === 0 ? (
        <text fg={chatScreenTheme.textSecondary}>No matching files or folders.</text>
      ) : (
        visiblePromptContextCandidates.map((promptContextCandidate, index) => {
          const isHighlightedPromptContextCandidate =
            firstVisiblePromptContextCandidateIndex + index === props.highlightedPromptContextCandidateIndex;
          return (
            <box key={`${promptContextCandidate.kind}:${promptContextCandidate.displayPath}`} flexDirection="row" gap={1} width="100%">
              <text fg={isHighlightedPromptContextCandidate ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
                {isHighlightedPromptContextCandidate ? ">" : " "}
              </text>
              <box flexGrow={1}>
                <text
                  fg={isHighlightedPromptContextCandidate ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
                  wrapMode="none"
                  truncate={true}
                >
                  {promptContextCandidate.displayPath}
                </text>
              </box>
            </box>
          );
        })
      )}
    </box>
  );
}
