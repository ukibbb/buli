import type { ReactNode } from "react";
import type { TokenUsage } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// TurnFooter renders a one-row chip beneath an assistant turn so the user
// sees the model and timing immediately, then token usage once the terminal
// response event arrives. Mirrors the pen-file component/TurnFooter: muted
// divider glyphs with accent numbers.
//
// All items are inline spans inside a single <text> parent so they render
// on one row. In OpenTUI, adjacent <box> elements stack vertically (Yoga
// default column direction) while <span> elements inside <text> are truly
// inline.
export type TurnFooterProps = {
  modelDisplayName: string;
  turnDurationMs: number;
  usage: TokenUsage | undefined;
};

export function TurnFooter(props: TurnFooterProps): ReactNode {
  const totalTokenCount = props.usage
    ? props.usage.total ?? props.usage.input + props.usage.output + props.usage.reasoning
    : undefined;

  return (
    <text>
      <span fg={chatScreenTheme.textDim}>{glyphs.chevronRight}</span>
      <span fg={chatScreenTheme.textMuted}>{` ${props.modelDisplayName}`}</span>
      <span fg={chatScreenTheme.textDim}>{" ·"}</span>
      <span fg={chatScreenTheme.accentPrimaryMuted}>{` ${formatTurnDurationMs(props.turnDurationMs)}`}</span>
      {totalTokenCount !== undefined ? (
        <>
          <span fg={chatScreenTheme.textDim}>{" ·"}</span>
          <span fg={chatScreenTheme.accentPrimaryMuted}>{` ${totalTokenCount} tok`}</span>
        </>
      ) : null}
      {props.usage && props.usage.reasoning > 0 ? (
        <>
          <span fg={chatScreenTheme.textDim}>{" ·"}</span>
          <span fg={chatScreenTheme.textMuted}>{` ${props.usage.reasoning} reasoning`}</span>
        </>
      ) : null}
      {props.usage && props.usage.cache.read > 0 ? (
        <>
          <span fg={chatScreenTheme.textDim}>{" ·"}</span>
          <span fg={chatScreenTheme.textMuted}>{` ${props.usage.cache.read} cached`}</span>
        </>
      ) : null}
    </text>
  );
}

function formatTurnDurationMs(turnDurationMs: number): string {
  if (turnDurationMs < 1000) {
    return `${turnDurationMs}ms`;
  }
  return `${(turnDurationMs / 1000).toFixed(1)}s`;
}
