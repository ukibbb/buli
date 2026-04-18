import type { ReactNode } from "react";
import type { TokenUsage } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Mirrors pen component/TurnFooter (qfHh3): a state indicator on the left
// ("✓ done · {duration}") and turn metadata on the right ("tokens · model
// [· reasoning][· cached]"), separated across a space-between flex row so
// the two sides read as distinct regions rather than a run-on line.
export type TurnFooterProps = {
  modelDisplayName: string;
  turnDurationMs: number;
  usage: TokenUsage | undefined;
};

export function TurnFooter(props: TurnFooterProps): ReactNode {
  const totalTokenCount = props.usage
    ? props.usage.total ?? props.usage.input + props.usage.output + props.usage.reasoning
    : undefined;
  const durationLabel = formatTurnDurationMs(props.turnDurationMs);

  return (
    <box flexDirection="row" justifyContent="space-between" width="100%">
      <text>
        <span fg={chatScreenTheme.accentGreen}>{glyphs.checkMark}</span>
        <span fg={chatScreenTheme.textMuted}>{" done"}</span>
        <span fg={chatScreenTheme.textDim}>{" · "}</span>
        <span fg={chatScreenTheme.accentPrimaryMuted}>{durationLabel}</span>
      </text>
      <text>
        {totalTokenCount !== undefined ? (
          <>
            <span fg={chatScreenTheme.accentPrimaryMuted}>{`${totalTokenCount} tok`}</span>
            <span fg={chatScreenTheme.textDim}>{" · "}</span>
          </>
        ) : null}
        <span fg={chatScreenTheme.textMuted}>{props.modelDisplayName}</span>
        {props.usage && props.usage.reasoning > 0 ? (
          <>
            <span fg={chatScreenTheme.textDim}>{" · "}</span>
            <span fg={chatScreenTheme.textMuted}>{`${props.usage.reasoning} reasoning`}</span>
          </>
        ) : null}
        {props.usage && props.usage.cache.read > 0 ? (
          <>
            <span fg={chatScreenTheme.textDim}>{" · "}</span>
            <span fg={chatScreenTheme.textMuted}>{`${props.usage.cache.read} cached`}</span>
          </>
        ) : null}
      </text>
    </box>
  );
}

function formatTurnDurationMs(turnDurationMs: number): string {
  if (turnDurationMs < 1000) {
    return `${turnDurationMs}ms`;
  }
  return `${(turnDurationMs / 1000).toFixed(1)}s`;
}
