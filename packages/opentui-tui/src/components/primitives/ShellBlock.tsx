import type { ReactNode } from "react";
import type { ToolCallBashOutputLine, ToolCallBashOutputLineKind } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// ShellBlock visualises command transcripts. A "prompt" line is shown in
// accent colour so it reads as intent, stdout as primary text, and stderr in
// red so failures jump out of the stream.
export type ShellBlockProps = {
  outputLines: ToolCallBashOutputLine[];
};

const shellLineColors: Record<ToolCallBashOutputLineKind, string> = {
  prompt: chatScreenTheme.accentAmber,
  stdout: chatScreenTheme.textPrimary,
  stderr: chatScreenTheme.accentRed,
};

export function ShellBlock(props: ShellBlockProps): ReactNode {
  return (
    <box backgroundColor={chatScreenTheme.surfaceOne} flexDirection="column" paddingX={1} width="100%">
      {props.outputLines.map((toolCallBashOutputLine, index) => (
        <box key={`shell-line-${index}`} width="100%">
          <text fg={shellLineColors[toolCallBashOutputLine.lineKind]}>
            {toolCallBashOutputLine.lineText}
          </text>
        </box>
      ))}
    </box>
  );
}
