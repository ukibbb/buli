import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Pen frame cbMSE. The design's 1-pixel h1Divider1 (pen tFwmC) below the bar
// reads as a chunky grey strip on a terminal cell grid, so we drop it and
// rely on the surface contrast between topBar and the transcript area below.
//
// Exported row count is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const TOP_BAR_NATURAL_ROW_COUNT = 1;

export type TopBarProps = {
  workingDirectoryPath: string;
};

export function TopBar(props: TopBarProps): ReactNode {
  return (
    <box
      backgroundColor={chatScreenTheme.bg}
      flexDirection="row"
      paddingX={2}
      gap={1}
      alignItems="center"
      flexShrink={0}
    >
      <text fg={chatScreenTheme.accentGreen}>{glyphs.statusDot}</text>
      <text fg={chatScreenTheme.textSecondary}>{props.workingDirectoryPath}</text>
    </box>
  );
}
