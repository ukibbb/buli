import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Renders a message transcript entry whose role is "user". Matches pen
// component GgP0q: cyan caret, prompt text in the primary text color, one
// cell of gap between them.
export type UserPromptBlockProps = {
  promptText: string;
};

export function UserPromptBlock(props: UserPromptBlockProps): ReactNode {
  return (
    <box flexDirection="row" gap={1}>
      <text fg={chatScreenTheme.accentCyan}>
        <b>{">"}</b>
      </text>
      <text fg={chatScreenTheme.textPrimary}>{props.promptText}</text>
    </box>
  );
}
