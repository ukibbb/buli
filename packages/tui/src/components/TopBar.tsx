import type { ReactNode } from "react";
import { chatScreenTheme, type ChatScreenTheme } from "@buli/assistant-design-tokens";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
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
  accentColor: ChatScreenTheme["accentAmber"] | ChatScreenTheme["accentGreen"] | ChatScreenTheme["accentPink"];
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
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
      <text fg={props.accentColor}>{glyphs.statusDot}</text>
      <box flexShrink={1} minWidth={0} overflow="hidden">
        <text fg={chatScreenTheme.textSecondary} truncate={true} wrapMode="none">{props.workingDirectoryPath}</text>
      </box>
      <box flexShrink={0}>
        <ContextWindowMeter
          totalTokensUsed={props.totalContextTokensUsed}
          contextWindowTokenCapacity={props.contextWindowTokenCapacity}
        />
      </box>
    </box>
  );
}
