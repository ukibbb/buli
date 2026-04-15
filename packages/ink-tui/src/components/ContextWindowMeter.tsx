import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import { glyphs } from "./glyphs.ts";

// ContextWindowMeter replaces the "ctx --" placeholder in the input panel
// footer. Renders as a fixed-width bar + percentage when capacity is known,
// and falls back to a raw "ctx {tokens} tok" label when it isn't.
const CONTEXT_WINDOW_BAR_CELL_WIDTH = 12;

export type ContextWindowMeterProps = {
  totalTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function ContextWindowMeter(props: ContextWindowMeterProps): ReactNode {
  if (props.totalTokensUsed === undefined) {
    return <Text color={chatScreenTheme.textMuted}>ctx --</Text>;
  }
  if (props.contextWindowTokenCapacity === undefined || props.contextWindowTokenCapacity <= 0) {
    return <Text color={chatScreenTheme.textMuted}>{`ctx ${formatTokenCount(props.totalTokensUsed)} tok`}</Text>;
  }
  const rawPercentage = (props.totalTokensUsed / props.contextWindowTokenCapacity) * 100;
  const clampedPercentage = Math.min(100, Math.max(0, Math.round(rawPercentage)));
  const filledCellCount = Math.round((clampedPercentage / 100) * CONTEXT_WINDOW_BAR_CELL_WIDTH);
  const barColor = deriveMeterBarColor(clampedPercentage);
  return (
    <Box>
      <Text color={chatScreenTheme.textMuted}>ctx </Text>
      <Text color={barColor}>
        {glyphs.progressFill.repeat(filledCellCount)}
      </Text>
      <Text color={chatScreenTheme.textDim}>
        {glyphs.progressEmpty.repeat(CONTEXT_WINDOW_BAR_CELL_WIDTH - filledCellCount)}
      </Text>
      <Text color={chatScreenTheme.textMuted}>{` ${clampedPercentage}%`}</Text>
    </Box>
  );
}

function deriveMeterBarColor(clampedPercentage: number): string {
  if (clampedPercentage >= 85) {
    return chatScreenTheme.accentRed;
  }
  if (clampedPercentage >= 60) {
    return chatScreenTheme.accentAmber;
  }
  return chatScreenTheme.accentGreen;
}

function formatTokenCount(tokenCount: number): string {
  if (tokenCount < 1000) {
    return String(tokenCount);
  }
  return `${(tokenCount / 1000).toFixed(1)}k`;
}
