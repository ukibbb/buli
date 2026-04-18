import { Box, Text } from "ink";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders the HERO 1 top bar. The mode chip, model chip, and close glyph
// that used to live on the right moved into the help modal / input panel so
// the bar collapses from a three-row bordered strip to a single status row.
//
// Exported row count is the source of truth for ChatScreen's responsive
// budgeting math — keep it in sync with the rendered output below.
export const TOP_BAR_NATURAL_ROW_COUNT = 1;

export type TopBarProps = {
  workingDirectoryPath: string;
};

export function TopBar(props: TopBarProps) {
  return (
    <Box
      backgroundColor={chatScreenTheme.bg}
      paddingX={2}
      gap={1}
      alignItems="center"
      flexShrink={0}
    >
      <Text color={chatScreenTheme.accentGreen}>{glyphs.statusDot}</Text>
      <Text color={chatScreenTheme.textSecondary}>{props.workingDirectoryPath}</Text>
    </Box>
  );
}
