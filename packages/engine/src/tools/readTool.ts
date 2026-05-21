import { createReadStream } from "node:fs";
import { open, readFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createStartedToolCallDetailFromRequest,
  type ReadToolCallRequest,
  type ToolCallReadDetail,
  type ToolCallReadPreviewLine,
} from "@buli/contracts";
import {
  buildProjectInstructionUpdateText,
  type ProjectInstructionTracker,
} from "../projectInstructions.ts";
import {
  buildDirectoryReadToolResultText,
  buildFileReadToolResultText,
  buildLargeFileReadToolResultText,
} from "./readToolResultText.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { isLikelyBinaryFileSample, splitWorkspaceTextFileIntoLines } from "./workspaceTextFileContent.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";

const DEFAULT_READ_LIMIT = 2_000;
const MAX_READ_FILE_BYTE_COUNT = 1_000_000;
const BINARY_SAMPLE_BYTE_COUNT = 4_096;

type ReadVisibleLine = {
  lineText: string;
};

type LargeTextFileLineWindow = {
  visibleFileLines: ReadVisibleLine[];
  totalLineCount?: number;
  wasLineCountTruncated: boolean;
};

export function createStartedReadToolCallDetail(readToolCallRequest: ReadToolCallRequest): ToolCallReadDetail {
  return createStartedToolCallDetailFromRequest(readToolCallRequest);
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
    const maximumLineCount = input.readToolCallRequest.maximumLineCount ?? DEFAULT_READ_LIMIT;

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
      if (offsetLineNumber > sortedEntryNames.length && !(sortedEntryNames.length === 0 && offsetLineNumber === 1)) {
        throw new Error(`Offset ${offsetLineNumber} is out of range for this directory (${sortedEntryNames.length} entries)`);
      }
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
    if (resolvedReadPath.stats.size > MAX_READ_FILE_BYTE_COUNT) {
      const fileSampleBytes = await readFileSampleBytes({
        absoluteFilePath: resolvedReadPath.absolutePath,
        maximumByteCount: BINARY_SAMPLE_BYTE_COUNT,
        abortSignal: input.abortSignal,
      });
      if (isLikelyBinaryFileSample(fileSampleBytes)) {
        throw new Error(`Cannot read binary file: ${resolvedReadPath.displayPath} (${resolvedReadPath.stats.size} bytes)`);
      }

      const hasExplicitLineWindow = input.readToolCallRequest.offsetLineNumber !== undefined ||
        input.readToolCallRequest.maximumLineCount !== undefined;
      if (!hasExplicitLineWindow) {
        throw new Error(
          `File is too large for a default read: ${resolvedReadPath.displayPath} (${resolvedReadPath.stats.size} bytes, max ${MAX_READ_FILE_BYTE_COUNT} bytes). Use offsetLineNumber and maximumLineCount to request a bounded line window.`,
        );
      }

      const largeTextFileLineWindow = await readLargeTextFileLineWindow({
        absoluteFilePath: resolvedReadPath.absolutePath,
        offsetLineNumber,
        maximumLineCount,
        abortSignal: input.abortSignal,
      });
      const visibleFileLineTexts = largeTextFileLineWindow.visibleFileLines.map((visibleFileLine) => visibleFileLine.lineText);
      const previewLines = buildReadPreviewLines(largeTextFileLineWindow.visibleFileLines, offsetLineNumber);
      const toolCallDetail: ToolCallReadDetail = {
        toolName: "read",
        readFilePath: resolvedReadPath.displayPath,
        ...(largeTextFileLineWindow.totalLineCount !== undefined
          ? { readLineCount: largeTextFileLineWindow.totalLineCount }
          : {}),
        returnedLineCount: largeTextFileLineWindow.visibleFileLines.length,
        readByteCount: resolvedReadPath.stats.size,
        previewLines,
        wasLineCountTruncated: largeTextFileLineWindow.wasLineCountTruncated,
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
          buildLargeFileReadToolResultText({
            displayPath: resolvedReadPath.displayPath,
            fileByteCount: resolvedReadPath.stats.size,
            visibleFileLines: visibleFileLineTexts,
            offsetLineNumber,
            totalLineCount: largeTextFileLineWindow.totalLineCount,
            wasLineCountTruncated: largeTextFileLineWindow.wasLineCountTruncated,
          }),
          projectInstructionUpdateText,
        ),
        durationMilliseconds: Date.now() - startedAtMilliseconds,
      };
    }

    const fileBytes = await readFile(resolvedReadPath.absolutePath);
    throwIfReadToolAborted(input.abortSignal);
    if (isLikelyBinaryFileSample(fileBytes.subarray(0, BINARY_SAMPLE_BYTE_COUNT))) {
      throw new Error(`Cannot read binary file: ${resolvedReadPath.displayPath}`);
    }

    const fileLines = splitWorkspaceTextFileIntoLines(fileBytes.toString("utf8"));
    if (offsetLineNumber > fileLines.length && !(fileLines.length === 0 && offsetLineNumber === 1)) {
      throw new Error(`Offset ${offsetLineNumber} is out of range for this file (${fileLines.length} lines)`);
    }

    const visibleFileLines = fileLines
      .slice(offsetLineNumber - 1, offsetLineNumber - 1 + maximumLineCount)
      .map((lineText) => ({ lineText }));
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

