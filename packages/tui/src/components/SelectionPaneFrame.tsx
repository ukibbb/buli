import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SelectionPaneFrameProps = {
  headingText: string;
  accentColor: string;
  children: ReactNode;
};

export function SelectionPaneFrame(props: SelectionPaneFrameProps): ReactNode {
  return (
    <box
      borderStyle="rounded"
      borderColor={props.accentColor}
      backgroundColor={chatScreenTheme.surfaceOne}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      paddingX={1}
    >
      <text fg={chatScreenTheme.textMuted}>{props.headingText}</text>
      {props.children}
    </box>
  );
}
