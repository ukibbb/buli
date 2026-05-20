import type { ReactNode } from "react";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

export type ThinkingStatusLineProps = {
  thinkingStartedAtMs: number;
  thinkingTopicText?: string | undefined;
};

export function ThinkingStatusLine(_props: ThinkingStatusLineProps): ReactNode {
  return <SnakeAnimationIndicator />;
}
