import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

export type AutoCompactingStatusLineProps = {
  queuedPromptCount: number;
  totalContextTokensUsed: number | undefined;
  contextMeterTokenLimit: number | undefined;
};

export function AutoCompactingStatusLine(props: AutoCompactingStatusLineProps): ReactNode {
  return (
    <box flexDirection="row" gap={1} justifyContent="space-between" width="100%">
      <box flexDirection="row" gap={1} minWidth={0} overflow="hidden">
        <SnakeAnimationIndicator variant="sixCell" />
        <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
          Auto-compacting history...
        </text>
        {props.queuedPromptCount > 0 ? (
          <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
            {`Queued: ${props.queuedPromptCount}`}
          </text>
        ) : null}
      </box>
      <box flexShrink={0}>
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextMeterTokenLimit={props.contextMeterTokenLimit}
        />
      </box>
    </box>
  );
}
