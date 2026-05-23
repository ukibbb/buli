import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { glyphs } from "../glyphs.ts";
import { createClickableControlMouseDownHandler } from "../primitives/clickableControl.ts";
import { InlineSnakeAnimationIndicator, SnakeAnimationIndicator } from "../SnakeAnimationIndicator.tsx";

export type ToolCallCompactDisclosureState =
  | { isContentExpandable: false }
  | {
      isContentExpandable: true;
      isContentExpanded: boolean;
      onContentExpansionToggle: () => void;
    };

export type ToolCallCompactHeaderProps = {
  accentColor: string;
  approvalDecisionControl?: ReactNode;
  disclosureState: ToolCallCompactDisclosureState;
  statusColor: string;
  statusKind: "success" | "error" | "pending";
  statusLabel?: string;
  pendingSnakeVariant?: "sixCell" | "eatingApple";
  toolNameLabel: string;
  toolTargetText?: string;
};

export function ToolCallCompactHeader(props: ToolCallCompactHeaderProps): ReactNode {
  const disclosureText = props.disclosureState.isContentExpandable && props.disclosureState.isContentExpanded
    ? "[-]"
    : "[+]";
  const toggleProps = props.disclosureState.isContentExpandable
    ? { onMouseDown: createClickableControlMouseDownHandler(props.disclosureState.onContentExpansionToggle) }
    : {};
  const selectableProps = props.disclosureState.isContentExpandable ? { selectable: false } : {};
  const shouldKeepApprovalHeaderOnOneLine = props.approvalDecisionControl !== undefined;

  return (
    <box
      {...toggleProps}
      alignItems="center"
      flexDirection="row"
      minWidth={0}
      width="100%"
    >
      <box
        flexShrink={1}
        minWidth={0}
        {...(shouldKeepApprovalHeaderOnOneLine ? { overflow: "hidden" } : {})}
        width="100%"
      >
        <text {...selectableProps} wrapMode={shouldKeepApprovalHeaderOnOneLine ? "none" : "char"} width="100%">
          {props.statusKind === "pending" ? (
            <>
              <InlineSnakeAnimationIndicator variant={props.pendingSnakeVariant ?? "eatingApple"} />
              <span fg={props.accentColor}>{` ${disclosureText}`}</span>
            </>
          ) : (
            <span fg={props.accentColor}>{disclosureText}</span>
          )}
          <span fg={chatScreenTheme.textPrimary}>{` ${props.toolNameLabel}`}</span>
          {props.toolTargetText ? (
            <>
              <span fg={props.accentColor}>{" ["}</span>
              <span fg={chatScreenTheme.textMuted}>{props.toolTargetText}</span>
              <span fg={props.accentColor}>{"]"}</span>
            </>
          ) : null}
          <ToolCallCompactStatus
            statusColor={props.statusColor}
            statusKind={props.statusKind}
            statusLabel={props.statusLabel}
          />
        </text>
      </box>
      {props.approvalDecisionControl ? (
        <box flexShrink={0} marginLeft={1}>{props.approvalDecisionControl}</box>
      ) : null}
    </box>
  );
}

function ToolCallCompactStatus(props: {
  statusColor: string;
  statusKind: "success" | "error" | "pending";
  statusLabel: string | undefined;
}): ReactNode {
  if (props.statusKind === "pending") {
    return null;
  }

  const statusGlyph = props.statusKind === "success" ? glyphs.checkMark : glyphs.close;
  return (
    <span fg={props.statusColor}>{` ${props.statusLabel ?? (props.statusKind === "success" ? "done" : "failed")} ${statusGlyph}`}</span>
  );
}

export type ToolCallHeaderLeftProps = {
  toolNameLabel: string;
  toolTargetContent?: ReactNode;
};

export function ToolCallHeaderLeft(props: ToolCallHeaderLeftProps): ReactNode {
  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} overflow="hidden" width="100%">
      <box flexShrink={0}>
        <text wrapMode="none">
          <span fg={chatScreenTheme.textPrimary}>{props.toolNameLabel}</span>
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
  if (props.statusKind === "pending") {
    return props.statusContent ?? <SnakeAnimationIndicator variant="eatingApple" />;
  }

  const statusGlyph =
    props.statusKind === "success"
      ? glyphs.checkMark
      : glyphs.close;

  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} justifyContent="flex-end" minWidth={0} overflow="hidden">
      <box flexShrink={1} minWidth={0} overflow="hidden">
        {props.statusContent ?? (
          <text wrapMode="none" width="100%">
            <span fg={props.statusColor}>{props.statusLabel}</span>
          </text>
        )}
      </box>
      <box flexShrink={0} marginLeft={1}>
        <text fg={props.statusColor}>{statusGlyph}</text>
      </box>
    </box>
  );
}
