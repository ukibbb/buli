import type { ReactNode } from "react";
import type { UnifiedDiffText } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { pathToFiletype } from "@opentui/core";
import { codeBlockSyntaxStyle, githubLikeTerminalCodeColors, terminalDiffColors } from "./codeRenderingTheme.ts";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";
import { VisibleContentLimitNotice } from "./VisibleContentLimit.tsx";

export type DiffBlockProps = {
  unifiedDiffText: UnifiedDiffText;
  density?: "normal" | "compact";
  filePath?: string;
};

const MAX_VISIBLE_DIFF_ROW_COUNT = 50;

function splitUnifiedDiffTextIntoRows(unifiedDiffText: UnifiedDiffText): string[] {
  return unifiedDiffText.replace(/\n$/, "").split("\n");
}

function countUnifiedDiffRenderableRows(unifiedDiffLines: readonly string[]): number {
  let isInsideHunk = false;
  let renderableRowCount = 0;

  for (const unifiedDiffLine of unifiedDiffLines) {
    if (unifiedDiffLine.startsWith("diff --git ")) {
      isInsideHunk = false;
      continue;
    }
    if (unifiedDiffLine.startsWith("@@")) {
      isInsideHunk = true;
      continue;
    }
    if (!isInsideHunk || unifiedDiffLine.startsWith("\\ No newline")) {
      continue;
    }
    renderableRowCount += 1;
  }

  return renderableRowCount;
}

function countUnifiedDiffRowsForFullHeight(unifiedDiffText: UnifiedDiffText): number {
  const unifiedDiffLines = splitUnifiedDiffTextIntoRows(unifiedDiffText);
  return countUnifiedDiffRenderableRows(unifiedDiffLines) || unifiedDiffLines.length;
}

export function resolveOpenTuiDiffFiletype(filePath: string | undefined): string {
  if (!filePath) {
    return "text";
  }

  return pathToFiletype(filePath) || "text";
}

export function DiffBlock(props: DiffBlockProps): ReactNode {
  const unifiedDiffRowCount = countUnifiedDiffRowsForFullHeight(props.unifiedDiffText);
  const visibleUnifiedDiffRowCount = Math.min(unifiedDiffRowCount, MAX_VISIBLE_DIFF_ROW_COUNT);
  const diffFiletype = resolveOpenTuiDiffFiletype(props.filePath);
  const isCompact = props.density === "compact";
  const lineNumberForegroundColor = terminalDiffColors.lineNumberForeground;
  const lineNumberBackgroundColor = isCompact
    ? githubLikeTerminalCodeColors.canvas
    : terminalDiffColors.lineNumberBackground;
  const addedLineNumberBackgroundColor = isCompact
    ? githubLikeTerminalCodeColors.canvas
    : terminalDiffColors.addedLineNumberBackground;
  const removedLineNumberBackgroundColor = isCompact
    ? githubLikeTerminalCodeColors.canvas
    : terminalDiffColors.removedLineNumberBackground;
  return (
    <box flexDirection="column" width="100%">
      <VisibleContentLimitNotice
        visibleItemCount={visibleUnifiedDiffRowCount}
        totalItemCount={unifiedDiffRowCount}
        itemLabelPlural="diff lines"
      />
      <diff
        addedBg={terminalDiffColors.addedBackground}
        addedContentBg={terminalDiffColors.addedContentBackground}
        addedLineNumberBg={addedLineNumberBackgroundColor}
        addedSignColor={terminalDiffColors.addedSignForeground}
        contextBg={terminalDiffColors.contextBackground}
        contextContentBg={terminalDiffColors.contextContentBackground}
        diff={props.unifiedDiffText}
        filetype={diffFiletype}
        fg={githubLikeTerminalCodeColors.foreground}
        height={visibleUnifiedDiffRowCount}
        lineNumberBg={lineNumberBackgroundColor}
        lineNumberFg={lineNumberForegroundColor}
        removedBg={terminalDiffColors.removedBackground}
        removedContentBg={terminalDiffColors.removedContentBackground}
        removedLineNumberBg={removedLineNumberBackgroundColor}
        removedSignColor={terminalDiffColors.removedSignForeground}
        selectionBg={chatScreenTheme.accentPrimary}
        selectionFg={chatScreenTheme.textPrimary}
        showLineNumbers={true}
        syntaxStyle={codeBlockSyntaxStyle}
        treeSitterClient={openTuiSharedTreeSitterClient}
        view="unified"
        width="100%"
        wrapMode="none"
      />
    </box>
  );
}
