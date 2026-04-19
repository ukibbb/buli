import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders one streaming assistant reasoning part. Pre-completion lifecycle
// stage: the model is still producing reasoning summary text. The
// header shows an amber dot plus how long reasoning has been running; the
// body renders the partial summary behind a 2-cell-wide textDim stripe to match
// the pen frame EwHmY and the Blockquote pattern from the Phase 2 spec.
//
// useAnimation is replaced with a 250 ms setInterval that increments a tick
// counter, forcing a re-render so the elapsed timer updates live.
export type ReasoningStreamBlockProps = {
  reasoningSummaryText: string;
  reasoningStartedAtMs: number;
};

export function ReasoningStreamBlock(props: ReasoningStreamBlockProps): ReactNode {
  // Tick every 250 ms so the elapsed timer increments live.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = ((Date.now() - props.reasoningStartedAtMs) / 1000).toFixed(1);

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={chatScreenTheme.accentAmber}>{glyphs.statusDot}</text>
        <text fg={chatScreenTheme.textMuted}>// reasoning</text>
        <text fg={chatScreenTheme.textDim}>{`${elapsedSeconds}s`}</text>
      </box>
      <box flexDirection="row" gap={1}>
        <box backgroundColor={chatScreenTheme.textDim} width={2} flexShrink={0} />
        <box flexShrink={1}>
          <text fg={chatScreenTheme.textDim}>
            <i>{props.reasoningSummaryText}</i>
          </text>
        </box>
      </box>
    </box>
  );
}
