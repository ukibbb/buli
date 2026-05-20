import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
  reasoningSummaryTitle?: string | undefined;
  isReasoningExpanded?: boolean | undefined;
  onReasoningExpansionToggle?: (() => void) | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps): ReactNode {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  const thoughtLabel = props.reasoningSummaryTitle ? `Thought: ${props.reasoningSummaryTitle}` : "Thought";
  const disclosureText = props.isReasoningExpanded ? "[-]" : "[+]";
  return (
    <box onMouseDown={() => props.onReasoningExpansionToggle?.()}>
      <text wrapMode="none">
        <span fg={chatScreenTheme.accentCyan}>{disclosureText}</span>
        <span fg={chatScreenTheme.textDim}>{" "}</span>
        <span fg={chatScreenTheme.textMuted}>{thoughtLabel}</span>
        <span fg={chatScreenTheme.textDim}>{" · "}</span>
        <span fg={chatScreenTheme.textMuted}>{`${durationInSeconds}s`}</span>
        <span fg={chatScreenTheme.textDim}>{" · "}</span>
        <span fg={chatScreenTheme.textDim}>
          {props.reasoningTokenCount === undefined ? "reasoning tokens unavailable" : `${props.reasoningTokenCount} reasoning tok`}
        </span>
      </text>
    </box>
  );
}
