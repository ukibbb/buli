import { Box, Text } from "ink";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "./glyphs.ts";

// Renders the HERO 1 top bar. The mode chip, model chip, and close glyph
// that used to live on the right moved into the help modal / input panel so
// the bar collapses from a three-row bordered strip to a single status row.
export type TopBarProps = {
  workingDirectoryPath: string;
};

export function TopBar(props: TopBarProps) {
  return (
    <Box
      backgroundColor={chatScreenTheme.surfaceOne}
      paddingX={2}
      gap={1}
      alignItems="center"
    >
      <Text color={chatScreenTheme.accentGreen}>{glyphs.statusDot}</Text>
      <Text color={chatScreenTheme.textSecondary}>{props.workingDirectoryPath}</Text>
    </Box>
  );
}
