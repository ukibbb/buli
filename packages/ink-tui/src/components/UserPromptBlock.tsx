import { Box, Text } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Renders a message transcript entry whose role is "user". Matches pen
// component GgP0q: cyan caret, prompt text in the primary text color, one
// cell of gap between them.
export type UserPromptBlockProps = {
  promptText: string;
};

export function UserPromptBlock(props: UserPromptBlockProps) {
  return (
    <Box gap={1}>
      <Text bold color={chatScreenTheme.accentCyan}>
        &gt;
      </Text>
      <Text color={chatScreenTheme.textPrimary}>{props.promptText}</Text>
    </Box>
  );
}
