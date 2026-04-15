import { Text, useAnimation } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../../chatScreenTheme.ts";

// Mirrors the pen-file StreamingCursor variants (amber / green / cyan / dim).
// Implemented as a single-cell blinking block so it reads as "still
// generating" when appended to the end of a streaming line.
export type StreamingCursorVariant = "amber" | "green" | "cyan" | "dim";

export type StreamingCursorProps = {
  variant: StreamingCursorVariant;
};

const streamingCursorColors: Record<StreamingCursorVariant, string> = {
  amber: chatScreenTheme.accentAmber,
  green: chatScreenTheme.accentGreen,
  cyan: chatScreenTheme.accentCyan,
  dim: chatScreenTheme.textDim,
};

const blinkingFrames = ["█", " "] as const;

export function StreamingCursor(props: StreamingCursorProps): ReactNode {
  const { frame: animationFrame } = useAnimation({ interval: 500 });
  const currentFrameGlyph = blinkingFrames[animationFrame % blinkingFrames.length] ?? "█";
  return <Text color={streamingCursorColors[props.variant]}>{currentFrameGlyph}</Text>;
}
