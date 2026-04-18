import React from "react";
import { Box, Text } from "ink";
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

export function PromptContextSelectionPane(props: PromptContextSelectionPaneProps) {
  const { firstVisiblePromptContextCandidateIndex, visiblePromptContextCandidates } = selectVisiblePromptContextCandidateWindow({
    promptContextCandidates: props.promptContextCandidates,
    highlightedPromptContextCandidateIndex: props.highlightedPromptContextCandidateIndex,
  });

  return (
    <Box
      borderStyle="round"
      borderColor={chatScreenTheme.border}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      marginBottom={1}
      paddingX={1}
    >
      <Text color={chatScreenTheme.textMuted}>Context</Text>
      {visiblePromptContextCandidates.length === 0 ? (
        <Text color={chatScreenTheme.textSecondary}>No matching files or folders.</Text>
      ) : (
        visiblePromptContextCandidates.map((promptContextCandidate, index) => {
          const isHighlightedPromptContextCandidate =
            firstVisiblePromptContextCandidateIndex + index === props.highlightedPromptContextCandidateIndex;
          return (
            <Box key={`${promptContextCandidate.kind}:${promptContextCandidate.displayPath}`} gap={1} width="100%">
              <Text color={isHighlightedPromptContextCandidate ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
                {isHighlightedPromptContextCandidate ? ">" : " "}
              </Text>
              <Box flexGrow={1}>
                <Text
                  color={isHighlightedPromptContextCandidate ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}
                  wrap="truncate-end"
                >
                  {promptContextCandidate.displayPath}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
