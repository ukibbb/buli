export type FileMutationDiffRequest = {
  displayPath: string;
  beforeText: string | undefined;
  afterText: string;
};

export type FileMutationDiffResult = {
  unifiedDiffText: string;
  addedLineCount: number;
  removedLineCount: number;
  hasChanges: boolean;
};

export type UnifiedFileDiff = FileMutationDiffResult;

export interface FileMutationDiffEngine {
  createFileMutationDiff(input: FileMutationDiffRequest): FileMutationDiffResult;
}

type LineDiffOperation =
  | { operationKind: "equal"; lineText: string }
  | { operationKind: "add"; lineText: string }
  | { operationKind: "remove"; lineText: string };

type NumberedLineDiffOperation = LineDiffOperation & {
  operationIndex: number;
  oldLineNumberBeforeOperation: number;
  newLineNumberBeforeOperation: number;
  oldLineNumber: number | undefined;
  newLineNumber: number | undefined;
};

type UnifiedDiffHunkOperationWindow = {
  startOperationIndex: number;
  endOperationIndex: number;
};

type UnifiedDiffHunkLineRange = {
  startLine: number;
  lineCount: number;
};

const MAX_EXACT_LINE_DIFF_CELL_COUNT = 250_000;
const UNIFIED_DIFF_CONTEXT_LINE_COUNT = 3;

export class TypeScriptFileMutationDiffEngine implements FileMutationDiffEngine {
  createFileMutationDiff(input: FileMutationDiffRequest): FileMutationDiffResult {
    return createUnifiedFileDiffWithTypeScriptEngine(input);
  }
}

const defaultFileMutationDiffEngine = new TypeScriptFileMutationDiffEngine();

export function createUnifiedFileDiff(input: FileMutationDiffRequest): UnifiedFileDiff {
  return defaultFileMutationDiffEngine.createFileMutationDiff(input);
}

function createUnifiedFileDiffWithTypeScriptEngine(input: FileMutationDiffRequest): FileMutationDiffResult {
  const beforeLines = input.beforeText === undefined ? [] : splitTextIntoDiffLines(input.beforeText);
  const afterLines = splitTextIntoDiffLines(input.afterText);
  const lineDiffOperations = buildLineDiffOperations(beforeLines, afterLines);
  const addedLineCount = lineDiffOperations.filter((lineDiffOperation) => lineDiffOperation.operationKind === "add").length;
  const removedLineCount = lineDiffOperations.filter((lineDiffOperation) => lineDiffOperation.operationKind === "remove").length;
  const hasChanges = addedLineCount > 0 || removedLineCount > 0 || input.beforeText === undefined;

  return {
    unifiedDiffText: buildUnifiedDiffText({
      displayPath: input.displayPath,
      beforeFileExists: input.beforeText !== undefined,
      lineDiffOperations,
    }),
    addedLineCount,
    removedLineCount,
    hasChanges,
  };
}

