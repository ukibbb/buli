import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen frame LhCtn (HERO 1 component/ReasoningCollapsed). The chip is split
// into multi-color spans: the chevron + token-count tail use textDim; the
// Thinking label and the duration use textMuted; separators are textDim.
export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
  reasoningSummaryTitle?: string | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps): ReactNode {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  const thoughtLabel = props.reasoningSummaryTitle
    ? `Thought: ${props.reasoningSummaryTitle}`
    : `Thought for ${durationInSeconds}s`;
  return (
    <box>
      <text>
        <span fg={chatScreenTheme.textDim}>{`${glyphs.chevronRight} `}</span>
        <span fg={chatScreenTheme.textMuted}>{thoughtLabel}</span>
        {props.reasoningSummaryTitle ? (
          <>
            <span fg={chatScreenTheme.textDim}>{" · "}</span>
            <span fg={chatScreenTheme.textMuted}>{`${durationInSeconds}s`}</span>
          </>
        ) : null}
        <>
          <span fg={chatScreenTheme.textDim}>{" · "}</span>
          <span fg={chatScreenTheme.textDim}>
            {props.reasoningTokenCount === undefined ? "reasoning tokens pending" : `${props.reasoningTokenCount} reasoning tok`}
          </span>
        </>
      </text>
    </box>
  );
}
