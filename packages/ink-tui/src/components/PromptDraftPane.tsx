import { Box, Text } from "ink";
import { chatScreenTheme } from "../chatScreenTheme.ts";

export type PromptDraftPaneProps = {
  promptDraft: string;
  isPromptInputDisabled: boolean;
  promptInputHintText: string;
};

export function PromptDraftPane(props: PromptDraftPaneProps) {
  const cursorSuffix = props.isPromptInputDisabled ? "" : "_";
  const promptTextColor = props.isPromptInputDisabled ? chatScreenTheme.mutedTextColor : chatScreenTheme.primaryTextColor;

  return (
    <Box
      backgroundColor={chatScreenTheme.promptDockBackgroundColor}
      borderColor={chatScreenTheme.borderColor}
      borderStyle={chatScreenTheme.borderStyle}
      flexDirection="column"
      paddingX={1}
    >
      <Text bold color={chatScreenTheme.titleAccentColor}>
        Prompt
      </Text>
      <Text color={promptTextColor}>{`> ${props.promptDraft}${cursorSuffix}`}</Text>
      <Text color={chatScreenTheme.mutedTextColor} wrap="wrap">
        {props.promptInputHintText}
      </Text>
    </Box>
  );
}
