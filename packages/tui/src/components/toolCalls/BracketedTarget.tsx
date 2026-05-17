import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type BracketedTargetProps =
  | { accentColor: string; targetText: string; children?: never; maximumTargetTextCharacterCount?: number }
  | { accentColor: string; targetText?: never; children: ReactNode; maximumTargetTextCharacterCount?: number };

const DEFAULT_MAXIMUM_TARGET_TEXT_CHARACTER_COUNT = 160;

function buildVisibleTargetText(input: {
  targetText: string;
  maximumTargetTextCharacterCount: number | undefined;
}): string {
  const maximumTargetTextCharacterCount = Math.max(
    1,
    Math.floor(input.maximumTargetTextCharacterCount ?? DEFAULT_MAXIMUM_TARGET_TEXT_CHARACTER_COUNT),
  );
  return input.targetText.length > maximumTargetTextCharacterCount
    ? input.targetText.slice(0, maximumTargetTextCharacterCount)
    : input.targetText;
}

export function BracketedTarget(props: BracketedTargetProps): ReactNode {
  const visibleTargetText = props.targetText === undefined
    ? undefined
    : buildVisibleTargetText({
        targetText: props.targetText,
        maximumTargetTextCharacterCount: props.maximumTargetTextCharacterCount,
      });

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
            {visibleTargetText}
          </text>
        </box>
      )}
      <text>
        <b fg={props.accentColor}>{"]"}</b>
      </text>
    </box>
  );
}
