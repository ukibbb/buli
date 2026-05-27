import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { formatCompactTokenCount } from "./formatCompactTokenCount.ts";

// Used-token fill ratio thresholds: under 60% stays green, 60-85% warns amber,
// over 85% shifts to pink so the meter signals pressure against Buli's
// effective working budget before compaction or continuation guards fire.
const CONTEXT_METER_AMBER_RATIO_THRESHOLD = 0.6;
const CONTEXT_METER_PINK_RATIO_THRESHOLD = 0.85;

export type ContextWindowMeterProps = {
  totalTokensUsed: number | undefined;
  contextMeterTokenLimit: number | undefined;
};

export function resolveContextMeterUsedTokenColor(
  totalTokensUsed: number | undefined,
  contextMeterTokenLimit: number | undefined,
): string {
  if (totalTokensUsed === undefined || contextMeterTokenLimit === undefined || contextMeterTokenLimit <= 0) {
    return chatScreenTheme.textMuted;
  }
  const fillRatio = totalTokensUsed / contextMeterTokenLimit;
  if (fillRatio >= CONTEXT_METER_PINK_RATIO_THRESHOLD) {
    return chatScreenTheme.accentPink;
  }
  if (fillRatio >= CONTEXT_METER_AMBER_RATIO_THRESHOLD) {
    return chatScreenTheme.accentAmber;
  }
  return chatScreenTheme.accentGreen;
}

export function ContextWindowMeter(props: ContextWindowMeterProps): ReactNode {
  const displayedTokensUsed = resolveDisplayedContextTokensUsed(props);
  if (displayedTokensUsed === undefined) {
    return <text fg={chatScreenTheme.textMuted}>{"--"}</text>;
  }

  const usedTokenColor = resolveContextMeterUsedTokenColor(props.totalTokensUsed, props.contextMeterTokenLimit);
  if (props.contextMeterTokenLimit === undefined || props.contextMeterTokenLimit <= 0) {
    return <text fg={usedTokenColor}>{formatCompactTokenCount(displayedTokensUsed)}</text>;
  }

  return (
    <text>
      <span fg={usedTokenColor}>{formatCompactTokenCount(displayedTokensUsed)}</span>
      <span fg={chatScreenTheme.textMuted}>
        {` / ${formatCompactTokenCount(props.contextMeterTokenLimit)} (${formatContextWindowUsagePercent(displayedTokensUsed, props.contextMeterTokenLimit)})`}
      </span>
    </text>
  );
}

function resolveDisplayedContextTokensUsed(props: ContextWindowMeterProps): number | undefined {
  return props.totalTokensUsed;
}

function formatContextWindowUsagePercent(totalTokensUsed: number, contextMeterTokenLimit: number): string {
  return `${Math.round((totalTokensUsed / contextMeterTokenLimit) * 100)}%`;
}
