import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type BracketedTargetProps = {
  accentColor: string;
  targetText?: string;
  children?: ReactNode;
};

export function BracketedTarget(props: BracketedTargetProps): ReactNode {
  return (
    <box flexDirection="row" alignItems="center">
      <text>
        <b fg={props.accentColor}>{"["}</b>
      </text>
      {props.children ? (
        props.children
      ) : (
        <text fg={chatScreenTheme.textMuted}>{props.targetText ?? ""}</text>
      )}
      <text>
        <b fg={props.accentColor}>{"]"}</b>
      </text>
    </box>
  );
}
