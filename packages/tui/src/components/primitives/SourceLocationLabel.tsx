import type { ReactNode } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

export type SourceLineRange = {
  sourceStartLineNumber: number;
  sourceEndLineNumber: number;
};

export type SourceLocationLabelProps = {
  filePath: string;
  sourceLineRange?: SourceLineRange | undefined;
};

export function SourceLocationLabel(props: SourceLocationLabelProps): ReactNode {
  return (
    <text wrapMode="char" width="100%">
      <span fg={chatScreenTheme.accentCyan}>{props.filePath}</span>
      {props.sourceLineRange ? (
        <span fg={chatScreenTheme.textMuted}>{formatSourceLineRangeSuffix(props.sourceLineRange)}</span>
      ) : null}
    </text>
  );
}

export function formatSourceLineRangeSuffix(sourceLineRange: SourceLineRange): string {
  if (sourceLineRange.sourceStartLineNumber === sourceLineRange.sourceEndLineNumber) {
    return `:${sourceLineRange.sourceStartLineNumber}`;
  }

  return `:${sourceLineRange.sourceStartLineNumber}-${sourceLineRange.sourceEndLineNumber}`;
}
