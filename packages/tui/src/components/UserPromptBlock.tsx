import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen component GgP0q: single-chevron caret in accent cyan followed by the
// prompt text in the primary text color, one cell of gap between them.
export type UserPromptBlockProps = {
  promptText: string;
};

export function UserPromptBlock(props: UserPromptBlockProps): ReactNode {
  return (
    <box flexDirection="row" gap={1}>
      <text fg={chatScreenTheme.accentCyan}>{glyphs.userPromptCaret}</text>
      <text fg={chatScreenTheme.textPrimary}>{props.promptText}</text>
    </box>
  );
}
