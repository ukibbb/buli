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

export type VisibleUnifiedDiffContent = {
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

type VisibleUnifiedDiffHunkHeader =
  | {
    headerKind: "parseable";
    oldStartLine: number;
    newStartLine: number;
    sectionText: string;
  }
  | {
    headerKind: "raw";
    rawHeaderLine: string;
  };

type VisibleUnifiedDiffHunk = {
  hunkHeader: VisibleUnifiedDiffHunkHeader;
  bodyLines: string[];
  oldLineCount: number;
  newLineCount: number;
};

type UnifiedDiffBodyLineContribution = {
  isRenderableBodyLine: boolean;
  oldLineCount: number;
  newLineCount: number;
};

const UNIFIED_DIFF_HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function buildVisibleUnifiedDiffContent(unifiedDiffText: UnifiedDiffText): VisibleUnifiedDiffContent {
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
  let visibleRenderableBodyRowCount = 0;
  const visibleUnifiedDiffLines: string[] = [];
  let currentFileMetadataLines: string[] = [];
  let currentVisibleHunk: VisibleUnifiedDiffHunk | undefined;

  const flushCurrentVisibleHunk = (): void => {
    if (!currentVisibleHunk || currentVisibleHunk.bodyLines.length === 0) {
      currentVisibleHunk = undefined;
      return;
    }

    visibleUnifiedDiffLines.push(...currentFileMetadataLines);
    currentFileMetadataLines = [];
    visibleUnifiedDiffLines.push(formatVisibleUnifiedDiffHunkHeader(currentVisibleHunk));
    visibleUnifiedDiffLines.push(...currentVisibleHunk.bodyLines);
    currentVisibleHunk = undefined;
  };

  for (const unifiedDiffLine of unifiedDiffLines) {
    if (unifiedDiffLine.startsWith("diff --git ")) {
      flushCurrentVisibleHunk();
      if (visibleRenderableBodyRowCount >= maximumRenderableBodyRowCount) {
        break;
      }
      currentFileMetadataLines = [unifiedDiffLine];
      continue;
    }

    if (unifiedDiffLine.startsWith("@@")) {
      flushCurrentVisibleHunk();
      if (visibleRenderableBodyRowCount >= maximumRenderableBodyRowCount) {
        break;
      }
      currentVisibleHunk = {
        hunkHeader: parseVisibleUnifiedDiffHunkHeader(unifiedDiffLine),
        bodyLines: [],
        oldLineCount: 0,
        newLineCount: 0,
      };
      continue;
    }

    if (!currentVisibleHunk) {
      if (visibleRenderableBodyRowCount < maximumRenderableBodyRowCount) {
        currentFileMetadataLines.push(unifiedDiffLine);
      }
      continue;
    }

    const bodyLineContribution = classifyUnifiedDiffHunkBodyLine(unifiedDiffLine);
    if (!bodyLineContribution.isRenderableBodyLine) {
      if (currentVisibleHunk.bodyLines.length > 0) {
        currentVisibleHunk.bodyLines.push(unifiedDiffLine);
      }
      continue;
    }

    if (visibleRenderableBodyRowCount >= maximumRenderableBodyRowCount) {
      break;
    }

    currentVisibleHunk.bodyLines.push(unifiedDiffLine);
    currentVisibleHunk.oldLineCount += bodyLineContribution.oldLineCount;
    currentVisibleHunk.newLineCount += bodyLineContribution.newLineCount;
    visibleRenderableBodyRowCount += 1;
  }

  flushCurrentVisibleHunk();

  return visibleUnifiedDiffLines;
}

function parseVisibleUnifiedDiffHunkHeader(hunkHeaderLine: string): VisibleUnifiedDiffHunkHeader {
  const hunkHeaderMatch = UNIFIED_DIFF_HUNK_HEADER_PATTERN.exec(hunkHeaderLine);
  const oldStartLineText = hunkHeaderMatch?.[1];
  const newStartLineText = hunkHeaderMatch?.[3];
  if (!hunkHeaderMatch || oldStartLineText === undefined || newStartLineText === undefined) {
    return { headerKind: "raw", rawHeaderLine: hunkHeaderLine };
  }

  return {
    headerKind: "parseable",
    oldStartLine: Number.parseInt(oldStartLineText, 10),
    newStartLine: Number.parseInt(newStartLineText, 10),
    sectionText: hunkHeaderMatch[5] ?? "",
  };
}

function classifyUnifiedDiffHunkBodyLine(unifiedDiffLine: string): UnifiedDiffBodyLineContribution {
  if (unifiedDiffLine.startsWith("\\ No newline")) {
    return { isRenderableBodyLine: false, oldLineCount: 0, newLineCount: 0 };
  }
  if (unifiedDiffLine.startsWith("+")) {
    return { isRenderableBodyLine: true, oldLineCount: 0, newLineCount: 1 };
  }
  if (unifiedDiffLine.startsWith("-")) {
    return { isRenderableBodyLine: true, oldLineCount: 1, newLineCount: 0 };
  }

  return { isRenderableBodyLine: true, oldLineCount: 1, newLineCount: 1 };
}

function formatVisibleUnifiedDiffHunkHeader(visibleHunk: VisibleUnifiedDiffHunk): string {
  if (visibleHunk.hunkHeader.headerKind === "raw") {
    return visibleHunk.hunkHeader.rawHeaderLine;
  }

  return `@@ -${formatVisibleUnifiedDiffRange(visibleHunk.hunkHeader.oldStartLine, visibleHunk.oldLineCount)} +${formatVisibleUnifiedDiffRange(visibleHunk.hunkHeader.newStartLine, visibleHunk.newLineCount)} @@${visibleHunk.hunkHeader.sectionText}`;
}

function formatVisibleUnifiedDiffRange(startLine: number, lineCount: number): string {
  if (lineCount === 1) {
    return String(startLine);
  }

  return `${startLine},${lineCount}`;
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
