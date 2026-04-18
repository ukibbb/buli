import { Box, Text, useAnimation } from "ink";
import type { AssistantResponseStatus } from "../chatScreenState.ts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { glyphs } from "./glyphs.ts";
import { PromptDraftText } from "./PromptDraftText.tsx";
import { SnakeAnimationIndicator } from "./SnakeAnimationIndicator.tsx";

// Renders the HERO 1 input panel (pen frame HOeet). Owns three stacked rows:
// a header strip with mode + model chips, a body with the prompt draft and
// a caret, and a footer that shows the persistent idle shortcuts block when
// idle, the working indicator while streaming, or a contextual override
// message (e.g. selection open) when a modal/selection owns keyboard focus.
//
// promptInputHintOverride is undefined in the default idle state so the
// footer can render the coloured `[ ? ] help · shortcuts` glyphs plus the
// always-visible caret/transcript hints instead of a plain monochrome string.
//
// Exported row count = 2 (rounded border) + 1 (header) + 3 (body w/ paddingY)
// + 1 (footer). It is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const INPUT_PANEL_NATURAL_ROW_COUNT = 7;

export type InputPanelProps = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  selectedPromptContextReferenceTexts?: readonly string[];
  isPromptInputDisabled: boolean;
  promptInputHintOverride?: string;
  modeLabel: string;
  modelIdentifier: string;
  reasoningEffortLabel: string;
  assistantResponseStatus: AssistantResponseStatus;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
};

export function InputPanel(props: InputPanelProps) {
  const { frame } = useAnimation({ interval: 500, isActive: !props.isPromptInputDisabled });
  // Blink the cursor on/off by toggling between even and odd frames.
  const isCursorVisible = frame % 2 === 0;
  const cursorCharacter = !props.isPromptInputDisabled && isCursorVisible ? "█" : " ";
  const isStreamingResponse = props.assistantResponseStatus === "streaming_assistant_response";

  return (
    <Box
      borderStyle="round"
      borderColor={chatScreenTheme.accentGreen}
      flexDirection="column"
      backgroundColor={chatScreenTheme.bg}
      flexShrink={0}
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
        <Box flexGrow={1}>
          <PromptDraftText
            promptDraft={props.promptDraft}
            promptDraftCursorOffset={props.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
            cursorCharacter={cursorCharacter}
            shouldRenderPromptDraftOnSingleLine={true}
          />
        </Box>
      </Box>
      <Box backgroundColor={chatScreenTheme.bg} justifyContent="space-between" paddingX={2}>
        {isStreamingResponse ? (
          <Box gap={1}>
            <SnakeAnimationIndicator />
            <Text color={chatScreenTheme.textMuted}>working…</Text>
          </Box>
        ) : props.promptInputHintOverride !== undefined ? (
          <Text color={chatScreenTheme.textMuted}>{props.promptInputHintOverride}</Text>
        ) : (
          <Box>
            <Text color={chatScreenTheme.textDim}>{"[ "}</Text>
            <Text bold color={chatScreenTheme.accentCyan}>{"?"}</Text>
            <Text color={chatScreenTheme.textDim}>{" ] "}</Text>
            <Text color={chatScreenTheme.textMuted}>{"help · shortcuts · "}</Text>
            <Text color={chatScreenTheme.textDim}>{"[ ← → ] "}</Text>
            <Text color={chatScreenTheme.textMuted}>{"caret · "}</Text>
            <Text color={chatScreenTheme.textDim}>{"[ ↑ ↓ ] "}</Text>
            <Text color={chatScreenTheme.textMuted}>{"transcript"}</Text>
          </Box>
        )}
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </Box>
    </Box>
  );
}
