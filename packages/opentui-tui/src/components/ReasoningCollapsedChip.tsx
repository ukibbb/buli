import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen frame LhCtn (HERO 1 component/ReasoningCollapsed). The chip is split
// into multi-color spans: the chevron + token-count tail use textDim; the
// `// thinking` label and the duration use textMuted; separators are textDim.
export type ReasoningCollapsedChipProps = {
  reasoningDurationMs: number;
  reasoningTokenCount: number | undefined;
};

export function ReasoningCollapsedChip(props: ReasoningCollapsedChipProps): ReactNode {
  const durationInSeconds = (props.reasoningDurationMs / 1000).toFixed(1);
  return (
    <box>
      <text>
        <span fg={chatScreenTheme.textDim}>{`${glyphs.chevronRight} `}</span>
        <span fg={chatScreenTheme.textMuted}>{"// thinking"}</span>
        <span fg={chatScreenTheme.textDim}>{" · "}</span>
        <span fg={chatScreenTheme.textMuted}>{`${durationInSeconds}s`}</span>
        {props.reasoningTokenCount === undefined ? null : (
          <>
            <span fg={chatScreenTheme.textDim}>{" · "}</span>
            <span fg={chatScreenTheme.textDim}>{`${props.reasoningTokenCount} tokens`}</span>
          </>
        )}
      </text>
    </box>
  );
}
