import type { ToolCallReadDetail } from "@buli/contracts";
import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";

const MINIMUM_PARTIAL_OVERLAP_RATIO_FOR_ADVISORY = 0.5;
const MINIMUM_PARTIAL_OVERLAP_LINE_COUNT_FOR_ADVISORY = 5;
const MAXIMUM_PREVIOUS_READ_RANGES_IN_ADVISORY = 6;

export type ReadLineRange = Readonly<{
  startLineNumber: number;
  endLineNumber: number;
}>;

type MutableReadLineRange = {
  startLineNumber: number;
  endLineNumber: number;
};

export type ReturnedReadFileLineRange = ReadLineRange & Readonly<{
  readFilePath: string;
  returnedLineCount: number;
}>;

export type SameTurnReadCoverageRange = ReturnedReadFileLineRange & Readonly<{
  toolCallId: string;
}>;

export type SameTurnReadOverlapAdvisory = Readonly<{
  advisoryText: string;
  currentToolCallId: string;
  currentReadLineRange: ReturnedReadFileLineRange;
  previousReadLineRanges: readonly SameTurnReadCoverageRange[];
  missingLineRanges: readonly ReadLineRange[];
  overlappedLineCount: number;
  returnedLineCount: number;
  overlapRatio: number;
}>;

export class SameTurnReadCoverageTracker {
  private readonly readCoverageRangesByFilePath = new Map<string, SameTurnReadCoverageRange[]>();

  createReadOverlapAdvisory(input: {
    toolCallId: string;
    toolCallDetail: ToolCallReadDetail;
  }): SameTurnReadOverlapAdvisory | undefined {
    const currentReadLineRange = deriveReturnedReadFileLineRange(input.toolCallDetail);
    if (!currentReadLineRange) {
      return undefined;
    }

    const previousReadLineRanges = this.readCoverageRangesByFilePath.get(currentReadLineRange.readFilePath) ?? [];
    const overlappingPreviousReadLineRanges = previousReadLineRanges.filter((previousReadLineRange) =>
      doLineRangesOverlap(currentReadLineRange, previousReadLineRange)
    );
    if (overlappingPreviousReadLineRanges.length === 0) {
      return undefined;
    }

    const alreadyVisibleLineRanges = mergeLineRanges(
      overlappingPreviousReadLineRanges.map((previousReadLineRange) => intersectLineRanges(currentReadLineRange, previousReadLineRange))
        .filter((lineRange): lineRange is ReadLineRange => lineRange !== undefined),
    );
    const overlappedLineCount = countLinesInRanges(alreadyVisibleLineRanges);
    const returnedLineCount = countLinesInRange(currentReadLineRange);
    const overlapRatio = overlappedLineCount / returnedLineCount;
    const missingLineRanges = subtractLineRanges(currentReadLineRange, alreadyVisibleLineRanges);

    const isFullyCovered = missingLineRanges.length === 0;
    const isSignificantPartialOverlap = overlapRatio >= MINIMUM_PARTIAL_OVERLAP_RATIO_FOR_ADVISORY &&
      overlappedLineCount >= MINIMUM_PARTIAL_OVERLAP_LINE_COUNT_FOR_ADVISORY;
    if (!isFullyCovered && !isSignificantPartialOverlap) {
      return undefined;
    }

    return {
      advisoryText: formatSameTurnReadOverlapAdvisoryText({
        currentToolCallId: input.toolCallId,
        currentReadLineRange,
        previousReadLineRanges: overlappingPreviousReadLineRanges,
        missingLineRanges,
        overlappedLineCount,
        returnedLineCount,
        overlapRatio,
      }),
      currentToolCallId: input.toolCallId,
      currentReadLineRange,
      previousReadLineRanges: overlappingPreviousReadLineRanges,
      missingLineRanges,
      overlappedLineCount,
      returnedLineCount,
      overlapRatio,
    };
  }

  recordProviderVisibleReadCoverage(input: {
    toolCallId: string;
    toolCallDetail: ToolCallReadDetail;
  }): void {
    const returnedReadFileLineRange = deriveReturnedReadFileLineRange(input.toolCallDetail);
    if (!returnedReadFileLineRange) {
      return;
    }

    const existingReadCoverageRanges = this.readCoverageRangesByFilePath.get(returnedReadFileLineRange.readFilePath) ?? [];
    existingReadCoverageRanges.push({
      ...returnedReadFileLineRange,
      toolCallId: input.toolCallId,
    });
    this.readCoverageRangesByFilePath.set(returnedReadFileLineRange.readFilePath, existingReadCoverageRanges);
  }

  clear(): void {
    this.readCoverageRangesByFilePath.clear();
  }
}

export function deriveReturnedReadFileLineRange(toolCallDetail: ToolCallReadDetail): ReturnedReadFileLineRange | undefined {
  if (toolCallDetail.readByteCount === undefined) {
    return undefined;
  }

  const returnedLineCount = toolCallDetail.returnedLineCount;
  if (returnedLineCount === undefined || returnedLineCount <= 0) {
    return undefined;
  }

  const firstPreviewLine = toolCallDetail.previewLines?.[0];
  if (!firstPreviewLine) {
    return undefined;
  }

  return {
    readFilePath: toolCallDetail.readFilePath,
    startLineNumber: firstPreviewLine.lineNumber,
    endLineNumber: firstPreviewLine.lineNumber + returnedLineCount - 1,
    returnedLineCount,
  };
}

