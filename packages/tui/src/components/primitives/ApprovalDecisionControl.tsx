import { useState, type ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type ApprovalDecisionControlProps = {
  onApprove: () => void;
  onDeny: () => void;
};

export function ApprovalDecisionControl(props: ApprovalDecisionControlProps): ReactNode {
  return (
    <box flexDirection="row" flexShrink={0}>
      <ApprovalDecisionButton
        accentColor={chatScreenTheme.accentGreen}
        keyboardShortcutLabel="y"
        actionLabel="yes"
        onActivate={props.onApprove}
      />
      <box marginLeft={1}>
        <ApprovalDecisionButton
          accentColor={chatScreenTheme.accentRed}
          keyboardShortcutLabel="n"
          actionLabel="no"
          onActivate={props.onDeny}
        />
      </box>
    </box>
  );
}

type ApprovalDecisionButtonProps = {
  accentColor: string;
  keyboardShortcutLabel: string;
  actionLabel: string;
  onActivate: () => void;
};

function ApprovalDecisionButton(props: ApprovalDecisionButtonProps): ReactNode {
  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const borderColor = isPointerHovering ? props.accentColor : chatScreenTheme.border;
  return (
    <box
      border={true}
      borderStyle="single"
      borderColor={borderColor}
      paddingX={2}
      onMouseOver={() => setIsPointerHovering(true)}
      onMouseOut={() => setIsPointerHovering(false)}
      onMouseDown={() => props.onActivate()}
    >
      <text wrapMode="none">
        <b fg={props.accentColor}>{props.keyboardShortcutLabel}</b>
        {`  ${props.actionLabel}`}
      </text>
    </box>
  );
}
