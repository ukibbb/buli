import { Box, Text } from "ink";
import { chatScreenTheme } from "../chatScreenTheme.ts";

export type PromptDraftPaneProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  promptInputHintText: string;
};

export function PromptDraftPane(props: PromptDraftPaneProps) {
  const cursorSuffix = props.isPromptInputDisabled ? "" : "_";
  const promptTextColor = props.isPromptInputDisabled ? chatScreenTheme.textMuted : chatScreenTheme.textPrimary;

  return (
    <Box
      backgroundColor={chatScreenTheme.surfaceTwo}
      borderColor={chatScreenTheme.border}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
    >
      <Text bold color={chatScreenTheme.accentCyan}>
        Prompt
      </Text>
      <Text color={promptTextColor}>{`> ${props.promptDraft}${cursorSuffix}`}</Text>
      <Text color={chatScreenTheme.textMuted} wrap="wrap">
        {props.promptInputHintText}
      </Text>
    </Box>
  );
}
