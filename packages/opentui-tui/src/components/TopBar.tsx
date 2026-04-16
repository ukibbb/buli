import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// The mode chip, model chip, and close glyph that used to live on the right
// moved into the help modal / input panel so the bar collapses from a three-row
// bordered strip to a single status row plus a divider (pen tFwmC).
export type TopBarProps = {
  workingDirectoryPath: string;
};

export function TopBar(props: TopBarProps): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      <box
        backgroundColor={chatScreenTheme.surfaceOne}
        flexDirection="row"
        paddingX={2}
        gap={1}
        alignItems="center"
      >
        <text fg={chatScreenTheme.accentGreen}>{glyphs.statusDot}</text>
        <text fg={chatScreenTheme.textSecondary}>{props.workingDirectoryPath}</text>
      </box>
      <box backgroundColor={chatScreenTheme.border} height={1} width="100%" />
    </box>
  );
}
