import { Box, Text } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders one completed_reasoning_summary transcript entry. Post-reasoning
// lifecycle stage: the chevron-prefixed chip signals that the thinking phase
// is finished and collapsed. The token-count clause only appears after
// assistant_response_completed back-fills the entry.
export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps) {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  const tokenCountClause =
    props.reasoningTokenCount === undefined ? "" : ` · ${props.reasoningTokenCount} tokens`;

  return (
    <Box>
      <Text color={chatScreenTheme.textDim}>
        {`${glyphs.chevronRight} // thinking · ${durationInSeconds}s${tokenCountClause}`}
      </Text>
    </Box>
  );
}
