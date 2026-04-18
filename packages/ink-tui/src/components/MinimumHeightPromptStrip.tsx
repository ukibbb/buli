import { Box, Text } from "ink";
import type { AssistantResponseStatus } from "../chatScreenState.ts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { PromptDraftText } from "./PromptDraftText.tsx";

// Single-row degraded replacement for InputPanel used at minimumTerminalSizeTier.
// Drops every secondary element (mode chip, model chip, help footer, context
// meter, snake spinner) so the prompt caret and draft stay visible even when
// the terminal collapses to ~6 rows.
//
// Exported row count is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT = 1;

export type MinimumHeightPromptStripProps = {
  promptDraft: string;
  selectedPromptContextReferenceTexts?: readonly string[];
  isPromptInputDisabled: boolean;
  assistantResponseStatus: AssistantResponseStatus;
};

export function MinimumHeightPromptStrip(props: MinimumHeightPromptStripProps) {
  const isStreamingResponse = props.assistantResponseStatus === "streaming_assistant_response";
  if (isStreamingResponse) {
    return (
      <Box
        backgroundColor={chatScreenTheme.surfaceOne}
        flexShrink={0}
        paddingX={1}
      >
        <Text color={chatScreenTheme.textMuted}>… working</Text>
      </Box>
    );
  }

  const cursorCharacter = props.isPromptInputDisabled ? " " : "█";
  return (
    <Box
      backgroundColor={chatScreenTheme.surfaceOne}
      flexShrink={0}
      paddingX={1}
      gap={1}
    >
      <Text bold color={chatScreenTheme.accentGreen}>
        &gt;
      </Text>
      <PromptDraftText
        promptDraft={props.promptDraft}
        selectedPromptContextReferenceTexts={props.selectedPromptContextReferenceTexts}
        cursorCharacter={cursorCharacter}
      />
    </Box>
  );
}
