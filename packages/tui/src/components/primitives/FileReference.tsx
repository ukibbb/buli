import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { shortenTerminalTextWithMiddleEllipsis } from "../shortenTerminalTextWithMiddleEllipsis.ts";

// File references appear in three visual shapes in the design:
// inline   — plain cyan, underlined, "path:line" style for use inside prose
// pill     — a bordered chip for use in card headers or banners
// symbol   — a leading "⌘" glyph + name, used where the reference should read
//            like a command-palette entry
export type FileReferenceVariant = "inline" | "pill" | "symbol";

export type FileReferenceProps = {
  variant: FileReferenceVariant;
  filePath: string;
  lineNumber?: number;
};

export function FileReference(props: FileReferenceProps): ReactNode {
  const displayText = props.lineNumber === undefined ? props.filePath : `${props.filePath}:${props.lineNumber}`;
  const shortenedDisplayText = shortenTerminalTextWithMiddleEllipsis(displayText, 48);
  if (props.variant === "inline") {
    // <u> is a text-node element and must live inside a <text> parent.
    return (
      <text truncate={true} wrapMode="none" width="100%">
        <u fg={chatScreenTheme.accentCyan}>
          {shortenedDisplayText}
        </u>
      </text>
    );
  }
  if (props.variant === "symbol") {
    // <span> elements are text-node elements; each must be inside a <text>.
    return (
      <box flexDirection="row" minWidth={0} overflow="hidden" width="100%">
        <text><span fg={chatScreenTheme.accentPrimaryMuted}>{"⌘ "}</span></text>
        <box flexShrink={1} minWidth={0} overflow="hidden" width="100%">
          <text truncate={true} wrapMode="none" width="100%"><span fg={chatScreenTheme.accentCyan}>{shortenedDisplayText}</span></text>
        </box>
      </box>
    );
  }
  // Remaining arm: pill — bordered chip suitable for headers.
  // borderStyle "round" becomes "rounded" in OpenTUI; all four sides enabled.
  return (
    <box borderColor={chatScreenTheme.border} borderStyle="rounded" border={true} minWidth={0} overflow="hidden" paddingX={1}>
      <text truncate={true} wrapMode="none" width="100%"><span fg={chatScreenTheme.accentCyan}>{shortenedDisplayText}</span></text>
    </box>
  );
}
