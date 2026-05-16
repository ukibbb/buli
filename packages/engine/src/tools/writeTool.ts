import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createStartedToolCallDetailFromRequest,
  type ToolCallWriteDetail,
  type WriteToolCallRequest,
} from "@buli/contracts";
import { createUnifiedFileDiff } from "./fileMutationDiff.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./toolCallOutcome.ts";
import { readWorkspaceTextFile } from "./workspaceTextFile.ts";
import { formatWorkspaceDisplayPath, isPathInsideWorkspace, resolveWorkspacePath } from "./workspacePath.ts";

export type PreparedWriteToolCall = {
  toolName: "write";
  absolutePath: string;
  displayPath: string;
  expectedExistingFileText: string | undefined;
  nextFileText: string;
  toolCallDetail: ToolCallWriteDetail;
};

export type WriteToolPreparationOutcome =
  | { preparationKind: "prepared"; preparedWriteToolCall: PreparedWriteToolCall }
  | FailedToolCallOutcome;

export function createStartedWriteToolCallDetail(writeToolCallRequest: WriteToolCallRequest): ToolCallWriteDetail {
  return createStartedToolCallDetailFromRequest(writeToolCallRequest);
}

export async function prepareWriteToolCall(input: {
  writeToolCallRequest: WriteToolCallRequest;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<WriteToolPreparationOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedWriteToolCallDetail(input.writeToolCallRequest);

  try {
    throwIfWriteToolAborted(input.abortSignal);
    const workspaceRootRealPath = await realpath(input.workspaceRootPath);
    const absoluteWritePath = resolveWorkspacePath({
      workspaceRootPath: workspaceRootRealPath,
      requestedPath: input.writeToolCallRequest.writeTargetPath,
    });
    const displayPath = formatWorkspaceDisplayPath(workspaceRootRealPath, absoluteWritePath);
    await assertWritableWorkspaceAncestor({ workspaceRootPath: workspaceRootRealPath, absoluteWritePath, displayPath });
    const existingFileText = await readExistingWriteTargetText({ absoluteWritePath, displayPath });
    throwIfWriteToolAborted(input.abortSignal);

    if (existingFileText === input.writeToolCallRequest.fileContent) {
      throw new Error(`Write would not change ${displayPath}`);
    }

    const unifiedFileDiff = createUnifiedFileDiff({
      displayPath,
      beforeText: existingFileText,
      afterText: input.writeToolCallRequest.fileContent,
    });
    const toolCallDetail: ToolCallWriteDetail = {
      toolName: "write",
      writtenFilePath: displayPath,
      addedLineCount: unifiedFileDiff.addedLineCount,
      removedLineCount: unifiedFileDiff.removedLineCount,
      unifiedDiffText: unifiedFileDiff.unifiedDiffText,
    };

    return {
      preparationKind: "prepared",
      preparedWriteToolCall: {
        toolName: "write",
        absolutePath: absoluteWritePath,
        displayPath,
        expectedExistingFileText: existingFileText,
        nextFileText: input.writeToolCallRequest.fileContent,
        toolCallDetail,
      },
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
      toolResultText: `Write failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

export async function runPreparedWriteToolCall(input: {
  preparedWriteToolCall: PreparedWriteToolCall;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();

  try {
    throwIfWriteToolAborted(input.abortSignal);
    const workspaceRootRealPath = await realpath(input.workspaceRootPath);
    await assertWritableWorkspaceAncestor({
      workspaceRootPath: workspaceRootRealPath,
      absoluteWritePath: input.preparedWriteToolCall.absolutePath,
      displayPath: input.preparedWriteToolCall.displayPath,
    });
    await assertWriteTargetStillMatchesPreview(input.preparedWriteToolCall);
    await mkdir(dirname(input.preparedWriteToolCall.absolutePath), { recursive: true });
    await assertWritableWorkspaceAncestor({
      workspaceRootPath: workspaceRootRealPath,
      absoluteWritePath: input.preparedWriteToolCall.absolutePath,
      displayPath: input.preparedWriteToolCall.displayPath,
    });
    await writeFile(input.preparedWriteToolCall.absolutePath, input.preparedWriteToolCall.nextFileText, "utf8");
    throwIfWriteToolAborted(input.abortSignal);

    return {
      outcomeKind: "completed",
      toolCallDetail: input.preparedWriteToolCall.toolCallDetail,
      toolResultText: buildCompletedWriteToolResultText(input.preparedWriteToolCall.toolCallDetail),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: input.preparedWriteToolCall.toolCallDetail,
      failureExplanation,
      toolResultText: `Write failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

async function readExistingWriteTargetText(input: {
  absoluteWritePath: string;
  displayPath: string;
}): Promise<string | undefined> {
  try {
    const writeTargetStats = await lstat(input.absoluteWritePath);
    if (writeTargetStats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not supported: ${input.displayPath}`);
    }
    if (!writeTargetStats.isFile()) {
      throw new Error(`Write target must be a file path: ${input.displayPath}`);
    }

    return await readWorkspaceTextFile({
      absolutePath: input.absoluteWritePath,
      displayPath: input.displayPath,
    });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function assertWriteTargetStillMatchesPreview(preparedWriteToolCall: PreparedWriteToolCall): Promise<void> {
  const existingFileText = await readExistingWriteTargetText({
    absoluteWritePath: preparedWriteToolCall.absolutePath,
    displayPath: preparedWriteToolCall.displayPath,
  });
  if (existingFileText !== preparedWriteToolCall.expectedExistingFileText) {
    throw new Error(`File changed after write approval preview: ${preparedWriteToolCall.displayPath}`);
  }
}

async function assertWritableWorkspaceAncestor(input: {
  workspaceRootPath: string;
  absoluteWritePath: string;
  displayPath: string;
}): Promise<void> {
  let currentAncestorPath = dirname(input.absoluteWritePath);
  while (isPathInsideWorkspace(input.workspaceRootPath, currentAncestorPath)) {
    try {
      const ancestorStats = await lstat(currentAncestorPath);
      if (ancestorStats.isSymbolicLink()) {
        throw new Error(`Write path contains a symbolic-link ancestor: ${input.displayPath}`);
      }
      if (!ancestorStats.isDirectory()) {
        throw new Error(`Write parent path is not a directory: ${formatWorkspaceDisplayPath(input.workspaceRootPath, currentAncestorPath)}`);
      }

      const ancestorRealPath = await realpath(currentAncestorPath);
      if (!isPathInsideWorkspace(input.workspaceRootPath, ancestorRealPath)) {
        throw new Error(`Write path must stay inside the workspace root: ${input.workspaceRootPath}`);
      }
      return;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }

      const parentAncestorPath = dirname(currentAncestorPath);
      if (parentAncestorPath === currentAncestorPath) {
        break;
      }
      currentAncestorPath = parentAncestorPath;
    }
  }

  throw new Error(`Write path must stay inside the workspace root: ${input.workspaceRootPath}`);
}

function buildCompletedWriteToolResultText(toolCallDetail: ToolCallWriteDetail): string {
  return [
    `Wrote file: ${toolCallDetail.writtenFilePath}`,
    `Added lines: ${toolCallDetail.addedLineCount ?? 0}`,
    `Removed lines: ${toolCallDetail.removedLineCount ?? 0}`,
    "Diff:",
    toolCallDetail.unifiedDiffText ?? "<not available>",
  ].join("\n");
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function throwIfWriteToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Write interrupted");
  }
}
