import type { ReactNode } from "react";
import type { ToolCallBashOutputLine, ToolCallBashOutputLineKind } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { githubLikeTerminalCodeColors } from "./codeRenderingTheme.ts";
import { limitVisibleItems, VisibleContentLimitNotice } from "./VisibleContentLimit.tsx";

// ShellBlock visualises command transcripts. A "prompt" line is shown in
// accent colour so it reads as intent, stdout as primary text, and stderr in
// red so failures jump out of the stream.
export type ShellBlockProps = {
  outputLines: ToolCallBashOutputLine[];
};

const MAX_VISIBLE_SHELL_OUTPUT_LINE_COUNT = 50;

const shellLineColors: Record<ToolCallBashOutputLineKind, string> = {
  prompt: chatScreenTheme.accentAmber,
  stdout: githubLikeTerminalCodeColors.foreground,
  stderr: githubLikeTerminalCodeColors.diffRemoval,
};

export function ShellBlock(props: ShellBlockProps): ReactNode {
  const limitedOutputLines = limitVisibleItems({
    items: props.outputLines,
    maximumVisibleItemCount: MAX_VISIBLE_SHELL_OUTPUT_LINE_COUNT,
  });

  return (
    <box backgroundColor={githubLikeTerminalCodeColors.canvas} flexDirection="column" paddingX={1} width="100%">
      <VisibleContentLimitNotice
        visibleItemCount={limitedOutputLines.visibleItems.length}
        totalItemCount={limitedOutputLines.totalItemCount}
        itemLabelPlural="lines"
      />
      {limitedOutputLines.visibleItems.map((toolCallBashOutputLine, index) => (
        <box key={`shell-line-${index}`} width="100%">
          <text fg={shellLineColors[toolCallBashOutputLine.lineKind]}>
            {toolCallBashOutputLine.lineText}
          </text>
        </box>
      ))}
    </box>
  );
}
