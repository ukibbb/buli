import { Box, Text } from "ink";
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
    return (
      <Text color={chatScreenTheme.accentCyan} underline>
        {displayText}
      </Text>
    );
  }
  if (props.variant === "symbol") {
    return (
      <Box>
        <Text color={chatScreenTheme.accentPrimaryMuted}>⌘ </Text>
        <Text color={chatScreenTheme.accentCyan}>{displayText}</Text>
      </Box>
    );
  }
  // Remaining arm: pill — bordered chip suitable for headers.
  return (
    <Box borderColor={chatScreenTheme.border} borderStyle="round" paddingX={1}>
      <Text color={chatScreenTheme.accentCyan}>{displayText}</Text>
    </Box>
  );
}
