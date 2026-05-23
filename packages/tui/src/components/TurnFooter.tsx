import type { ReactNode } from "react";
import type { TokenUsage } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { formatCompactTokenCount } from "./formatCompactTokenCount.ts";
import { glyphs } from "./glyphs.ts";

// Right half is rendered only when usage is known. Colors carry meaning:
// purple = volume, pink = cost driver (shares the xhigh effort hue so the
// intensity scale is consistent), green = savings.
export type TurnFooterProps = {
  modelDisplayName: string;
  turnDurationMs: number;
  usage: TokenUsage | undefined;
};

export function TurnFooter(props: TurnFooterProps): ReactNode {
  const durationLabel = formatTurnDurationMs(props.turnDurationMs);
  const totalTokenCount = props.usage
    ? props.usage.total ?? props.usage.input + props.usage.output + props.usage.reasoning
    : undefined;

  return (
    <box flexDirection="row" justifyContent="space-between" minWidth={0} overflow="hidden" width="100%">
      <box flexShrink={0}>
        <text wrapMode="none">
          <span fg={chatScreenTheme.accentGreen}>{glyphs.checkMark}</span>
          <span fg={chatScreenTheme.textMuted}>{" done "}</span>
          <span fg={chatScreenTheme.accentCyan}>{durationLabel}</span>
        </text>
      </box>
      {props.usage ? (
        <box flexShrink={1} marginLeft={1} minWidth={0} overflow="hidden">
          <text wrapMode="none" truncate={true}>
            <span fg={chatScreenTheme.textDim}>{"│  "}</span>
            <span fg={chatScreenTheme.accentPurple}>{formatCompactTokenCount(totalTokenCount ?? 0)}</span>
            <span fg={chatScreenTheme.textMuted}>{" tokens  "}</span>
            <span fg={chatScreenTheme.textDim}>{"·  "}</span>
            <span fg={chatScreenTheme.accentPink}>{formatCompactTokenCount(props.usage.reasoning)}</span>
            <span fg={chatScreenTheme.textMuted}>{" reasoning  "}</span>
            <span fg={chatScreenTheme.textDim}>{"·  "}</span>
            <span fg={chatScreenTheme.accentGreen}>{formatCompactTokenCount(props.usage.cache.read)}</span>
            <span fg={chatScreenTheme.textMuted}>{" cached"}</span>
          </text>
        </box>
      ) : null}
    </box>
  );
}

function formatTurnDurationMs(turnDurationMs: number): string {
  if (turnDurationMs < 1000) {
    return `${turnDurationMs}ms`;
  }
  return `${(turnDurationMs / 1000).toFixed(1)}s`;
}
