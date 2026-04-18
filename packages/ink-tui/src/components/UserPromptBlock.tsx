import { Box, Text } from "ink";
import React from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen component GgP0q: cyan chevron caret followed by the prompt text in the
// primary text color, one cell of gap between them.
export type UserPromptBlockProps = {
  promptText: string;
};

export function UserPromptBlock(props: UserPromptBlockProps) {
  return (
    <Box gap={1}>
      <Text bold color={chatScreenTheme.accentCyan}>
        {glyphs.userPromptCaret}
      </Text>
      <Text color={chatScreenTheme.textPrimary}>{props.promptText}</Text>
    </Box>
  );
}
