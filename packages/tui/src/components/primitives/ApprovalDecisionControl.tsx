import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { createClickableControlMouseDownHandler } from "./clickableControl.ts";

export type ApprovalDecisionControlProps = {
  onApprove: () => void;
  onDeny: () => void;
};

export function ApprovalDecisionControl(props: ApprovalDecisionControlProps): ReactNode {
  return (
    <box flexDirection="row" flexShrink={0}>
      <ApprovalDecisionAction
        accentColor={chatScreenTheme.accentGreen}
        actionLabel="Yes"
        onActivate={props.onApprove}
      />
      <box marginLeft={1}>
        <ApprovalDecisionAction
          accentColor={chatScreenTheme.accentRed}
          actionLabel="No"
          onActivate={props.onDeny}
        />
      </box>
    </box>
  );
}

type ApprovalDecisionActionProps = {
  accentColor: string;
  actionLabel: string;
  onActivate: () => void;
};

function ApprovalDecisionAction(props: ApprovalDecisionActionProps): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const labelColor = isPointerHovering ? chatScreenTheme.textPrimary : props.accentColor;
  return (
    <box
      {...(isPointerHovering ? { backgroundColor: props.accentColor } : {})}
      flexDirection="row"
      flexShrink={0}
      paddingX={1}
      onMouseOver={() => setIsPointerHovering(true)}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseDown={createClickableControlMouseDownHandler(props.onActivate)}
    >
      <text fg={labelColor} selectable={false} wrapMode="none">
        <b>{props.actionLabel}</b>
      </text>
    </box>
  );
}
