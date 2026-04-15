import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { ToolCallEditDiffLine, ToolCallEditDiffLineKind } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";

// DiffBlock renders unified diff lines. Addition / removal rows use a dark
// tinted background (see diffAdditionBg / diffRemovalBg in the theme) because
// Ink's Text backgroundColor only covers glyphs — we need a Box background to
// span the whole row width, matching the pen-file tinted row fill.
export type DiffBlockProps = {
  diffLines: ToolCallEditDiffLine[];
};

const diffLineKindBackgroundColors: Record<ToolCallEditDiffLineKind, string> = {
  context: chatScreenTheme.bg,
  addition: chatScreenTheme.diffAdditionBg,
  removal: chatScreenTheme.diffRemovalBg,
};

const diffLineKindTextColors: Record<ToolCallEditDiffLineKind, string> = {
  context: chatScreenTheme.textSecondary,
  addition: chatScreenTheme.accentGreen,
  removal: chatScreenTheme.accentRed,
};

const diffLineKindSigils: Record<ToolCallEditDiffLineKind, string> = {
  context: " ",
  addition: "+",
  removal: "-",
};

export function DiffBlock(props: DiffBlockProps): ReactNode {
  const gutterWidth = Math.max(
    2,
    String(props.diffLines.at(-1)?.lineNumber ?? props.diffLines.length).length,
  );
  return (
    <Box flexDirection="column" width="100%">
      {props.diffLines.map((toolCallEditDiffLine, index) => (
        <Box
          backgroundColor={diffLineKindBackgroundColors[toolCallEditDiffLine.lineKind]}
          key={`diff-line-${index}`}
          paddingX={1}
          width="100%"
        >
          <Box flexShrink={0} width={gutterWidth}>
            <Text color={diffLineKindTextColors[toolCallEditDiffLine.lineKind]}>
              {toolCallEditDiffLine.lineNumber === undefined
                ? " ".repeat(gutterWidth)
                : String(toolCallEditDiffLine.lineNumber).padStart(gutterWidth, " ")}
            </Text>
          </Box>
          <Box flexShrink={0} marginX={1} width={1}>
            <Text color={diffLineKindTextColors[toolCallEditDiffLine.lineKind]}>
              {diffLineKindSigils[toolCallEditDiffLine.lineKind]}
            </Text>
          </Box>
          <Box flexShrink={1}>
            <Text color={diffLineKindTextColors[toolCallEditDiffLine.lineKind]}>
              {toolCallEditDiffLine.lineText}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
