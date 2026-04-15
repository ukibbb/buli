import { Box, Text, useAnimation } from "ink";
import React from "react";
import type { AssistantResponseStatus } from "../chatScreenState.ts";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import { glyphs } from "./glyphs.ts";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Renders the HERO 1 input panel (pen frame HOeet). Owns three stacked rows:
// a header strip with mode + model chips, a body with the prompt draft and
// a caret, and a footer that shows either the scroll/help hint or the
// working indicator plus the context-window meter.
export type InputPanelProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  promptInputHintText: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  assistantResponseStatus: AssistantResponseStatus;
  tokenUsagePercentageOfContextWindow: number | undefined;
};

export function InputPanel(props: InputPanelProps) {
  const { frame } = useAnimation({ interval: 500 });
  // Blink the cursor on/off by toggling between even and odd frames.
  const isCursorVisible = frame % 2 === 0;
  const cursorCharacter = !props.isPromptInputDisabled && isCursorVisible ? "█" : " ";
  const isStreamingResponse = props.assistantResponseStatus === "streaming_assistant_response";

  return (
    <Box
      borderStyle="round"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.surfaceOne}
    >
      <Box justifyContent="space-between" paddingX={2}>
        <Text color={chatScreenTheme.accentGreen}>
          {`[ ${glyphs.statusDot} ${props.modeLabel} ]`}
        </Text>
        <Text color={chatScreenTheme.textMuted}>
          {`[ ${props.modelIdentifier} · ${props.reasoningEffortLabel} ]`}
        </Text>
      </Box>
      <Box paddingX={2} paddingY={1} gap={1}>
        <Text bold color={chatScreenTheme.accentGreen}>
          &gt;
        </Text>
        <Text color={chatScreenTheme.textPrimary}>
          {`${props.promptDraft}${cursorCharacter}`}
        </Text>
      </Box>
      <Box backgroundColor={chatScreenTheme.surfaceTwo} justifyContent="space-between" paddingX={2}>
        {isStreamingResponse ? (
          <Box gap={1}>
            <SnakeAnimationIndicator />
            <Text color={chatScreenTheme.textMuted}>working…</Text>
          </Box>
        ) : (
          <Text color={chatScreenTheme.textMuted}>{props.promptInputHintText}</Text>
        )}
        <Text color={chatScreenTheme.textMuted}>
          {props.tokenUsagePercentageOfContextWindow === undefined
            ? "ctx --"
            : `ctx ${props.tokenUsagePercentageOfContextWindow}%`}
        </Text>
      </Box>
    </Box>
  );
}
