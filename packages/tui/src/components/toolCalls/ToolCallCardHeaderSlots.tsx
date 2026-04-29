import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";
import { shortenTerminalTextWithMiddleEllipsis } from "../shortenTerminalTextWithMiddleEllipsis.ts";

export type ToolCallHeaderLeftProps = {
  toolGlyph: string;
  toolGlyphColor: string;
  toolNameLabel: string;
  toolTargetContent?: ReactNode;
};

export function ToolCallHeaderLeft(props: ToolCallHeaderLeftProps): ReactNode {
  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} overflow="hidden" width="100%">
      <box flexShrink={0} width={2}>
        <text fg={props.toolGlyphColor}>{props.toolGlyph}</text>
      </box>
      <box flexShrink={0} marginLeft={1}>
        <text wrapMode="none">
          <b fg={chatScreenTheme.textPrimary}>{props.toolNameLabel}</b>
        </text>
      </box>
      {props.toolTargetContent ? (
        <box flexShrink={1} marginLeft={1} minWidth={0} overflow="hidden">
          {props.toolTargetContent}
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
  const displayedStatusLabel = shortenTerminalTextWithMiddleEllipsis(props.statusLabel, 32);

  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} justifyContent="flex-end" minWidth={0} overflow="hidden">
      <box flexShrink={1} minWidth={0} overflow="hidden">
        <text truncate={true} wrapMode="none">
          <b fg={props.statusColor}>{displayedStatusLabel}</b>
        </text>
      </box>
      <box flexShrink={0} marginLeft={1}>
        <text fg={props.statusColor}>{statusGlyph}</text>
      </box>
    </box>
  );
}