function formatSameTurnReadOverlapAdvisoryText(input: {
  currentToolCallId: string;
  currentReadLineRange: ReturnedReadFileLineRange;
  previousReadLineRanges: readonly SameTurnReadCoverageRange[];
  missingLineRanges: readonly ReadLineRange[];
  overlappedLineCount: number;
  returnedLineCount: number;
  overlapRatio: number;
}): string {
  const previousRangesIncludedInAdvisory = input.previousReadLineRanges.slice(0, MAXIMUM_PREVIOUS_READ_RANGES_IN_ADVISORY);
  const omittedPreviousRangeCount = input.previousReadLineRanges.length - previousRangesIncludedInAdvisory.length;

  return [
    `<same_turn_read_overlap_advisory read_file_path="${escapeModelFacingXmlAttributeValue(input.currentReadLineRange.readFilePath)}">`,
    "<status>overlaps_same_turn_read_coverage</status>",
    `<current_tool_call_id>${escapeModelFacingXmlText(input.currentToolCallId)}</current_tool_call_id>`,
    `<current_returned_line_range>${formatLineRange(input.currentReadLineRange)}</current_returned_line_range>`,
    `<overlap_line_count>${input.overlappedLineCount}</overlap_line_count>`,
    `<returned_line_count>${input.returnedLineCount}</returned_line_count>`,
    `<overlap_ratio_percent>${Math.round(input.overlapRatio * 100)}</overlap_ratio_percent>`,
    "<already_visible_ranges>",
    ...previousRangesIncludedInAdvisory.map((previousReadLineRange) =>
      `- lines ${formatLineRange(previousReadLineRange)} from tool_call_id ${escapeModelFacingXmlText(previousReadLineRange.toolCallId)}`
    ),
    ...(omittedPreviousRangeCount > 0 ? [`- ${omittedPreviousRangeCount} additional overlapping prior read range(s) omitted from this advisory.`] : []),
    "</already_visible_ranges>",
    "<missing_line_ranges>",
    ...(input.missingLineRanges.length === 0
      ? ["- none; this returned range was already fully visible in this same assistant/subagent turn"]
      : input.missingLineRanges.map((missingLineRange) => `- lines ${formatLineRange(missingLineRange)}`)),
    "</missing_line_ranges>",
    "<guidance>The read output above remains valid evidence. Reuse already-visible covered lines; if more evidence is needed, request only the missing line ranges or genuinely different evidence.</guidance>",
    "</same_turn_read_overlap_advisory>",
  ].join("\n");
}

function doLineRangesOverlap(leftLineRange: ReadLineRange, rightLineRange: ReadLineRange): boolean {
  return leftLineRange.startLineNumber <= rightLineRange.endLineNumber &&
    rightLineRange.startLineNumber <= leftLineRange.endLineNumber;
}

function intersectLineRanges(leftLineRange: ReadLineRange, rightLineRange: ReadLineRange): ReadLineRange | undefined {
  const startLineNumber = Math.max(leftLineRange.startLineNumber, rightLineRange.startLineNumber);
  const endLineNumber = Math.min(leftLineRange.endLineNumber, rightLineRange.endLineNumber);
  if (startLineNumber > endLineNumber) {
    return undefined;
  }

  return { startLineNumber, endLineNumber };
}

function mergeLineRanges(lineRanges: readonly ReadLineRange[]): ReadLineRange[] {
  const sortedLineRanges = [...lineRanges].sort((leftLineRange, rightLineRange) =>
    leftLineRange.startLineNumber - rightLineRange.startLineNumber || leftLineRange.endLineNumber - rightLineRange.endLineNumber
  );
  const mergedLineRanges: MutableReadLineRange[] = [];

  for (const lineRange of sortedLineRanges) {
    const previousMergedLineRange = mergedLineRanges.at(-1);
    if (!previousMergedLineRange || lineRange.startLineNumber > previousMergedLineRange.endLineNumber + 1) {
      mergedLineRanges.push({ ...lineRange });
      continue;
    }

    previousMergedLineRange.endLineNumber = Math.max(previousMergedLineRange.endLineNumber, lineRange.endLineNumber);
  }

  return mergedLineRanges;
}

function subtractLineRanges(sourceLineRange: ReadLineRange, coveredLineRanges: readonly ReadLineRange[]): ReadLineRange[] {
  const missingLineRanges: ReadLineRange[] = [];
  let nextMissingStartLineNumber = sourceLineRange.startLineNumber;

  for (const coveredLineRange of mergeLineRanges(coveredLineRanges)) {
    if (coveredLineRange.endLineNumber < nextMissingStartLineNumber) {
      continue;
    }

    if (coveredLineRange.startLineNumber > sourceLineRange.endLineNumber) {
      break;
    }

    if (coveredLineRange.startLineNumber > nextMissingStartLineNumber) {
      missingLineRanges.push({
        startLineNumber: nextMissingStartLineNumber,
        endLineNumber: Math.min(coveredLineRange.startLineNumber - 1, sourceLineRange.endLineNumber),
      });
    }

    nextMissingStartLineNumber = Math.max(nextMissingStartLineNumber, coveredLineRange.endLineNumber + 1);
  }

  if (nextMissingStartLineNumber <= sourceLineRange.endLineNumber) {
    missingLineRanges.push({
      startLineNumber: nextMissingStartLineNumber,
      endLineNumber: sourceLineRange.endLineNumber,
    });
  }

  return missingLineRanges;
}

function countLinesInRanges(lineRanges: readonly ReadLineRange[]): number {
  return lineRanges.reduce((totalLineCount, lineRange) => totalLineCount + countLinesInRange(lineRange), 0);
}

function countLinesInRange(lineRange: ReadLineRange): number {
  return lineRange.endLineNumber - lineRange.startLineNumber + 1;
}

function formatLineRange(lineRange: ReadLineRange): string {
  return lineRange.startLineNumber === lineRange.endLineNumber
    ? String(lineRange.startLineNumber)
    : `${lineRange.startLineNumber}-${lineRange.endLineNumber}`;
}
