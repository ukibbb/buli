import React from "react";
import { Box, Text } from "ink";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { PromptContextCandidate } from "@buli/engine";

export type PromptContextSelectionPaneProps = {
  promptContextCandidates: readonly PromptContextCandidate[];
  highlightedPromptContextCandidateIndex: number;
};

export function PromptContextSelectionPane(props: PromptContextSelectionPaneProps) {
  const visiblePromptContextCandidates = props.promptContextCandidates.slice(0, 6);

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
      <Text color={chatScreenTheme.textMuted}>Desktop context</Text>
      {visiblePromptContextCandidates.length === 0 ? (
        <Text color={chatScreenTheme.textSecondary}>No matching files or folders.</Text>
      ) : (
        visiblePromptContextCandidates.map((promptContextCandidate, index) => {
          const isHighlightedPromptContextCandidate = index === props.highlightedPromptContextCandidateIndex;
          return (
            <Box key={`${promptContextCandidate.kind}:${promptContextCandidate.displayPath}`} gap={1}>
              <Text color={isHighlightedPromptContextCandidate ? chatScreenTheme.accentGreen : chatScreenTheme.textDim}>
                {isHighlightedPromptContextCandidate ? ">" : " "}
              </Text>
              <Text color={isHighlightedPromptContextCandidate ? chatScreenTheme.textPrimary : chatScreenTheme.textSecondary}>
                {promptContextCandidate.displayPath}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
