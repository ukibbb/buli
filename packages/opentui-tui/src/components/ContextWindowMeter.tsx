import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
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
    return <text fg={chatScreenTheme.textMuted}>{"ctx --"}</text>;
  }
  if (props.contextWindowTokenCapacity === undefined || props.contextWindowTokenCapacity <= 0) {
    return (
      <text fg={chatScreenTheme.textMuted}>{`ctx ${formatTokenCount(props.totalTokensUsed)} tok`}</text>
    );
  }
  const rawPercentage = (props.totalTokensUsed / props.contextWindowTokenCapacity) * 100;
  const clampedPercentage = Math.min(100, Math.max(0, Math.round(rawPercentage)));
  const filledCellCount = Math.round((clampedPercentage / 100) * CONTEXT_WINDOW_BAR_CELL_WIDTH);
  const barColor = deriveMeterBarColor(clampedPercentage);
  return (
    <text>
      <span fg={chatScreenTheme.textMuted}>{"ctx "}</span>
      <span fg={barColor}>
        {glyphs.progressFill.repeat(filledCellCount)}
      </span>
      <span fg={chatScreenTheme.textDim}>
        {glyphs.progressEmpty.repeat(CONTEXT_WINDOW_BAR_CELL_WIDTH - filledCellCount)}
      </span>
      <span fg={chatScreenTheme.textMuted}>{" "}</span>
      <b fg={chatScreenTheme.accentCyan}>{`${clampedPercentage}%`}</b>
    </text>
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
