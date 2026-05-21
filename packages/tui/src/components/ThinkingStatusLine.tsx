import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

export type ThinkingStatusLineProps = {
  thinkingStartedAtMs: number;
  thinkingTopicText?: string | undefined;
};

export function ThinkingStatusLine(props: ThinkingStatusLineProps): ReactNode {
  const thinkingStatusText = props.thinkingTopicText ? `Thinking: ${props.thinkingTopicText}` : "Thinking";
  return (
    <box flexDirection="row" gap={1}>
      <SnakeAnimationIndicator variant="eatingApple" />
      <text fg={chatScreenTheme.textMuted}>{thinkingStatusText}</text>
    </box>
  );
}
