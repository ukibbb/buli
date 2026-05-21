import type { ReactNode } from "react";
import type { UnifiedDiffText } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { pathToFiletype } from "@opentui/core";
import { codeBlockSyntaxStyle, githubLikeTerminalCodeColors, terminalDiffColors } from "./codeRenderingTheme.ts";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";
import { VisibleContentLimitNotice } from "./VisibleContentLimit.tsx";

export type DiffBlockProps = {
  unifiedDiffText: UnifiedDiffText;
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
        addedLineNumberBg={terminalDiffColors.addedLineNumberBackground}
        addedSignColor={terminalDiffColors.addedSignForeground}
        contextBg={terminalDiffColors.contextBackground}
        contextContentBg={terminalDiffColors.contextContentBackground}
        diff={props.unifiedDiffText}
        filetype={diffFiletype}
        fg={githubLikeTerminalCodeColors.foreground}
        height={visibleUnifiedDiffRowCount}
        lineNumberBg={terminalDiffColors.lineNumberBackground}
        lineNumberFg={terminalDiffColors.lineNumberForeground}
        removedBg={terminalDiffColors.removedBackground}
        removedContentBg={terminalDiffColors.removedContentBackground}
        removedLineNumberBg={terminalDiffColors.removedLineNumberBackground}
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