function buildUnifiedDiffText(input: {
  displayPath: string;
  beforeFileExists: boolean;
  lineDiffOperations: readonly LineDiffOperation[];
}): string {
  const oldPath = input.beforeFileExists ? `a/${input.displayPath}` : "/dev/null";
  const newPath = `b/${input.displayPath}`;
  const numberedLineDiffOperations = numberLineDiffOperations(input.lineDiffOperations);
  const hunkOperationWindows = buildContextualUnifiedDiffHunkOperationWindows(numberedLineDiffOperations);
  const diffLines = [
    `diff --git a/${input.displayPath} b/${input.displayPath}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    ...hunkOperationWindows.flatMap((hunkOperationWindow) => {
      const hunkLineDiffOperations = numberedLineDiffOperations.slice(
        hunkOperationWindow.startOperationIndex,
        hunkOperationWindow.endOperationIndex,
      );

      return formatUnifiedDiffHunkLines(hunkLineDiffOperations);
    }),
  ];

  return `${diffLines.join("\n")}\n`;
}

function numberLineDiffOperations(lineDiffOperations: readonly LineDiffOperation[]): NumberedLineDiffOperation[] {
  let oldLineNumber = 1;
  let newLineNumber = 1;

  return lineDiffOperations.map((lineDiffOperation, operationIndex) => {
    const oldLineNumberBeforeOperation = oldLineNumber;
    const newLineNumberBeforeOperation = newLineNumber;
    const numberedLineDiffOperation: NumberedLineDiffOperation = {
      ...lineDiffOperation,
      operationIndex,
      oldLineNumberBeforeOperation,
      newLineNumberBeforeOperation,
      oldLineNumber: lineDiffOperation.operationKind === "add" ? undefined : oldLineNumber,
      newLineNumber: lineDiffOperation.operationKind === "remove" ? undefined : newLineNumber,
    };

    if (lineDiffOperation.operationKind !== "add") {
      oldLineNumber += 1;
    }
    if (lineDiffOperation.operationKind !== "remove") {
      newLineNumber += 1;
    }

    return numberedLineDiffOperation;
  });
}

function buildContextualUnifiedDiffHunkOperationWindows(
  lineDiffOperations: readonly NumberedLineDiffOperation[],
): UnifiedDiffHunkOperationWindow[] {
  const changedOperationWindows = lineDiffOperations
    .filter((lineDiffOperation) => lineDiffOperation.operationKind !== "equal")
    .map((lineDiffOperation) => ({
      startOperationIndex: Math.max(0, lineDiffOperation.operationIndex - UNIFIED_DIFF_CONTEXT_LINE_COUNT),
      endOperationIndex: Math.min(
        lineDiffOperations.length,
        lineDiffOperation.operationIndex + UNIFIED_DIFF_CONTEXT_LINE_COUNT + 1,
      ),
    }));

  const mergedOperationWindows: UnifiedDiffHunkOperationWindow[] = [];
  for (const changedOperationWindow of changedOperationWindows) {
    const previousMergedOperationWindow = mergedOperationWindows.at(-1);
    if (
      previousMergedOperationWindow
      && changedOperationWindow.startOperationIndex <= previousMergedOperationWindow.endOperationIndex
    ) {
      previousMergedOperationWindow.endOperationIndex = Math.max(
        previousMergedOperationWindow.endOperationIndex,
        changedOperationWindow.endOperationIndex,
      );
      continue;
    }

    mergedOperationWindows.push({ ...changedOperationWindow });
  }

  return mergedOperationWindows;
}

function formatUnifiedDiffHunkLines(hunkLineDiffOperations: readonly NumberedLineDiffOperation[]): string[] {
  if (hunkLineDiffOperations.length === 0) {
    return [];
  }

  const oldLineRange = buildUnifiedDiffHunkLineRange(hunkLineDiffOperations, "old");
  const newLineRange = buildUnifiedDiffHunkLineRange(hunkLineDiffOperations, "new");

  return [
    `@@ -${formatUnifiedDiffRange(oldLineRange.startLine, oldLineRange.lineCount)} +${formatUnifiedDiffRange(newLineRange.startLine, newLineRange.lineCount)} @@`,
    ...hunkLineDiffOperations.map(formatLineDiffOperation),
  ];
}

function buildUnifiedDiffHunkLineRange(
  hunkLineDiffOperations: readonly NumberedLineDiffOperation[],
  fileSide: "old" | "new",
): UnifiedDiffHunkLineRange {
  const firstLineDiffOperation = hunkLineDiffOperations[0];
  if (!firstLineDiffOperation) {
    throw new Error("Cannot build a unified diff hunk range without hunk operations.");
  }

  const consumedLineNumbers = hunkLineDiffOperations.flatMap((lineDiffOperation) => {
    const consumedLineNumber = fileSide === "old" ? lineDiffOperation.oldLineNumber : lineDiffOperation.newLineNumber;
    return consumedLineNumber === undefined ? [] : [consumedLineNumber];
  });

  if (consumedLineNumbers.length > 0) {
    const firstConsumedLineNumber = consumedLineNumbers[0];
    if (firstConsumedLineNumber === undefined) {
      throw new Error("Expected a unified diff hunk range to have a first consumed line number.");
    }

    return {
      startLine: firstConsumedLineNumber,
      lineCount: consumedLineNumbers.length,
    };
  }

  const lineNumberBeforePureChange = fileSide === "old"
    ? firstLineDiffOperation.oldLineNumberBeforeOperation
    : firstLineDiffOperation.newLineNumberBeforeOperation;

  return {
    startLine: Math.max(0, lineNumberBeforePureChange - 1),
    lineCount: 0,
  };
}

function formatUnifiedDiffRange(startLine: number, lineCount: number): string {
  if (lineCount === 1) {
    return String(startLine);
  }

  return `${startLine},${lineCount}`;
}

function formatLineDiffOperation(lineDiffOperation: LineDiffOperation): string {
  if (lineDiffOperation.operationKind === "add") {
    return `+${lineDiffOperation.lineText}`;
  }
  if (lineDiffOperation.operationKind === "remove") {
    return `-${lineDiffOperation.lineText}`;
  }

  return ` ${lineDiffOperation.lineText}`;
}

function buildLineDiffOperations(
  beforeLines: readonly string[],
  afterLines: readonly string[],
): LineDiffOperation[] {
  if (beforeLines.length * afterLines.length > MAX_EXACT_LINE_DIFF_CELL_COUNT) {
    return [
      ...beforeLines.map((lineText) => ({ operationKind: "remove" as const, lineText })),
      ...afterLines.map((lineText) => ({ operationKind: "add" as const, lineText })),
    ];
  }

  const lcsLengths = buildLongestCommonSubsequenceLengths(beforeLines, afterLines);
  const lineDiffOperations: LineDiffOperation[] = [];
  let beforeLineIndex = 0;
  let afterLineIndex = 0;

  while (beforeLineIndex < beforeLines.length || afterLineIndex < afterLines.length) {
    const beforeLine = beforeLines[beforeLineIndex];
    const afterLine = afterLines[afterLineIndex];
    if (beforeLine !== undefined && afterLine !== undefined && beforeLine === afterLine) {
      lineDiffOperations.push({ operationKind: "equal", lineText: beforeLine });
      beforeLineIndex += 1;
      afterLineIndex += 1;
      continue;
    }

    const nextBeforeLcsLength = lcsLengths[beforeLineIndex + 1]?.[afterLineIndex] ?? 0;
    const nextAfterLcsLength = lcsLengths[beforeLineIndex]?.[afterLineIndex + 1] ?? 0;
    if (afterLine !== undefined && (beforeLine === undefined || nextAfterLcsLength >= nextBeforeLcsLength)) {
      lineDiffOperations.push({ operationKind: "add", lineText: afterLine });
      afterLineIndex += 1;
      continue;
    }

    if (beforeLine !== undefined) {
      lineDiffOperations.push({ operationKind: "remove", lineText: beforeLine });
      beforeLineIndex += 1;
    }
  }

  return lineDiffOperations;
}

function buildLongestCommonSubsequenceLengths(
  beforeLines: readonly string[],
  afterLines: readonly string[],
): number[][] {
  const lcsLengths = Array.from(
    { length: beforeLines.length + 1 },
    () => Array.from({ length: afterLines.length + 1 }, () => 0),
  );

  for (let beforeLineIndex = beforeLines.length - 1; beforeLineIndex >= 0; beforeLineIndex -= 1) {
    for (let afterLineIndex = afterLines.length - 1; afterLineIndex >= 0; afterLineIndex -= 1) {
      lcsLengths[beforeLineIndex]![afterLineIndex] = beforeLines[beforeLineIndex] === afterLines[afterLineIndex]
        ? (lcsLengths[beforeLineIndex + 1]?.[afterLineIndex + 1] ?? 0) + 1
        : Math.max(
          lcsLengths[beforeLineIndex + 1]?.[afterLineIndex] ?? 0,
          lcsLengths[beforeLineIndex]?.[afterLineIndex + 1] ?? 0,
        );
    }
  }

  return lcsLengths;
}

function splitTextIntoDiffLines(fileText: string): string[] {
  const lines = fileText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}
