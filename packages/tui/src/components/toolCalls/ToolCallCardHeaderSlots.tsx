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
    <box>
      <text>
        <span fg={props.toolGlyphColor}>{props.toolGlyph}</span>
      </text>
      <text>
        <b fg={chatScreenTheme.textPrimary}>{` ${props.toolNameLabel}`}</b>
      </text>
      {props.toolTargetContent ? (
        <box marginLeft={1}>
          <text>
            <span fg={chatScreenTheme.textMuted}>{"· "}</span>
          </text>
          <box>{props.toolTargetContent}</box>
        </box>
      ) : null}
    </box>
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
    <box>
      <text>
        <b fg={props.statusColor}>{props.statusLabel}</b>
      </text>
      <text>
        <span fg={props.statusColor}>{` ${statusGlyph}`}</span>
      </text>
    </box>
  );
}
