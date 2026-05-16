import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SelectionPaneFrameProps = {
  accentColor: string;
  children: ReactNode;
};

export function SelectionPaneFrame(props: SelectionPaneFrameProps): ReactNode {
  return (
    <box
      backgroundColor={chatScreenTheme.surfaceOne}
      borderStyle="rounded"
      borderColor={props.accentColor}
      border={["top", "left", "right"]}
      flexDirection="column"
      flexShrink={0}
      marginX={2}
      paddingX={1}
    >
      {props.children}
    </box>
  );
}
