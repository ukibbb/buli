import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type BracketedTargetProps =
  | { accentColor: string; targetText: string; children?: never }
  | { accentColor: string; targetText?: never; children: ReactNode };

export function BracketedTarget(props: BracketedTargetProps): ReactNode {
  if (props.targetText !== undefined) {
    return (
      <text wrapMode="char">
        <span fg={props.accentColor}>{"["}</span>
        <span fg={chatScreenTheme.textMuted}>{props.targetText}</span>
        <span fg={props.accentColor}>{"]"}</span>
      </text>
    );
  }

  return (
    <box flexDirection="row" flexWrap="wrap" alignItems="center" flexShrink={1} minWidth={0}>
      <text fg={props.accentColor}>{"["}</text>
      <box flexShrink={1} minWidth={0}>{props.children}</box>
      <text>
        <span fg={props.accentColor}>{"]"}</span>
      </text>
    </box>
  );
}
