import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { shortenTerminalTextWithMiddleEllipsis } from "../shortenTerminalTextWithMiddleEllipsis.ts";

export type BracketedTargetProps =
  | { accentColor: string; targetText: string; children?: never; maximumTargetTextCharacterCount?: number }
  | { accentColor: string; targetText?: never; children: ReactNode; maximumTargetTextCharacterCount?: number };

const defaultMaximumTargetTextCharacterCount = 32;

export function BracketedTarget(props: BracketedTargetProps): ReactNode {
  const displayedTargetText =
    props.targetText !== undefined
      ? shortenTerminalTextWithMiddleEllipsis(
          props.targetText,
          props.maximumTargetTextCharacterCount ?? defaultMaximumTargetTextCharacterCount,
        )
      : undefined;

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
          <text fg={chatScreenTheme.textMuted} truncate={true} wrapMode="none">
            {displayedTargetText}
          </text>
        </box>
      )}
      <text>
        <b fg={props.accentColor}>{"]"}</b>
      </text>
    </box>
  );
}
