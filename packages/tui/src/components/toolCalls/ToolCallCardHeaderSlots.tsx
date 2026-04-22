import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";

export type ToolCallHeaderLeftProps = {
  toolGlyph: string;
  toolGlyphColor: string;
  toolNameLabel: string;
  toolTargetContent?: ReactNode;
};

export function ToolCallHeaderLeft(props: ToolCallHeaderLeftProps): ReactNode {
  return (
    <box flexDirection="row" alignItems="center">
      <text fg={props.toolGlyphColor}>{props.toolGlyph}</text>
      <box marginLeft={1}>
        <text>
          <b fg={chatScreenTheme.textPrimary}>{props.toolNameLabel}</b>
        </text>
      </box>
      {props.toolTargetContent ? (
        <box marginLeft={1}>{props.toolTargetContent}</box>
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
    <box flexDirection="row" alignItems="center">
      <text>
        <b fg={props.statusColor}>{props.statusLabel}</b>
      </text>
      <box marginLeft={1}>
        <text fg={props.statusColor}>{statusGlyph}</text>
      </box>
    </box>
  );
}
