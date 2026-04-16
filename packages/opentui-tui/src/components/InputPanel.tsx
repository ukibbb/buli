import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { AssistantResponseStatus } from "../chatScreenState.ts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { glyphs } from "./glyphs.ts";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Renders the HERO 1 input panel (pen frame HOeet). Owns three stacked rows:
// a header strip with mode + model chips, a body with the prompt draft and
// a caret, and a footer that shows either the scroll/help hint or the
// working indicator plus the context-window meter.
//
// useAnimation from Ink has no direct equivalent in OpenTUI. The cursor blink
// is driven by a plain useState + setInterval at 500 ms, same pattern used by
// StreamingCursor.
export type InputPanelProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  promptInputHintText: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  assistantResponseStatus: AssistantResponseStatus;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function InputPanel(props: InputPanelProps): ReactNode {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex((prev) => prev + 1);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const isCursorVisible = frameIndex % 2 === 0;
  const cursorCharacter = !props.isPromptInputDisabled && isCursorVisible ? "█" : " ";
  const isStreamingResponse = props.assistantResponseStatus === "streaming_assistant_response";

  return (
    <box
      borderStyle="rounded"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
    >
      <box flexDirection="row" justifyContent="space-between" paddingX={2}>
        <text fg={chatScreenTheme.accentGreen}>
          {`[ ${glyphs.statusDot} ${props.modeLabel} ]`}
        </text>
        <text fg={chatScreenTheme.textMuted}>
          {`[ ${props.modelIdentifier} · ${props.reasoningEffortLabel} ]`}
        </text>
      </box>
      <box flexDirection="row" paddingX={2} paddingY={1} gap={1}>
        <text fg={chatScreenTheme.accentGreen}>
          <b>{">"}</b>
        </text>
        <text fg={chatScreenTheme.textPrimary}>
          {`${props.promptDraft}${cursorCharacter}`}
        </text>
      </box>
      <box
        backgroundColor={chatScreenTheme.surfaceTwo}
        flexDirection="row"
        justifyContent="space-between"
        paddingX={2}
      >
        {isStreamingResponse ? (
          <box flexDirection="row" gap={1}>
            <SnakeAnimationIndicator />
            <text fg={chatScreenTheme.textMuted}>{"working…"}</text>
          </box>
        ) : (
          <text fg={chatScreenTheme.textMuted}>{props.promptInputHintText}</text>
        )}
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </box>
    </box>
  );
}
