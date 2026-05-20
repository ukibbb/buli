import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type UserPromptBlockProps = {
  promptText: string;
  userPromptBorderColor: string;
};

const userPromptFrameBorderChars = {
  topLeft: "",
  bottomLeft: "└",
  vertical: "│",
  topRight: "",
  bottomRight: "─",
  horizontal: "─",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
} as const;

export function UserPromptBlock(props: UserPromptBlockProps): ReactNode {
  return (
    <box
      border={["left", "bottom"]}
      borderColor={props.userPromptBorderColor}
      customBorderChars={userPromptFrameBorderChars}
      flexDirection="column"
      paddingLeft={1}
      width="100%"
    >
      <text fg={chatScreenTheme.textPrimary} width="100%">{props.promptText}</text>
    </box>
  );
}
