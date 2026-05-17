import type { ReactNode } from "react";
import type { TokenUsage } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { formatCompactTokenCount } from "./formatCompactTokenCount.ts";
import { glyphs } from "./glyphs.ts";
import { shortenTerminalTextWithMiddleEllipsis } from "./shortenTerminalTextWithMiddleEllipsis.ts";

// Mirrors pen component/TurnFooter (qfHh3): a state indicator on the left
// ("✓ done · {duration}") and turn metadata on the right ("tokens
// [· reasoning] · model [· cached]"), separated across a space-between flex row so
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
  const turnMetadataText = buildTurnMetadataText(props, totalTokenCount);
  const displayedTurnMetadataText = shortenTerminalTextWithMiddleEllipsis(turnMetadataText, 64);

  return (
    <box flexDirection="row" justifyContent="space-between" minWidth={0} overflow="hidden" width="100%">
      <box flexShrink={0}>
        <text wrapMode="none">
          <span fg={chatScreenTheme.accentGreen}>{glyphs.checkMark}</span>
          <span fg={chatScreenTheme.textMuted}>{" done"}</span>
          <span fg={chatScreenTheme.textDim}>{" · "}</span>
          <span fg={chatScreenTheme.accentPrimaryMuted}>{durationLabel}</span>
        </text>
      </box>
      <box flexShrink={1} marginLeft={1} minWidth={0} overflow="hidden">
        <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none" width="100%">
          {displayedTurnMetadataText}
        </text>
      </box>
    </box>
  );
}

function buildTurnMetadataText(props: TurnFooterProps, totalTokenCount: number | undefined): string {
  const metadataLabels: string[] = [];

  if (totalTokenCount !== undefined) {
    metadataLabels.push(`${formatCompactTokenCount(totalTokenCount)} tok`);
  }

  if (props.usage && props.usage.reasoning > 0) {
    metadataLabels.push(`${formatCompactTokenCount(props.usage.reasoning)} reasoning tok`);
  }

  metadataLabels.push(props.modelDisplayName);

  if (props.usage && props.usage.cache.read > 0) {
    metadataLabels.push(`${formatCompactTokenCount(props.usage.cache.read)} cached`);
  }

  return metadataLabels.join(" · ");
}

function formatTurnDurationMs(turnDurationMs: number): string {
  if (turnDurationMs < 1000) {
    return `${turnDurationMs}ms`;
  }
  return `${(turnDurationMs / 1000).toFixed(1)}s`;
}
