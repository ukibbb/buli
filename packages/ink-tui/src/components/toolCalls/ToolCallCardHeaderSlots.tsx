import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";

// Small shared helpers for the two sides of a tool-call card header so each
// variant doesn't repeat the same glyph-plus-label layout. Keeping these
// component-shaped (not string utilities) means the caller can weave in a
// FileReference, a pattern, or a custom status glyph without rebuilding the
// layout from scratch.
export type ToolCallHeaderLeftProps = {
  toolGlyph: string;
  toolGlyphColor: string;
  toolNameLabel: string;
  toolTargetContent?: ReactNode;
};

export function ToolCallHeaderLeft(props: ToolCallHeaderLeftProps): ReactNode {
  return (
    <Box>
      <Text color={props.toolGlyphColor}>{props.toolGlyph}</Text>
      <Text bold color={chatScreenTheme.textPrimary}>
        {` ${props.toolNameLabel}`}
      </Text>
      {props.toolTargetContent ? (
        <Box marginLeft={1}>
          <Text color={chatScreenTheme.textMuted}>· </Text>
          <Box>{props.toolTargetContent}</Box>
        </Box>
      ) : null}
    </Box>
  );
}

export type ToolCallHeaderRightProps = {
  statusLabel: string;
  statusColor: string;
  statusKind: "success" | "error" | "pending";
};

export function ToolCallHeaderRight(props: ToolCallHeaderRightProps): ReactNode {
  const statusGlyph =
    props.statusKind === "success"
      ? glyphs.checkMark
      : props.statusKind === "error"
        ? glyphs.close
        : glyphs.statusDot;
  return (
    <Box>
      <Text bold color={props.statusColor}>
        {props.statusLabel}
      </Text>
      <Text color={props.statusColor}>{` ${statusGlyph}`}</Text>
    </Box>
  );
}
