import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type ApprovalDecisionControlProps = {
  onApprove: () => void;
  onDeny: () => void;
};

export function ApprovalDecisionControl(props: ApprovalDecisionControlProps): ReactNode {
  return (
    <box flexDirection="row" flexShrink={0}>
      <ApprovalDecisionAction
        accentColor={chatScreenTheme.accentGreen}
        keyboardShortcutLabel="y"
        actionLabel="yes"
        onActivate={props.onApprove}
      />
      <box marginLeft={2}>
        <ApprovalDecisionAction
          accentColor={chatScreenTheme.accentRed}
          keyboardShortcutLabel="n"
          actionLabel="no"
          onActivate={props.onDeny}
        />
      </box>
    </box>
  );
}

type ApprovalDecisionActionProps = {
  accentColor: string;
  keyboardShortcutLabel: string;
  actionLabel: string;
  onActivate: () => void;
};

function ApprovalDecisionAction(props: ApprovalDecisionActionProps): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const labelColor = isPointerHovering ? props.accentColor : chatScreenTheme.textSecondary;
  return (
    <box
      flexDirection="row"
      flexShrink={0}
      onMouseOver={() => setIsPointerHovering(true)}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseDown={() => props.onActivate()}
    >
      <text wrapMode="none">
        <span fg={chatScreenTheme.textDim}>{"[ "}</span>
        <b fg={props.accentColor}>{props.keyboardShortcutLabel}</b>
        <span fg={chatScreenTheme.textDim}>{" ] "}</span>
        <span fg={labelColor}>{props.actionLabel}</span>
      </text>
    </box>
  );
}
