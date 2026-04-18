import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

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
  if (props.variant === "inline") {
    // <u> is a text-node element and must live inside a <text> parent.
    return (
      <text>
        <u fg={chatScreenTheme.accentCyan}>
          {displayText}
        </u>
      </text>
    );
  }
  if (props.variant === "symbol") {
    // <span> elements are text-node elements; each must be inside a <text>.
    return (
      <box>
        <text><span fg={chatScreenTheme.accentPrimaryMuted}>{"⌘ "}</span></text>
        <text><span fg={chatScreenTheme.accentCyan}>{displayText}</span></text>
      </box>
    );
  }
  // Remaining arm: pill — bordered chip suitable for headers.
  // borderStyle "round" becomes "rounded" in OpenTUI; all four sides enabled.
  return (
    <box borderColor={chatScreenTheme.border} borderStyle="rounded" border={true} paddingX={1}>
      <text><span fg={chatScreenTheme.accentCyan}>{displayText}</span></text>
    </box>
  );
}
