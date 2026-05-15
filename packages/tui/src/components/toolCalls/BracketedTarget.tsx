import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type BracketedTargetProps =
  | { accentColor: string; targetText: string; children?: never; maximumTargetTextCharacterCount?: number }
  | { accentColor: string; targetText?: never; children: ReactNode; maximumTargetTextCharacterCount?: number };

export function BracketedTarget(props: BracketedTargetProps): ReactNode {
  return (
    <box flexDirection="row" alignItems="center" flexShrink={1} minWidth={0} overflow="hidden">
      <text>
        <b fg={props.accentColor}>{"["}</b>
      </text>
      {props.children !== undefined ? (
        <box flexShrink={1} minWidth={0} overflow="hidden">
          {props.children}
        </box>
      ) : (
        <box flexShrink={1} minWidth={0} overflow="hidden">
          <text fg={chatScreenTheme.textMuted} wrapMode="none" width="100%">
            {props.targetText}
          </text>
        </box>
      )}
      <text>
        <b fg={props.accentColor}>{"]"}</b>
      </text>
    </box>
  );
}
