import { readFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReadToolCallRequest, ToolCallReadDetail, ToolCallReadPreviewLine } from "@buli/contracts";
import {
  buildProjectInstructionUpdateText,
  type ProjectInstructionTracker,
} from "../projectInstructions.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";

const DEFAULT_READ_LIMIT = 2_000;
const MAX_READ_LIMIT = 2_000;
const MAX_PREVIEW_LINE_COUNT = 80;
const MAX_LINE_LENGTH = 2_000;
const BINARY_SAMPLE_BYTE_COUNT = 4_096;

type ReadVisibleLine = {
  lineText: string;
  wasLineTruncated?: boolean;
};

export function createStartedReadToolCallDetail(readToolCallRequest: ReadToolCallRequest): ToolCallReadDetail {
  return {
    toolName: "read",
    readFilePath: readToolCallRequest.readTargetPath,
  };
}

export async function runReadToolCall(input: {
  readToolCallRequest: ReadToolCallRequest;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedReadToolCallDetail(input.readToolCallRequest);

  try {
    throwIfReadToolAborted(input.abortSignal);
    const resolvedReadPath = await resolveExistingWorkspacePath({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: input.readToolCallRequest.readTargetPath,
    });
    const offsetLineNumber = input.readToolCallRequest.offsetLineNumber ?? 1;
    const maximumLineCount = Math.min(input.readToolCallRequest.maximumLineCount ?? DEFAULT_READ_LIMIT, MAX_READ_LIMIT);

    if (resolvedReadPath.stats.isDirectory()) {
      const directoryEntries = await readdir(resolvedReadPath.absolutePath, { withFileTypes: true });
      throwIfReadToolAborted(input.abortSignal);
      const sortedEntryNames = directoryEntries
        .filter((directoryEntry) => !directoryEntry.isSymbolicLink())
        .sort((leftDirectoryEntry, rightDirectoryEntry) => {
          if (leftDirectoryEntry.isDirectory() !== rightDirectoryEntry.isDirectory()) {
            return leftDirectoryEntry.isDirectory() ? -1 : 1;
          }

          return leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name);
        })
        .map((directoryEntry) => `${directoryEntry.name}${directoryEntry.isDirectory() ? "/" : ""}`);
      const visibleEntryNames = sortedEntryNames.slice(offsetLineNumber - 1, offsetLineNumber - 1 + maximumLineCount);
      const previewLines = buildReadPreviewLines(
        visibleEntryNames.map((visibleEntryName) => ({ lineText: visibleEntryName })),
      );
      const wasLineCountTruncated = offsetLineNumber + visibleEntryNames.length - 1 < sortedEntryNames.length;
      const toolCallDetail: ToolCallReadDetail = {
        toolName: "read",
        readFilePath: resolvedReadPath.displayPath,
        readLineCount: sortedEntryNames.length,
        returnedLineCount: visibleEntryNames.length,
        previewLines,
        wasLineCountTruncated,
      };

      const projectInstructionUpdateText = await discoverProjectInstructionUpdateText({
        projectInstructionTracker: input.projectInstructionTracker,
        targetDirectoryPath: resolvedReadPath.absolutePath,
        excludedAbsolutePath: resolvedReadPath.absolutePath,
        abortSignal: input.abortSignal,
      });

      return {
        outcomeKind: "completed",
        toolCallDetail,
        toolResultText: appendProjectInstructionUpdateText(
          buildDirectoryReadToolResultText({
            displayPath: resolvedReadPath.displayPath,
            entryNames: sortedEntryNames,
            visibleEntryNames,
            offsetLineNumber,
            wasLineCountTruncated,
          }),
          projectInstructionUpdateText,
        ),
        durationMilliseconds: Date.now() - startedAtMilliseconds,
      };
    }

    if (!resolvedReadPath.stats.isFile()) {
      throw new Error(`Path is not a file or directory: ${resolvedReadPath.displayPath}`);
    }

    const fileBytes = await readFile(resolvedReadPath.absolutePath);
    throwIfReadToolAborted(input.abortSignal);
    if (isBinaryFileSample(fileBytes.subarray(0, BINARY_SAMPLE_BYTE_COUNT))) {
      throw new Error(`Cannot read binary file: ${resolvedReadPath.displayPath}`);
    }

    const fileLines = splitFileTextIntoLines(fileBytes.toString("utf8"));
    if (offsetLineNumber > fileLines.length && !(fileLines.length === 0 && offsetLineNumber === 1)) {
      throw new Error(`Offset ${offsetLineNumber} is out of range for this file (${fileLines.length} lines)`);
    }

    const visibleFileLines = fileLines
      .slice(offsetLineNumber - 1, offsetLineNumber - 1 + maximumLineCount)
      .map(truncateLongLine);
    const wasLongLineTruncated = visibleFileLines.some((visibleFileLine) => visibleFileLine.wasLineTruncated === true);
    const visibleFileLineTexts = visibleFileLines.map((visibleFileLine) => visibleFileLine.lineText);
    const previewLines = buildReadPreviewLines(visibleFileLines, offsetLineNumber);
    const wasLineCountTruncated = offsetLineNumber + visibleFileLines.length - 1 < fileLines.length;
    const toolCallDetail: ToolCallReadDetail = {
      toolName: "read",
      readFilePath: resolvedReadPath.displayPath,
      readLineCount: fileLines.length,
      returnedLineCount: visibleFileLines.length,
      readByteCount: fileBytes.byteLength,
      previewLines,
      wasLineCountTruncated,
      wasLongLineTruncated,
    };

    const projectInstructionUpdateText = await discoverProjectInstructionUpdateText({
      projectInstructionTracker: input.projectInstructionTracker,
      targetDirectoryPath: dirname(resolvedReadPath.absolutePath),
      excludedAbsolutePath: resolvedReadPath.absolutePath,
      abortSignal: input.abortSignal,
    });

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: appendProjectInstructionUpdateText(
        buildFileReadToolResultText({
          displayPath: resolvedReadPath.displayPath,
          fileLines,
          visibleFileLines: visibleFileLineTexts,
          offsetLineNumber,
          wasLineCountTruncated,
          wasLongLineTruncated,
        }),
        projectInstructionUpdateText,
      ),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      failureExplanation,
      toolResultText: `Read failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

async function discoverProjectInstructionUpdateText(input: {
  projectInstructionTracker: ProjectInstructionTracker | undefined;
  targetDirectoryPath: string;
  excludedAbsolutePath: string;
  abortSignal: AbortSignal | undefined;
}): Promise<string | undefined> {
  if (!input.projectInstructionTracker) {
    return undefined;
  }

  return buildProjectInstructionUpdateText(
    await input.projectInstructionTracker.discoverNewProjectInstructionsForDirectory({
      targetDirectoryPath: input.targetDirectoryPath,
      excludedAbsolutePath: input.excludedAbsolutePath,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    }),
  );
}

function appendProjectInstructionUpdateText(toolResultText: string, projectInstructionUpdateText: string | undefined): string {
  return projectInstructionUpdateText ? `${toolResultText}\n\n${projectInstructionUpdateText}` : toolResultText;
}

function buildDirectoryReadToolResultText(input: {
  displayPath: string;
  entryNames: readonly string[];
  visibleEntryNames: readonly string[];
  offsetLineNumber: number;
  wasLineCountTruncated: boolean;
}): string {
  const lastVisibleEntryNumber = input.offsetLineNumber + input.visibleEntryNames.length - 1;
  const visibleEntryText = input.visibleEntryNames.length > 0 ? input.visibleEntryNames.join("\n") : "<empty>";
  const statusLine = input.wasLineCountTruncated
    ? `(Showing entries ${input.offsetLineNumber}-${lastVisibleEntryNumber} of ${input.entryNames.length}. Use offset=${lastVisibleEntryNumber + 1} to continue.)`
    : `(${input.entryNames.length} entries)`;

  return [
    `<path>${input.displayPath}</path>`,
    "<type>directory</type>",
    "<entries>",
    visibleEntryText,
    statusLine,
    "</entries>",
  ].join("\n");
}

function buildFileReadToolResultText(input: {
  displayPath: string;
  fileLines: readonly string[];
  visibleFileLines: readonly string[];
  offsetLineNumber: number;
  wasLineCountTruncated: boolean;
  wasLongLineTruncated: boolean;
}): string {
  const lastVisibleLineNumber = input.offsetLineNumber + input.visibleFileLines.length - 1;
  const lineText = input.visibleFileLines
    .map((visibleFileLine, visibleFileLineIndex) => `${input.offsetLineNumber + visibleFileLineIndex}: ${visibleFileLine}`)
    .join("\n");
  const statusLine = input.wasLineCountTruncated
    ? `(Showing lines ${input.offsetLineNumber}-${lastVisibleLineNumber} of ${input.fileLines.length}. Use offset=${lastVisibleLineNumber + 1} to continue.)`
    : `(End of file - total ${input.fileLines.length} lines)`;
  const truncationLines = input.wasLongLineTruncated
    ? [`(Long lines were truncated to ${MAX_LINE_LENGTH} characters.)`]
    : [];

  return [
    `<path>${input.displayPath}</path>`,
    "<type>file</type>",
    "<content>",
    lineText,
    statusLine,
    ...truncationLines,
    "</content>",
  ].join("\n");
}

function buildReadPreviewLines(lines: readonly ReadVisibleLine[], offsetLineNumber = 1): ToolCallReadPreviewLine[] {
  return lines.slice(0, MAX_PREVIEW_LINE_COUNT).map((visibleLine, index) => ({
    lineNumber: offsetLineNumber + index,
    lineText: visibleLine.lineText,
    ...(visibleLine.wasLineTruncated ? { wasLineTruncated: true } : {}),
  }));
}

function splitFileTextIntoLines(fileText: string): string[] {
  const lines = fileText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function truncateLongLine(lineText: string): ReadVisibleLine {
  return lineText.length <= MAX_LINE_LENGTH
    ? { lineText }
    : { lineText: `${lineText.slice(0, MAX_LINE_LENGTH)}...`, wasLineTruncated: true };
}

function isBinaryFileSample(fileSampleBytes: Uint8Array): boolean {
  if (fileSampleBytes.length === 0) {
    return false;
  }

  let nonPrintableByteCount = 0;
  for (const byte of fileSampleBytes) {
    if (byte === 0) {
      return true;
    }
    if (byte < 9 || (byte > 13 && byte < 32)) {
      nonPrintableByteCount += 1;
    }
  }

  return nonPrintableByteCount / fileSampleBytes.length > 0.3;
}

function throwIfReadToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Read interrupted");
  }
}
