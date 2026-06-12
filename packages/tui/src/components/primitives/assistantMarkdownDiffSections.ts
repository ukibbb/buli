import type { AssistantUnifiedDiffFileSummary } from "./assistantMarkdownTypes.ts";

const unifiedDiffFileHeaderPattern = /^diff --git a\/(.+) b\/(.+)$/;
const quotedUnifiedDiffFileHeaderPattern = /^diff --git "a\/(.+)" "b\/(.+)"$/;
const unifiedDiffHunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const unifiedDiffMetadataLinePrefixes = [
  "index ",
  "old mode ",
  "new mode ",
  "deleted file mode ",
  "new file mode ",
  "similarity index ",
  "dissimilarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
  "--- ",
  "+++ ",
  "Binary files ",
  "GIT binary patch",
] as const;

export type AssistantMarkdownUnifiedDiffBlock = {
  unifiedDiffLines: string[];
  nextLineIndex: number;
};

export type AssistantMarkdownRawDiffSnippetBlock = {
  diffSnippetLines: string[];
  nextLineIndex: number;
};

type AssistantUnifiedDiffExpectedHunkLineCounts = {
  oldLineCount: number;
  newLineCount: number;
};

type AssistantUnifiedDiffActualHunkLineCounts = {
  oldLineCount: number;
  newLineCount: number;
};

export function readAssistantMarkdownUnifiedDiffBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownUnifiedDiffBlock | undefined {
  if (!parseAssistantUnifiedDiffFileHeader(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const unifiedDiffLines: string[] = [];
  let lineIndex = startLineIndex;
  let hasHunkHeader = false;
  while (lineIndex < markdownLines.length) {
    const markdownLine = markdownLines[lineIndex] ?? "";
    if (markdownLine.length === 0) {
      break;
    }
    if (parseAssistantUnifiedDiffFileHeader(markdownLine) || isUnifiedDiffMetadataLine(markdownLine)) {
      unifiedDiffLines.push(markdownLine);
      lineIndex += 1;
      continue;
    }
    if (unifiedDiffHunkHeaderPattern.test(markdownLine)) {
      unifiedDiffLines.push(markdownLine);
      hasHunkHeader = true;
      lineIndex += 1;
      continue;
    }
    if (hasHunkHeader && isUnifiedDiffHunkBodyLine(markdownLine)) {
      unifiedDiffLines.push(markdownLine);
      lineIndex += 1;
      continue;
    }
    break;
  }

  if (!hasHunkHeader || !hasValidAssistantUnifiedDiffHunkLineCounts(unifiedDiffLines)) {
    return undefined;
  }
  return { unifiedDiffLines, nextLineIndex: lineIndex };
}

export function readAssistantMarkdownRawDiffSnippetBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownRawDiffSnippetBlock | undefined {
  if (!parseAssistantUnifiedDiffFileHeader(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const diffSnippetLines: string[] = [];
  let lineIndex = startLineIndex;
  while (lineIndex < markdownLines.length) {
    const markdownLine = markdownLines[lineIndex] ?? "";
    if (markdownLine.length === 0) {
      break;
    }
    if (isRawDiffSnippetLine(markdownLine)) {
      diffSnippetLines.push(markdownLine);
      lineIndex += 1;
      continue;
    }
    break;
  }

  return diffSnippetLines.length > 0 ? { diffSnippetLines, nextLineIndex: lineIndex } : undefined;
}

export function formatAssistantUnifiedDiffText(unifiedDiffLines: readonly string[]): string {
  return `${unifiedDiffLines.join("\n").replace(/\n*$/, "")}\n`;
}

export function summarizeAssistantUnifiedDiffFiles(unifiedDiffText: string): AssistantUnifiedDiffFileSummary[] {
  const fileSummaries: AssistantUnifiedDiffFileSummary[] = [];
  let currentFileSummary: AssistantUnifiedDiffFileSummary | undefined;

  for (const unifiedDiffLine of unifiedDiffText.replace(/\n$/, "").split("\n")) {
    const fileHeader = parseAssistantUnifiedDiffFileHeader(unifiedDiffLine);
    if (fileHeader) {
      if (currentFileSummary) {
        fileSummaries.push(currentFileSummary);
      }
      currentFileSummary = {
        filePath: fileHeader.afterPath || fileHeader.beforePath,
        addedLineCount: 0,
        removedLineCount: 0,
      };
      continue;
    }

    if (!currentFileSummary) {
      continue;
    }
    if (unifiedDiffLine.startsWith("+") && !unifiedDiffLine.startsWith("+++")) {
      currentFileSummary.addedLineCount += 1;
      continue;
    }
    if (unifiedDiffLine.startsWith("-") && !unifiedDiffLine.startsWith("---")) {
      currentFileSummary.removedLineCount += 1;
    }
  }

  if (currentFileSummary) {
    fileSummaries.push(currentFileSummary);
  }
  return fileSummaries;
}

export function summarizeAssistantDiffSnippet(input: {
  diffSnippetText: string;
  filePath?: string | undefined;
}): string {
  const { diffSnippetText } = input;
  const fileSummaries = summarizeAssistantUnifiedDiffFiles(diffSnippetText);
  if (fileSummaries.length === 1) {
    const fileSummary = fileSummaries[0]!;
    return `patch ${fileSummary.filePath} +${fileSummary.addedLineCount} -${fileSummary.removedLineCount}`;
  }

  if (fileSummaries.length > 1) {
    const addedLineCount = fileSummaries.reduce((sum, fileSummary) => sum + fileSummary.addedLineCount, 0);
    const removedLineCount = fileSummaries.reduce((sum, fileSummary) => sum + fileSummary.removedLineCount, 0);
    return `patch ${fileSummaries.length} files +${addedLineCount} -${removedLineCount}`;
  }

  const snippetLineCounts = countAssistantDiffSnippetChangedLines(diffSnippetText);
  const changedLineSummary = snippetLineCounts.addedLineCount > 0 || snippetLineCounts.removedLineCount > 0
    ? ` +${snippetLineCounts.addedLineCount} -${snippetLineCounts.removedLineCount}`
    : "";
  if (input.filePath) {
    return `patch ${input.filePath}${changedLineSummary}`;
  }
  return `patch snippet${changedLineSummary}`;
}

export function listVisibleAssistantDiffSnippetLines(diffSnippetText: string): string[] {
  return diffSnippetText
    .replace(/\n$/, "")
    .split("\n")
    .filter(shouldRenderAssistantDiffSnippetBodyLine);
}

export function buildAssistantDiffSnippetUnifiedDiff(input: {
  diffSnippetText: string;
  filePath?: string | undefined;
}): { filePath: string; unifiedDiffText: string } | undefined {
  const filePath = input.filePath ?? resolveAssistantDiffSnippetFilePath(input.diffSnippetText);
  if (!filePath) {
    return undefined;
  }

  const diffSnippetBodyLines = listAssistantDiffSnippetPatchBodyLines(input.diffSnippetText);
  if (diffSnippetBodyLines.length === 0) {
    return undefined;
  }

  const { oldLineCount, newLineCount } = countAssistantDiffSnippetPatchBodyLineRanges(diffSnippetBodyLines);
  if (oldLineCount === 0 && newLineCount === 0) {
    return undefined;
  }

  const oldStartLineNumber = oldLineCount === 0 ? 0 : 1;
  const newStartLineNumber = newLineCount === 0 ? 0 : 1;
  return {
    filePath,
    unifiedDiffText: [
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      `@@ -${oldStartLineNumber},${oldLineCount} +${newStartLineNumber},${newLineCount} @@`,
      ...diffSnippetBodyLines,
      "",
    ].join("\n"),
  };
}

function isRawDiffSnippetLine(markdownLine: string): boolean {
  return (
    parseAssistantUnifiedDiffFileHeader(markdownLine) !== undefined ||
    isUnifiedDiffMetadataLine(markdownLine) ||
    markdownLine.startsWith("@@") ||
    isUnifiedDiffHunkBodyLine(markdownLine)
  );
}

function hasValidAssistantUnifiedDiffHunkLineCounts(unifiedDiffLines: readonly string[]): boolean {
  let expectedHunkLineCounts: AssistantUnifiedDiffExpectedHunkLineCounts | undefined;
  let actualHunkLineCounts: AssistantUnifiedDiffActualHunkLineCounts = { oldLineCount: 0, newLineCount: 0 };
  let hasHunkHeader = false;

  const finishCurrentHunk = () => {
    if (!expectedHunkLineCounts) {
      return true;
    }
    const isValidHunk =
      actualHunkLineCounts.oldLineCount === expectedHunkLineCounts.oldLineCount &&
      actualHunkLineCounts.newLineCount === expectedHunkLineCounts.newLineCount;
    expectedHunkLineCounts = undefined;
    actualHunkLineCounts = { oldLineCount: 0, newLineCount: 0 };
    return isValidHunk;
  };

  for (const unifiedDiffLine of unifiedDiffLines) {
    const hunkHeaderLineCounts = parseAssistantUnifiedDiffHunkHeaderLineCounts(unifiedDiffLine);
    if (hunkHeaderLineCounts) {
      if (!finishCurrentHunk()) {
        return false;
      }
      expectedHunkLineCounts = hunkHeaderLineCounts;
      hasHunkHeader = true;
      continue;
    }

    if (parseAssistantUnifiedDiffFileHeader(unifiedDiffLine)) {
      if (!finishCurrentHunk()) {
        return false;
      }
      continue;
    }

    if (!expectedHunkLineCounts || unifiedDiffLine.startsWith("\\")) {
      continue;
    }
    if (unifiedDiffLine.startsWith(" ")) {
      actualHunkLineCounts.oldLineCount += 1;
      actualHunkLineCounts.newLineCount += 1;
      continue;
    }
    if (unifiedDiffLine.startsWith("-") && !unifiedDiffLine.startsWith("---")) {
      actualHunkLineCounts.oldLineCount += 1;
      continue;
    }
    if (unifiedDiffLine.startsWith("+") && !unifiedDiffLine.startsWith("+++")) {
      actualHunkLineCounts.newLineCount += 1;
    }
  }

  return hasHunkHeader && finishCurrentHunk();
}

function parseAssistantUnifiedDiffHunkHeaderLineCounts(
  unifiedDiffLine: string,
): AssistantUnifiedDiffExpectedHunkLineCounts | undefined {
  const hunkHeaderMatch = unifiedDiffHunkHeaderPattern.exec(unifiedDiffLine);
  if (!hunkHeaderMatch) {
    return undefined;
  }
  return {
    oldLineCount: hunkHeaderMatch[2] === undefined ? 1 : Number(hunkHeaderMatch[2]),
    newLineCount: hunkHeaderMatch[4] === undefined ? 1 : Number(hunkHeaderMatch[4]),
  };
}

function parseAssistantUnifiedDiffFileHeader(markdownLine: string): { beforePath: string; afterPath: string } | undefined {
  const unquotedFileHeaderMatch = unifiedDiffFileHeaderPattern.exec(markdownLine);
  if (unquotedFileHeaderMatch) {
    return {
      beforePath: unquotedFileHeaderMatch[1] ?? "",
      afterPath: unquotedFileHeaderMatch[2] ?? "",
    };
  }

  const quotedFileHeaderMatch = quotedUnifiedDiffFileHeaderPattern.exec(markdownLine);
  if (!quotedFileHeaderMatch) {
    return undefined;
  }
  return {
    beforePath: quotedFileHeaderMatch[1] ?? "",
    afterPath: quotedFileHeaderMatch[2] ?? "",
  };
}

function isUnifiedDiffMetadataLine(markdownLine: string): boolean {
  return unifiedDiffMetadataLinePrefixes.some((metadataLinePrefix) => markdownLine.startsWith(metadataLinePrefix));
}

function isUnifiedDiffHunkBodyLine(markdownLine: string): boolean {
  return markdownLine.startsWith(" ") || markdownLine.startsWith("+") || markdownLine.startsWith("-") || markdownLine.startsWith("\\");
}

function countAssistantDiffSnippetChangedLines(diffSnippetText: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0;
  let removedLineCount = 0;
  for (const diffSnippetLine of diffSnippetText.replace(/\n$/, "").split("\n")) {
    if (diffSnippetLine.startsWith("+") && !diffSnippetLine.startsWith("+++")) {
      addedLineCount += 1;
      continue;
    }
    if (diffSnippetLine.startsWith("-") && !diffSnippetLine.startsWith("---")) {
      removedLineCount += 1;
    }
  }
  return { addedLineCount, removedLineCount };
}

function shouldRenderAssistantDiffSnippetBodyLine(diffSnippetLine: string): boolean {
  if (parseAssistantUnifiedDiffFileHeader(diffSnippetLine)) {
    return false;
  }
  if (isUnifiedDiffMetadataLine(diffSnippetLine)) {
    return false;
  }
  if (diffSnippetLine.trim() === "@@") {
    return false;
  }
  return true;
}

function resolveAssistantDiffSnippetFilePath(diffSnippetText: string): string | undefined {
  for (const diffSnippetLine of diffSnippetText.replace(/\n$/, "").split("\n")) {
    const fileHeader = parseAssistantUnifiedDiffFileHeader(diffSnippetLine);
    if (fileHeader) {
      return fileHeader.afterPath || fileHeader.beforePath;
    }
  }
  return undefined;
}

function listAssistantDiffSnippetPatchBodyLines(diffSnippetText: string): string[] {
  return diffSnippetText
    .replace(/\n$/, "")
    .split("\n")
    .filter((diffSnippetLine) => {
      if (parseAssistantUnifiedDiffFileHeader(diffSnippetLine)) {
        return false;
      }
      if (isUnifiedDiffMetadataLine(diffSnippetLine)) {
        return false;
      }
      if (diffSnippetLine.startsWith("@@")) {
        return false;
      }
      return isUnifiedDiffHunkBodyLine(diffSnippetLine);
    });
}

function countAssistantDiffSnippetPatchBodyLineRanges(diffSnippetBodyLines: readonly string[]): {
  oldLineCount: number;
  newLineCount: number;
} {
  let oldLineCount = 0;
  let newLineCount = 0;
  for (const diffSnippetBodyLine of diffSnippetBodyLines) {
    if (diffSnippetBodyLine.startsWith("+") && !diffSnippetBodyLine.startsWith("+++")) {
      newLineCount += 1;
      continue;
    }
    if (diffSnippetBodyLine.startsWith("-") && !diffSnippetBodyLine.startsWith("---")) {
      oldLineCount += 1;
      continue;
    }
    oldLineCount += 1;
    newLineCount += 1;
  }
  return { oldLineCount, newLineCount };
}
