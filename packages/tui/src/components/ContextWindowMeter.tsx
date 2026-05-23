import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { formatCompactTokenCount } from "./formatCompactTokenCount.ts";

// Used-token fill ratio thresholds: under 60 % stays green, 60–85 % warns amber,
// over 85 % shifts to pink so the meter signals limit pressure before the user
// hits a context-window error.
const CONTEXT_METER_AMBER_RATIO_THRESHOLD = 0.6;
const CONTEXT_METER_PINK_RATIO_THRESHOLD = 0.85;

export type ContextWindowMeterProps = {
  totalTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function resolveContextMeterUsedTokenColor(
  totalTokensUsed: number | undefined,
  contextWindowTokenCapacity: number | undefined,
): string {
  if (totalTokensUsed === undefined || contextWindowTokenCapacity === undefined || contextWindowTokenCapacity <= 0) {
    return chatScreenTheme.textMuted;
  }
  const fillRatio = totalTokensUsed / contextWindowTokenCapacity;
  if (fillRatio >= CONTEXT_METER_PINK_RATIO_THRESHOLD) {
    return chatScreenTheme.accentPink;
  }
  if (fillRatio >= CONTEXT_METER_AMBER_RATIO_THRESHOLD) {
    return chatScreenTheme.accentAmber;
  }
  return chatScreenTheme.accentGreen;
}

export function ContextWindowMeter(props: ContextWindowMeterProps): ReactNode {
  if (props.totalTokensUsed === undefined) {
    return <text fg={chatScreenTheme.textMuted}>{"--"}</text>;
  }
  const usedTokenColor = resolveContextMeterUsedTokenColor(props.totalTokensUsed, props.contextWindowTokenCapacity);
  if (props.contextWindowTokenCapacity === undefined || props.contextWindowTokenCapacity <= 0) {
    return <text fg={usedTokenColor}>{formatCompactTokenCount(props.totalTokensUsed)}</text>;
  }
  return (
    <text>
      <span fg={usedTokenColor}>{formatCompactTokenCount(props.totalTokensUsed)}</span>
      <span fg={chatScreenTheme.textMuted}>{` / ${formatCompactTokenCount(props.contextWindowTokenCapacity)}`}</span>
    </text>
  );
}
