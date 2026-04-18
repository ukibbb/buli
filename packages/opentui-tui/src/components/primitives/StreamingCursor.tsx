import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Mirrors the pen-file StreamingCursor variants (amber / green / cyan / dim).
// Implemented as a single-cell blinking block so it reads as "still
// generating" when appended to the end of a streaming line.
//
// useAnimation from Ink has no direct equivalent in OpenTUI. The blink
// interval is driven by a plain useState + setInterval so the cursor toggles
// independently of the renderer's frame cadence, which is all useAnimation
// provided in the Ink version.
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
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % blinkingFrames.length);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const glyph = blinkingFrames[frameIndex] ?? "█";
  return <text fg={streamingCursorColors[props.variant]}>{glyph}</text>;
}
