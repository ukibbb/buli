import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { AssistantResponseStatus } from "../chatScreenState.ts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { glyphs } from "./glyphs.ts";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Pen frame HOeet. Owns three stacked rows: a header strip with mode + model
// chips, a body with the prompt draft and caret, and a footer that shows the
// persistent `[?] help · shortcuts` block when idle, the working indicator
// while streaming, or a contextual override message (e.g. selection open)
// when a modal/selection owns keyboard focus.
//
// promptInputHintOverride is undefined in the default idle state so the
// footer can render the design's coloured bracket-cyan-?-dim glyphs rather
// than being forced through a plain monochrome string.
//
// Exported row count = 2 (rounded border) + 1 (header) + 3 (body w/ paddingY)
// + 1 (footer). It is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const INPUT_PANEL_NATURAL_ROW_COUNT = 7;

export type InputPanelProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  promptInputHintOverride?: string;
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
      flexShrink={0}
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
        ) : props.promptInputHintOverride ? (
          <text fg={chatScreenTheme.textMuted}>{props.promptInputHintOverride}</text>
        ) : (
          <text>
            <span fg={chatScreenTheme.textDim}>{"[ "}</span>
            <b fg={chatScreenTheme.accentCyan}>{"?"}</b>
            <span fg={chatScreenTheme.textDim}>{" ] "}</span>
            <span fg={chatScreenTheme.textMuted}>{"help · shortcuts"}</span>
          </text>
        )}
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </box>
    </box>
  );
}
