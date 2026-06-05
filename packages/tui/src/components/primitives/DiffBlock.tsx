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

type VisibleUnifiedDiffContent = {
  totalRenderableRowCount: number;
  visibleRenderableRowCount: number;
  visibleUnifiedDiffText: UnifiedDiffText;
};

function countUnifiedDiffRenderableBodyRows(unifiedDiffLines: readonly string[]): number {
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

function countUnifiedDiffRowsForLimitNotice(unifiedDiffLines: readonly string[]): number {
  return countUnifiedDiffRenderableBodyRows(unifiedDiffLines) || unifiedDiffLines.length;
}

function buildVisibleUnifiedDiffContent(unifiedDiffText: UnifiedDiffText): VisibleUnifiedDiffContent {
  const unifiedDiffLines = splitUnifiedDiffTextIntoRows(unifiedDiffText);
  const totalRenderableRowCount = countUnifiedDiffRowsForLimitNotice(unifiedDiffLines);
  const visibleRenderableRowCount = Math.min(totalRenderableRowCount, MAX_VISIBLE_DIFF_ROW_COUNT);

  if (totalRenderableRowCount <= MAX_VISIBLE_DIFF_ROW_COUNT) {
    return {
      totalRenderableRowCount,
      visibleRenderableRowCount,
      visibleUnifiedDiffText: unifiedDiffText,
    };
  }

  const renderableBodyRowCount = countUnifiedDiffRenderableBodyRows(unifiedDiffLines);
  const visibleUnifiedDiffLines = renderableBodyRowCount === 0
    ? unifiedDiffLines.slice(0, MAX_VISIBLE_DIFF_ROW_COUNT)
    : collectVisibleUnifiedDiffLines(unifiedDiffLines, MAX_VISIBLE_DIFF_ROW_COUNT);

  return {
    totalRenderableRowCount,
    visibleRenderableRowCount,
    visibleUnifiedDiffText: visibleUnifiedDiffLines.join("\n"),
  };
}

function collectVisibleUnifiedDiffLines(
  unifiedDiffLines: readonly string[],
  maximumRenderableBodyRowCount: number,
): string[] {
  let isInsideHunk = false;
  let visibleRenderableBodyRowCount = 0;
  const visibleUnifiedDiffLines: string[] = [];

  for (const unifiedDiffLine of unifiedDiffLines) {
    if (unifiedDiffLine.startsWith("diff --git ")) {
      if (visibleRenderableBodyRowCount >= maximumRenderableBodyRowCount) {
        break;
      }
      isInsideHunk = false;
      visibleUnifiedDiffLines.push(unifiedDiffLine);
      continue;
    }

    if (unifiedDiffLine.startsWith("@@")) {
      if (visibleRenderableBodyRowCount >= maximumRenderableBodyRowCount) {
        break;
      }
      isInsideHunk = true;
      visibleUnifiedDiffLines.push(unifiedDiffLine);
      continue;
    }

    const isRenderableBodyLine = isInsideHunk && !unifiedDiffLine.startsWith("\\ No newline");
    if (!isRenderableBodyLine) {
      if (visibleRenderableBodyRowCount < maximumRenderableBodyRowCount) {
        visibleUnifiedDiffLines.push(unifiedDiffLine);
      }
      continue;
    }

    if (visibleRenderableBodyRowCount >= maximumRenderableBodyRowCount) {
      break;
    }

    visibleUnifiedDiffLines.push(unifiedDiffLine);
    visibleRenderableBodyRowCount += 1;
  }

  return visibleUnifiedDiffLines;
}

export function resolveOpenTuiDiffFiletype(filePath: string | undefined): string {
  if (!filePath) {
    return "text";
  }

  return pathToFiletype(filePath) || "text";
}

export function DiffBlock(props: DiffBlockProps): ReactNode {
  const visibleUnifiedDiffContent = buildVisibleUnifiedDiffContent(props.unifiedDiffText);
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
        visibleItemCount={visibleUnifiedDiffContent.visibleRenderableRowCount}
        totalItemCount={visibleUnifiedDiffContent.totalRenderableRowCount}
        itemLabelPlural="diff lines"
      />
      <diff
        addedBg={terminalDiffColors.addedBackground}
        addedContentBg={terminalDiffColors.addedContentBackground}
        addedLineNumberBg={addedLineNumberBackgroundColor}
        addedSignColor={terminalDiffColors.addedSignForeground}
        contextBg={terminalDiffColors.contextBackground}
        contextContentBg={terminalDiffColors.contextContentBackground}
        diff={visibleUnifiedDiffContent.visibleUnifiedDiffText}
        filetype={diffFiletype}
        fg={githubLikeTerminalCodeColors.foreground}
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
        wrapMode="char"
      />
    </box>
  );
}
