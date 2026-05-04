import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

export type ThinkingStatusLineProps = {
  thinkingStartedAtMs: number;
};

export function ThinkingStatusLine(props: ThinkingStatusLineProps): ReactNode {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = ((Date.now() - props.thinkingStartedAtMs) / 1000).toFixed(1);

  return (
    <box flexDirection="row" gap={1}>
      <text fg={chatScreenTheme.accentAmber}>{glyphs.statusDot}</text>
      <text fg={chatScreenTheme.textMuted}>Thinking</text>
      <text fg={chatScreenTheme.textDim}>{`${elapsedSeconds}s`}</text>
    </box>
  );
}
