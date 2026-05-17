import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { formatCompactTokenCount } from "./formatCompactTokenCount.ts";

// ContextWindowMeter keeps the footer compact: used tokens, optionally followed
// by the known model limit. It intentionally avoids a bar because the available
// terminal width is too small for the bar to communicate useful precision.

export type ContextWindowMeterProps = {
  totalTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function ContextWindowMeter(props: ContextWindowMeterProps): ReactNode {
  if (props.totalTokensUsed === undefined) {
    return <text fg={chatScreenTheme.textMuted}>{"--"}</text>;
  }
  if (props.contextWindowTokenCapacity === undefined || props.contextWindowTokenCapacity <= 0) {
    return <text fg={chatScreenTheme.textMuted}>{formatCompactTokenCount(props.totalTokensUsed)}</text>;
  }

  return (
    <text fg={chatScreenTheme.textMuted}>
      {`${formatCompactTokenCount(props.totalTokensUsed)} / ${formatCompactTokenCount(props.contextWindowTokenCapacity)}`}
    </text>
  );
}
