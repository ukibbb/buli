import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { createClickableControlMouseDownHandler } from "./primitives/clickableControl.ts";

export type ConversationTranscriptPageNavigationRowProps = {
  placement: "top" | "bottom";
  primaryLabel: string;
  detailLabel?: string | undefined;
  isDisabled: boolean;
  onNavigate: () => void;
};

export function ConversationTranscriptPageNavigationRow(props: ConversationTranscriptPageNavigationRowProps): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const accentColor = chatScreenTheme.accentPurple;
  const actionColor = props.isDisabled
    ? chatScreenTheme.textDim
    : isPointerHovering
    ? chatScreenTheme.textPrimary
    : accentColor;
  const detailColor = props.isDisabled
    ? chatScreenTheme.textDim
    : isPointerHovering
    ? chatScreenTheme.textSecondary
    : chatScreenTheme.textDim;

  return (
    <box
      {...(!props.isDisabled && isPointerHovering ? { backgroundColor: chatScreenTheme.surfaceOne } : {})}
      border={props.placement === "top" ? ["bottom"] : ["top"]}
      borderColor={props.isDisabled ? chatScreenTheme.borderSubtle : accentColor}
      flexDirection="row"
      {...(!props.isDisabled ? { onMouseDown: createClickableControlMouseDownHandler(props.onNavigate) } : {})}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseOver={() => setIsPointerHovering(true)}
      paddingX={1}
      width="100%"
    >
      <text selectable={false} truncate={true} wrapMode="none" width="100%">
        <span fg={actionColor}><b>{props.primaryLabel}</b></span>
        {props.detailLabel ? <span fg={detailColor}>{` · ${props.detailLabel}`}</span> : null}
      </text>
    </box>
  );
}