function buildReadPreviewLines(lines: readonly ReadVisibleLine[], offsetLineNumber = 1): ToolCallReadPreviewLine[] {
  return lines.map((visibleLine, index) => ({
    lineNumber: offsetLineNumber + index,
    lineText: visibleLine.lineText,
  }));
}

async function readFileSampleBytes(input: {
  absoluteFilePath: string;
  maximumByteCount: number;
  abortSignal: AbortSignal | undefined;
}): Promise<Uint8Array> {
  throwIfReadToolAborted(input.abortSignal);
  const fileHandle = await open(input.absoluteFilePath, "r");
  try {
    const sampleBuffer = Buffer.alloc(input.maximumByteCount);
    const readResult = await fileHandle.read(sampleBuffer, 0, input.maximumByteCount, 0);
    throwIfReadToolAborted(input.abortSignal);
    return sampleBuffer.subarray(0, readResult.bytesRead);
  } finally {
    await fileHandle.close();
  }
}

async function readLargeTextFileLineWindow(input: {
  absoluteFilePath: string;
  offsetLineNumber: number;
  maximumLineCount: number;
  abortSignal: AbortSignal | undefined;
}): Promise<LargeTextFileLineWindow> {
  const visibleFileLines: ReadVisibleLine[] = [];
  const lastRequestedLineNumber = input.offsetLineNumber + input.maximumLineCount - 1;
  let completedLineCount = 0;
  let currentLineText = "";
  let currentLineHasContent = false;
  let previousCharacterWasCarriageReturn = false;

  const finishCurrentLine = (): void => {
    const currentLineNumber = completedLineCount + 1;
    if (currentLineNumber >= input.offsetLineNumber && currentLineNumber <= lastRequestedLineNumber) {
      visibleFileLines.push({
        lineText: currentLineText,
      });
    }

    completedLineCount += 1;
    currentLineText = "";
    currentLineHasContent = false;
  };

  const fileReadStream = createReadStream(input.absoluteFilePath, { encoding: "utf8" });
  const interruptFileReadStream = (): void => {
    fileReadStream.destroy(new Error("Read interrupted"));
  };
  input.abortSignal?.addEventListener("abort", interruptFileReadStream, { once: true });
  try {
    for await (const chunk of fileReadStream) {
      throwIfReadToolAborted(input.abortSignal);
      for (const character of String(chunk)) {
        if (previousCharacterWasCarriageReturn) {
          previousCharacterWasCarriageReturn = false;
          if (character === "\n") {
            continue;
          }
        }

        if (completedLineCount >= lastRequestedLineNumber) {
          return {
            visibleFileLines,
            wasLineCountTruncated: true,
          };
        }

        if (character === "\r" || character === "\n") {
          finishCurrentLine();
          previousCharacterWasCarriageReturn = character === "\r";
          continue;
        }

        currentLineHasContent = true;
        const currentLineNumber = completedLineCount + 1;
        if (currentLineNumber < input.offsetLineNumber || currentLineNumber > lastRequestedLineNumber) {
          continue;
        }

        currentLineText = `${currentLineText}${character}`;
      }
    }
  } finally {
    input.abortSignal?.removeEventListener("abort", interruptFileReadStream);
  }

  if (currentLineHasContent) {
    finishCurrentLine();
  }

  if (visibleFileLines.length === 0 && input.offsetLineNumber > completedLineCount) {
    throw new Error(`Offset ${input.offsetLineNumber} is out of range for this file (${completedLineCount} lines)`);
  }

  return {
    visibleFileLines,
    totalLineCount: completedLineCount,
    wasLineCountTruncated: false,
  };
}

function throwIfReadToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Read interrupted");
  }
}
