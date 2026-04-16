import { Box, Text, useAnimation } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders one streaming_reasoning_summary transcript entry. Pre-completion
// lifecycle stage: the model is still producing reasoning summary text. The
// header shows an amber dot plus how long reasoning has been running; the
// body renders the partial summary behind a left accent stroke to mirror
// the pen component WU3cj.
export type ReasoningStreamBlockProps = {
  reasoningSummaryText: string;
  reasoningStartedAtMs: number;
};

export function ReasoningStreamBlock(props: ReasoningStreamBlockProps) {
  // Force a re-render every 250 ms so the elapsed timer increments live.
  // 250 ms gives the user one update per quarter-second — visually smooth
  // without driving four full repaint passes per second through the
  // backgroundColor stripes inside the surrounding cards.
  useAnimation({ interval: 250 });
  const elapsedSeconds = ((Date.now() - props.reasoningStartedAtMs) / 1000).toFixed(1);

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={chatScreenTheme.accentAmber}>{glyphs.statusDot}</Text>
        <Text color={chatScreenTheme.textMuted}>// reasoning</Text>
        <Text color={chatScreenTheme.textDim}>{`${elapsedSeconds}s`}</Text>
      </Box>
      <Box
        borderStyle="single"
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderLeftColor={chatScreenTheme.textDim}
        paddingLeft={1}
      >
        <Text color={chatScreenTheme.textDim} italic>
          {props.reasoningSummaryText}
        </Text>
      </Box>
    </Box>
  );
}
