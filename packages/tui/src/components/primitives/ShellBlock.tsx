import type { ReactNode } from "react";
import type { ToolCallBashOutputLine, ToolCallBashOutputLineKind } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// ShellBlock visualises command transcripts. A "prompt" line is shown in
// accent colour so it reads as intent, stdout as primary text, and stderr in
// red so failures jump out of the stream.
export type ShellBlockProps = {
  outputLines: ToolCallBashOutputLine[];
  maxVisibleLines?: number;
};

const shellLineColors: Record<ToolCallBashOutputLineKind, string> = {
  prompt: chatScreenTheme.accentAmber,
  stdout: chatScreenTheme.textPrimary,
  stderr: chatScreenTheme.accentRed,
};

export function ShellBlock(props: ShellBlockProps): ReactNode {
  const visibleOutputLines =
    props.maxVisibleLines !== undefined && props.outputLines.length > props.maxVisibleLines
      ? props.outputLines.slice(0, props.maxVisibleLines)
      : props.outputLines;
  const hiddenOutputLineCount = props.outputLines.length - visibleOutputLines.length;

  return (
    <box backgroundColor={chatScreenTheme.surfaceOne} flexDirection="column" paddingX={1} width="100%">
      {visibleOutputLines.map((toolCallBashOutputLine, index) => (
        <box key={`shell-line-${index}`} width="100%">
          <text fg={shellLineColors[toolCallBashOutputLine.lineKind]}>
            {toolCallBashOutputLine.lineText}
          </text>
        </box>
      ))}
      {hiddenOutputLineCount > 0 ? (
        <box width="100%">
          <text fg={chatScreenTheme.textMuted}>{`… showing first ${visibleOutputLines.length} of ${props.outputLines.length} lines`}</text>
        </box>
      ) : null}
    </box>
  );
}
