import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";

export type ToolCallHeaderLeftProps = {
  toolNameLabel: string;
  toolTargetContent?: ReactNode;
};

export function ToolCallHeaderLeft(props: ToolCallHeaderLeftProps): ReactNode {
  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} overflow="hidden" width="100%">
      <box flexShrink={0}>
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
  statusColor: string;
  statusKind: "success" | "error" | "pending";
} & (
  { statusLabel: string; statusContent?: undefined } |
  { statusContent: ReactNode; statusLabel?: undefined }
);

export function ToolCallHeaderRight(props: ToolCallHeaderRightProps): ReactNode {
  const statusGlyph =
    props.statusKind === "success"
      ? glyphs.checkMark
      : props.statusKind === "error"
        ? glyphs.close
        : glyphs.statusDot;

  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} justifyContent="flex-end" minWidth={0} overflow="hidden">
      <box flexShrink={1} minWidth={0} overflow="hidden">
        {props.statusContent ?? (
          <text wrapMode="none" width="100%">
            <b fg={props.statusColor}>{props.statusLabel}</b>
          </text>
        )}
      </box>
      <box flexShrink={0} marginLeft={1}>
        <text fg={props.statusColor}>{statusGlyph}</text>
      </box>
    </box>
  );
}
