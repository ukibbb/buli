import type { ReactNode } from "react";
import type { ToolCallEditDiffLine, ToolCallEditDiffLineKind } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// DiffBlock renders unified diff lines. Addition / removal rows use a dark
// tinted background (diffAdditionBg / diffRemovalBg in the theme) because
// a box background spans the full row width, matching the pen-file tinted fill.
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
  const widestLineNumber = Math.max(
    props.diffLines.length,
    ...props.diffLines.map((toolCallEditDiffLine) => toolCallEditDiffLine.lineNumber ?? 0),
  );
  const gutterWidth = Math.max(2, String(widestLineNumber).length);

  return (
    <box flexDirection="column" width="100%">
      {props.diffLines.map((toolCallEditDiffLine, index) => (
        <box
          alignItems="center"
          backgroundColor={diffLineKindBackgroundColors[toolCallEditDiffLine.lineKind]}
          flexDirection="row"
          key={`diff-line-${index}`}
          overflow="hidden"
          paddingX={1}
          width="100%"
        >
          <box flexShrink={0} width={gutterWidth}>
            <text fg={diffLineKindTextColors[toolCallEditDiffLine.lineKind]}>
              {toolCallEditDiffLine.lineNumber === undefined
                ? " ".repeat(gutterWidth)
                : String(toolCallEditDiffLine.lineNumber).padStart(gutterWidth, " ")}
            </text>
          </box>
          <box flexShrink={0} marginX={1} width={1}>
            <text fg={diffLineKindTextColors[toolCallEditDiffLine.lineKind]}>
              {diffLineKindSigils[toolCallEditDiffLine.lineKind]}
            </text>
          </box>
          <box flexShrink={1} minWidth={0} overflow="hidden" width="100%">
            <text fg={diffLineKindTextColors[toolCallEditDiffLine.lineKind]} truncate={true} wrapMode="none" width="100%">
              {toolCallEditDiffLine.lineText}
            </text>
          </box>
        </box>
      ))}
    </box>
  );
}
