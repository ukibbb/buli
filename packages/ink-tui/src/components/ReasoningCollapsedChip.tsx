import { Box, Text } from "ink";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen frame LhCtn (HERO 1 component/ReasoningCollapsed). The chip is split
// into multi-color spans: the chevron + token-count tail use textDim; the
// `// thinking` label and the duration use textMuted; separators are textDim.
export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps) {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  return (
    <Box>
      <Text color={chatScreenTheme.textDim}>{`${glyphs.chevronRight} `}</Text>
      <Text color={chatScreenTheme.textMuted}>{`// thinking`}</Text>
      <Text color={chatScreenTheme.textDim}>{` · `}</Text>
      <Text color={chatScreenTheme.textMuted}>{`${durationInSeconds}s`}</Text>
      {props.reasoningTokenCount === undefined ? null : (
        <>
          <Text color={chatScreenTheme.textDim}>{` · `}</Text>
          <Text color={chatScreenTheme.textDim}>{`${props.reasoningTokenCount} tokens`}</Text>
        </>
      )}
    </Box>
  );
}
