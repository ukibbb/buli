import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createStartedToolCallDetailFromRequest,
  type PatchManyToolCallRequest,
  type PatchToolCallRequest,
  type ToolCallPatchDetail,
  type ToolCallPatchManyDetail,
  type WorkspacePatchFileChangeKind,
  type WorkspacePatchFileDiff,
} from "@buli/contracts";
import { createUnifiedFileDiff } from "./fileMutationDiff.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./toolCallOutcome.ts";
import { readWorkspaceTextFile } from "./workspaceTextFile.ts";
import { formatWorkspaceDisplayPath, isPathInsideWorkspace, resolveWorkspacePath } from "./workspacePath.ts";

type PatchToolName = "patch" | "patch_many";
type PatchToolCallRequestForName<ToolName extends PatchToolName> = ToolName extends "patch"
  ? PatchToolCallRequest
  : PatchManyToolCallRequest;
type PatchToolCallDetailForName<ToolName extends PatchToolName> = ToolName extends "patch"
  ? ToolCallPatchDetail
  : ToolCallPatchManyDetail;

export type PreparedPatchToolCall = {
  toolName: "patch";
  workspaceRootPath: string;
  preparedWorkspaceFileChanges: PreparedPatchWorkspaceFileChange[];
  toolCallDetail: ToolCallPatchDetail;
};

export type PreparedPatchManyToolCall = {
  toolName: "patch_many";
  workspaceRootPath: string;
  preparedWorkspaceFileChanges: PreparedPatchWorkspaceFileChange[];
  toolCallDetail: ToolCallPatchManyDetail;
};

type PreparedPatchToolCallForName<ToolName extends PatchToolName> = ToolName extends "patch"
  ? PreparedPatchToolCall
  : PreparedPatchManyToolCall;

type PreparedPatchWorkspaceFileChange = {
  absolutePath: string;
  displayPath: string;
  expectedFileText: string | undefined;
  nextFileText: string | undefined;
  changeKind: WorkspacePatchFileChangeKind;
};

type StagedPatchWorkspaceFile = {
  absolutePath: string;
  displayPath: string;
  expectedFileText: string | undefined;
  nextFileText: string | undefined;
};

type ResolvedPatchWorkspacePath = {
  absolutePath: string;
  displayPath: string;
};

type ParsedPatchOperation =
  | { operationKind: "add"; filePath: string; newFileText: string }
  | { operationKind: "delete"; filePath: string }
  | { operationKind: "update"; filePath: string; movePath?: string; hunks: ParsedPatchUpdateHunk[] };

type ParsedPatchUpdateHunk = {
  contextHint: string | undefined;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

export type PatchToolPreparationOutcome =
  | { preparationKind: "prepared"; preparedPatchToolCall: PreparedPatchToolCall }
  | FailedToolCallOutcome;

export type PatchManyToolPreparationOutcome =
  | { preparationKind: "prepared"; preparedPatchManyToolCall: PreparedPatchManyToolCall }
  | FailedToolCallOutcome;

export function createStartedPatchToolCallDetail(patchToolCallRequest: PatchToolCallRequest): ToolCallPatchDetail {
  return createStartedToolCallDetailFromRequest(patchToolCallRequest);
}

export function createStartedPatchManyToolCallDetail(patchManyToolCallRequest: PatchManyToolCallRequest): ToolCallPatchManyDetail {
  return createStartedToolCallDetailFromRequest(patchManyToolCallRequest);
}

export async function preparePatchToolCall(input: {
  patchToolCallRequest: PatchToolCallRequest;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<PatchToolPreparationOutcome> {
  return preparePatchToolCallForName({
    toolName: "patch",
    patchToolCallRequest: input.patchToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    requiresSinglePatchOperation: true,
    abortSignal: input.abortSignal,
  });
}

export async function preparePatchManyToolCall(input: {
  patchManyToolCallRequest: PatchManyToolCallRequest;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<PatchManyToolPreparationOutcome> {
  return preparePatchToolCallForName({
    toolName: "patch_many",
    patchToolCallRequest: input.patchManyToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    requiresSinglePatchOperation: false,
    abortSignal: input.abortSignal,
  });
}

export function runPreparedPatchToolCall(input: {
  preparedPatchToolCall: PreparedPatchToolCall;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  return runPreparedPatchToolCallForName({
    preparedPatchToolCall: input.preparedPatchToolCall,
    abortSignal: input.abortSignal,
  });
}

export function runPreparedPatchManyToolCall(input: {
  preparedPatchManyToolCall: PreparedPatchManyToolCall;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  return runPreparedPatchToolCallForName({
    preparedPatchToolCall: input.preparedPatchManyToolCall,
    abortSignal: input.abortSignal,
  });
}

async function preparePatchToolCallForName<ToolName extends PatchToolName>(input: {
  toolName: ToolName;
  patchToolCallRequest: PatchToolCallRequestForName<ToolName>;
  workspaceRootPath: string;
  requiresSinglePatchOperation: boolean;
  abortSignal: AbortSignal | undefined;
}): Promise<
  ToolName extends "patch" ? PatchToolPreparationOutcome : PatchManyToolPreparationOutcome
> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(
    input.patchToolCallRequest as PatchToolCallRequest | PatchManyToolCallRequest,
  );

  try {
    throwIfPatchToolAborted(input.abortSignal);
    const parsedPatchOperations = parsePatchOperations(input.patchToolCallRequest.patchText);
    if (input.requiresSinglePatchOperation && parsedPatchOperations.length !== 1) {
      throw new Error(`Patch must contain exactly one file section; received ${parsedPatchOperations.length}`);
    }

    const workspaceRootRealPath = await realpath(input.workspaceRootPath);
    const stagedFilesByAbsolutePath = new Map<string, StagedPatchWorkspaceFile>();
    for (const parsedPatchOperation of parsedPatchOperations) {
      await stageParsedPatchOperation({
        parsedPatchOperation,
        workspaceRootPath: workspaceRootRealPath,
        stagedFilesByAbsolutePath,
        abortSignal: input.abortSignal,
      });
    }

    const preparedWorkspaceFileChanges = [...stagedFilesByAbsolutePath.values()]
      .filter((stagedFile) => stagedFile.expectedFileText !== stagedFile.nextFileText)
      .map(createPreparedPatchWorkspaceFileChange);
    if (preparedWorkspaceFileChanges.length === 0) {
      throw new Error(`${formatPatchToolDisplayName(input.toolName)} would not change any files`);
    }

    const changedFiles = preparedWorkspaceFileChanges.map(buildPatchWorkspacePatchFileDiff);
    const toolCallDetail = buildPatchToolCallDetail({ toolName: input.toolName, changedFiles });
    const preparedPatchToolCall = {
      toolName: input.toolName,
      workspaceRootPath: workspaceRootRealPath,
      preparedWorkspaceFileChanges,
      toolCallDetail,
    } as PreparedPatchToolCallForName<ToolName>;

    return buildPreparedPatchToolCallOutcome(input.toolName, preparedPatchToolCall) as ToolName extends "patch"
      ? PatchToolPreparationOutcome
      : PatchManyToolPreparationOutcome;
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      failureExplanation,
      toolResultText: `${formatPatchToolDisplayName(input.toolName)} failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    } as ToolName extends "patch" ? PatchToolPreparationOutcome : PatchManyToolPreparationOutcome;
  }
}

async function runPreparedPatchToolCallForName(input: {
  preparedPatchToolCall: PreparedPatchToolCall | PreparedPatchManyToolCall;
  abortSignal: AbortSignal | undefined;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();

  try {
    throwIfPatchToolAborted(input.abortSignal);
    const workspaceRootPath = input.preparedPatchToolCall.workspaceRootPath;
    for (const preparedWorkspaceFileChange of input.preparedPatchToolCall.preparedWorkspaceFileChanges) {
      const currentFileText = await readPatchWorkspaceFileTextIfExists({
        preparedWorkspaceFileChange,
        workspaceRootPath,
      });
      if (currentFileText !== preparedWorkspaceFileChange.expectedFileText) {
        throw new Error(`File changed after ${input.preparedPatchToolCall.toolName} approval preview: ${preparedWorkspaceFileChange.displayPath}`);
      }
    }

    for (const preparedWorkspaceFileChange of input.preparedPatchToolCall.preparedWorkspaceFileChanges) {
      if (preparedWorkspaceFileChange.nextFileText === undefined) {
        await rm(preparedWorkspaceFileChange.absolutePath, { force: true });
        continue;
      }

      await assertWritableWorkspaceAncestor({
        workspaceRootPath,
        absoluteWritePath: preparedWorkspaceFileChange.absolutePath,
        displayPath: preparedWorkspaceFileChange.displayPath,
      });
      await mkdir(dirname(preparedWorkspaceFileChange.absolutePath), { recursive: true });
      await assertWritableWorkspaceAncestor({
        workspaceRootPath,
        absoluteWritePath: preparedWorkspaceFileChange.absolutePath,
        displayPath: preparedWorkspaceFileChange.displayPath,
      });
      await writeFile(preparedWorkspaceFileChange.absolutePath, preparedWorkspaceFileChange.nextFileText, "utf8");
    }

    return {
      outcomeKind: "completed",
      toolCallDetail: input.preparedPatchToolCall.toolCallDetail,
      toolResultText: buildCompletedPatchToolResultText(input.preparedPatchToolCall.toolCallDetail),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: input.preparedPatchToolCall.toolCallDetail,
      failureExplanation,
      toolResultText: `${formatPatchToolDisplayName(input.preparedPatchToolCall.toolName)} failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

function parsePatchOperations(patchText: string): ParsedPatchOperation[] {
  const patchLines = patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const beginPatchLineIndex = patchLines.findIndex((patchLine) => patchLine.trim() === "*** Begin Patch");
  const endPatchLineIndex = patchLines.findIndex((patchLine, patchLineIndex) =>
    patchLineIndex > beginPatchLineIndex && patchLine.trim() === "*** End Patch"
  );
  if (beginPatchLineIndex < 0 || endPatchLineIndex < 0 || beginPatchLineIndex >= endPatchLineIndex) {
    throw new Error("Invalid patch format: missing Begin/End markers");
  }

  const parsedPatchOperations: ParsedPatchOperation[] = [];
  let patchLineIndex = beginPatchLineIndex + 1;
  while (patchLineIndex < endPatchLineIndex) {
    const patchLine = patchLines[patchLineIndex] ?? "";
    if (patchLine.trim().length === 0) {
      patchLineIndex += 1;
      continue;
    }
    if (patchLine.startsWith("*** Add File:")) {
      const parsedAddFile = parsePatchAddFileOperation({ patchLines, patchLineIndex, endPatchLineIndex });
      parsedPatchOperations.push(parsedAddFile.parsedPatchOperation);
      patchLineIndex = parsedAddFile.nextPatchLineIndex;
      continue;
    }
    if (patchLine.startsWith("*** Delete File:")) {
      parsedPatchOperations.push({ operationKind: "delete", filePath: readPatchHeaderPath(patchLine, "*** Delete File:") });
      patchLineIndex += 1;
      continue;
    }
    if (patchLine.startsWith("*** Update File:")) {
      const parsedUpdateFile = parsePatchUpdateFileOperation({ patchLines, patchLineIndex, endPatchLineIndex });
      parsedPatchOperations.push(parsedUpdateFile.parsedPatchOperation);
      patchLineIndex = parsedUpdateFile.nextPatchLineIndex;
      continue;
    }

    throw new Error(`Invalid patch format: unexpected line '${patchLine}'`);
  }

  if (parsedPatchOperations.length === 0) {
    throw new Error("Patch rejected: empty patch");
  }
  return parsedPatchOperations;
}

function parsePatchAddFileOperation(input: {
  patchLines: readonly string[];
  patchLineIndex: number;
  endPatchLineIndex: number;
}): { parsedPatchOperation: ParsedPatchOperation; nextPatchLineIndex: number } {
  const filePath = readPatchHeaderPath(input.patchLines[input.patchLineIndex] ?? "", "*** Add File:");
  const newFileLines: string[] = [];
  let patchLineIndex = input.patchLineIndex + 1;
  while (patchLineIndex < input.endPatchLineIndex && !isPatchFileOperationHeader(input.patchLines[patchLineIndex] ?? "")) {
    const patchLine = input.patchLines[patchLineIndex] ?? "";
    if (!patchLine.startsWith("+")) {
      throw new Error(`Invalid add-file patch for ${filePath}: added lines must start with +`);
    }
    newFileLines.push(patchLine.slice(1));
    patchLineIndex += 1;
  }

  return {
    parsedPatchOperation: {
      operationKind: "add",
      filePath,
      newFileText: newFileLines.length === 0 ? "" : `${newFileLines.join("\n")}\n`,
    },
    nextPatchLineIndex: patchLineIndex,
  };
}

function parsePatchUpdateFileOperation(input: {
  patchLines: readonly string[];
  patchLineIndex: number;
  endPatchLineIndex: number;
}): { parsedPatchOperation: ParsedPatchOperation; nextPatchLineIndex: number } {
  const filePath = readPatchHeaderPath(input.patchLines[input.patchLineIndex] ?? "", "*** Update File:");
  let patchLineIndex = input.patchLineIndex + 1;
  const movePathLine = input.patchLines[patchLineIndex] ?? "";
  const movePath = movePathLine.startsWith("*** Move to:") ? readPatchHeaderPath(movePathLine, "*** Move to:") : undefined;
  if (movePath !== undefined) {
    patchLineIndex += 1;
  }

  const hunks: ParsedPatchUpdateHunk[] = [];
  while (patchLineIndex < input.endPatchLineIndex && !isPatchFileOperationHeader(input.patchLines[patchLineIndex] ?? "")) {
    const patchLine = input.patchLines[patchLineIndex] ?? "";
    if (patchLine.trim().length === 0) {
      patchLineIndex += 1;
      continue;
    }
    if (!patchLine.startsWith("@@")) {
      throw new Error(`Invalid update patch for ${filePath}: expected hunk header`);
    }

    const parsedHunk = parsePatchUpdateHunk({
      patchLines: input.patchLines,
      patchLineIndex,
      endPatchLineIndex: input.endPatchLineIndex,
    });
    hunks.push(parsedHunk.parsedPatchUpdateHunk);
    patchLineIndex = parsedHunk.nextPatchLineIndex;
  }

  if (hunks.length === 0 && movePath === undefined) {
    throw new Error(`Invalid update patch for ${filePath}: no hunks found`);
  }

  return {
    parsedPatchOperation: {
      operationKind: "update",
      filePath,
      ...(movePath !== undefined ? { movePath } : {}),
      hunks,
    },
    nextPatchLineIndex: patchLineIndex,
  };
}

function parsePatchUpdateHunk(input: {
  patchLines: readonly string[];
  patchLineIndex: number;
  endPatchLineIndex: number;
}): { parsedPatchUpdateHunk: ParsedPatchUpdateHunk; nextPatchLineIndex: number } {
  const hunkHeaderLine = input.patchLines[input.patchLineIndex] ?? "";
  const contextHint = hunkHeaderLine.slice(2).trim() || undefined;
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let isEndOfFile = false;
  let patchLineIndex = input.patchLineIndex + 1;
  while (
    patchLineIndex < input.endPatchLineIndex &&
    !(input.patchLines[patchLineIndex] ?? "").startsWith("@@") &&
    !isPatchFileOperationHeader(input.patchLines[patchLineIndex] ?? "")
  ) {
    const patchLine = input.patchLines[patchLineIndex] ?? "";
    if (patchLine === "*** End of File") {
      isEndOfFile = true;
      patchLineIndex += 1;
      break;
    }
    if (patchLine.startsWith(" ")) {
      oldLines.push(patchLine.slice(1));
      newLines.push(patchLine.slice(1));
      patchLineIndex += 1;
      continue;
    }
    if (patchLine.startsWith("-")) {
      oldLines.push(patchLine.slice(1));
      patchLineIndex += 1;
      continue;
    }
    if (patchLine.startsWith("+")) {
      newLines.push(patchLine.slice(1));
      patchLineIndex += 1;
      continue;
    }

    throw new Error(`Invalid patch hunk line: ${patchLine}`);
  }

  return {
    parsedPatchUpdateHunk: { contextHint, oldLines, newLines, isEndOfFile },
    nextPatchLineIndex: patchLineIndex,
  };
}

async function stageParsedPatchOperation(input: {
  parsedPatchOperation: ParsedPatchOperation;
  workspaceRootPath: string;
  stagedFilesByAbsolutePath: Map<string, StagedPatchWorkspaceFile>;
  abortSignal: AbortSignal | undefined;
}): Promise<void> {
  throwIfPatchToolAborted(input.abortSignal);
  if (input.parsedPatchOperation.operationKind === "add") {
    const stagedFile = await getOrLoadStagedPatchWorkspaceFile({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: input.parsedPatchOperation.filePath,
      requiresExistingFile: false,
      stagedFilesByAbsolutePath: input.stagedFilesByAbsolutePath,
    });
    if (stagedFile.expectedFileText !== undefined) {
      throw new Error(`Cannot add existing file: ${stagedFile.displayPath}`);
    }
    if (stagedFile.nextFileText !== undefined) {
      throw new Error(`Cannot add already-staged file: ${stagedFile.displayPath}`);
    }
    input.stagedFilesByAbsolutePath.set(stagedFile.absolutePath, {
      ...stagedFile,
      nextFileText: input.parsedPatchOperation.newFileText,
    });
    return;
  }

  if (input.parsedPatchOperation.operationKind === "delete") {
    const stagedFile = await getOrLoadStagedPatchWorkspaceFile({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: input.parsedPatchOperation.filePath,
      requiresExistingFile: true,
      stagedFilesByAbsolutePath: input.stagedFilesByAbsolutePath,
    });
    if (stagedFile.nextFileText === undefined) {
      throw new Error(`Cannot delete already-deleted file: ${stagedFile.displayPath}`);
    }
    input.stagedFilesByAbsolutePath.set(stagedFile.absolutePath, { ...stagedFile, nextFileText: undefined });
    return;
  }

  const stagedSourceFile = await getOrLoadStagedPatchWorkspaceFile({
    workspaceRootPath: input.workspaceRootPath,
    requestedPath: input.parsedPatchOperation.filePath,
    requiresExistingFile: true,
    stagedFilesByAbsolutePath: input.stagedFilesByAbsolutePath,
  });
  if (stagedSourceFile.nextFileText === undefined) {
    throw new Error(`Cannot update deleted file: ${stagedSourceFile.displayPath}`);
  }
  const updatedFileText = applyPatchUpdateHunks({
    filePath: stagedSourceFile.displayPath,
    currentFileText: stagedSourceFile.nextFileText,
    hunks: input.parsedPatchOperation.hunks,
  });
  if (input.parsedPatchOperation.movePath === undefined) {
    input.stagedFilesByAbsolutePath.set(stagedSourceFile.absolutePath, { ...stagedSourceFile, nextFileText: updatedFileText });
    return;
  }

  const stagedMoveTargetFile = await getOrLoadStagedPatchWorkspaceFile({
    workspaceRootPath: input.workspaceRootPath,
    requestedPath: input.parsedPatchOperation.movePath,
    requiresExistingFile: false,
    stagedFilesByAbsolutePath: input.stagedFilesByAbsolutePath,
  });
  if (stagedMoveTargetFile.absolutePath === stagedSourceFile.absolutePath) {
    input.stagedFilesByAbsolutePath.set(stagedSourceFile.absolutePath, { ...stagedSourceFile, nextFileText: updatedFileText });
    return;
  }
  if (stagedMoveTargetFile.expectedFileText !== undefined) {
    throw new Error(`Cannot move patch target over existing file: ${stagedMoveTargetFile.displayPath}`);
  }
  if (stagedMoveTargetFile.nextFileText !== undefined) {
    throw new Error(`Cannot move patch target over staged file: ${stagedMoveTargetFile.displayPath}`);
  }

  input.stagedFilesByAbsolutePath.set(stagedSourceFile.absolutePath, { ...stagedSourceFile, nextFileText: undefined });
  input.stagedFilesByAbsolutePath.set(stagedMoveTargetFile.absolutePath, {
    ...stagedMoveTargetFile,
    nextFileText: updatedFileText,
  });
}

async function getOrLoadStagedPatchWorkspaceFile(input: {
  workspaceRootPath: string;
  requestedPath: string;
  requiresExistingFile: boolean;
  stagedFilesByAbsolutePath: Map<string, StagedPatchWorkspaceFile>;
}): Promise<StagedPatchWorkspaceFile> {
  const resolvedCandidatePath = resolvePatchWorkspacePath({
    workspaceRootPath: input.workspaceRootPath,
    requestedPath: input.requestedPath,
  });
  const stagedCandidateFile = input.stagedFilesByAbsolutePath.get(resolvedCandidatePath.absolutePath);
  if (stagedCandidateFile) {
    return stagedCandidateFile;
  }

  const existingFile = await readExistingPatchWorkspaceFile({
    workspaceRootPath: input.workspaceRootPath,
    resolvedCandidatePath,
    requiresExistingFile: input.requiresExistingFile,
  });
  const stagedExistingFile = input.stagedFilesByAbsolutePath.get(existingFile.absolutePath);
  if (stagedExistingFile) {
    return stagedExistingFile;
  }

  const stagedFile = {
    ...existingFile,
    nextFileText: existingFile.expectedFileText,
  };
  input.stagedFilesByAbsolutePath.set(stagedFile.absolutePath, stagedFile);
  return stagedFile;
}

function resolvePatchWorkspacePath(input: {
  workspaceRootPath: string;
  requestedPath: string;
}): ResolvedPatchWorkspacePath {
  const absolutePath = resolveWorkspacePath({
    workspaceRootPath: input.workspaceRootPath,
    requestedPath: input.requestedPath,
  });
  return {
    absolutePath,
    displayPath: formatWorkspaceDisplayPath(input.workspaceRootPath, absolutePath),
  };
}

async function readExistingPatchWorkspaceFile(input: {
  workspaceRootPath: string;
  resolvedCandidatePath: ResolvedPatchWorkspacePath;
  requiresExistingFile: boolean;
}): Promise<ResolvedPatchWorkspacePath & { expectedFileText: string | undefined }> {
  try {
    const patchTargetStats = await lstat(input.resolvedCandidatePath.absolutePath);
    if (patchTargetStats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not supported: ${input.resolvedCandidatePath.displayPath}`);
    }
    if (!patchTargetStats.isFile()) {
      throw new Error(`Patch target must be a file path: ${input.resolvedCandidatePath.displayPath}`);
    }

    const targetRealPath = await realpath(input.resolvedCandidatePath.absolutePath);
    if (!isPathInsideWorkspace(input.workspaceRootPath, targetRealPath)) {
      throw new Error(`Patch path must stay inside the workspace root: ${input.workspaceRootPath}`);
    }
    const displayPath = formatWorkspaceDisplayPath(input.workspaceRootPath, targetRealPath);
    return {
      absolutePath: targetRealPath,
      displayPath,
      expectedFileText: await readWorkspaceTextFile({ absolutePath: targetRealPath, displayPath }),
    };
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
    if (input.requiresExistingFile) {
      throw new Error(`Patch target file not found: ${input.resolvedCandidatePath.displayPath}`);
    }

    await assertWritableWorkspaceAncestor({
      workspaceRootPath: input.workspaceRootPath,
      absoluteWritePath: input.resolvedCandidatePath.absolutePath,
      displayPath: input.resolvedCandidatePath.displayPath,
    });
    return { ...input.resolvedCandidatePath, expectedFileText: undefined };
  }
}

function applyPatchUpdateHunks(input: {
  filePath: string;
  currentFileText: string;
  hunks: readonly ParsedPatchUpdateHunk[];
}): string {
  if (input.hunks.length === 0) {
    return input.currentFileText;
  }

  const currentFileTextParts = splitOptionalBom(input.currentFileText);
  const lineEnding = detectLineEnding(currentFileTextParts.text);
  const normalizedCurrentFileText = normalizeLineEndings(currentFileTextParts.text);
  const originalLines = splitPatchEditableLines(normalizedCurrentFileText);
  const replacements: Array<{ startLineIndex: number; removedLineCount: number; newLines: string[] }> = [];
  let searchStartLineIndex = 0;

  for (const hunk of input.hunks) {
    if (hunk.contextHint !== undefined) {
      const contextLineIndex = seekLineSequence(originalLines, [hunk.contextHint], searchStartLineIndex, false);
      if (contextLineIndex < 0) {
        throw new Error(`Failed to find patch context '${hunk.contextHint}' in ${input.filePath}`);
      }
      searchStartLineIndex = contextLineIndex + 1;
    }

    if (hunk.oldLines.length === 0) {
      const insertionLineIndex = hunk.contextHint === undefined ? originalLines.length : searchStartLineIndex;
      replacements.push({ startLineIndex: insertionLineIndex, removedLineCount: 0, newLines: hunk.newLines });
      searchStartLineIndex = insertionLineIndex + hunk.newLines.length;
      continue;
    }

    const foundLineIndex = seekLineSequence(originalLines, hunk.oldLines, searchStartLineIndex, hunk.isEndOfFile);
    if (foundLineIndex < 0) {
      throw new Error(`Failed to find expected patch lines in ${input.filePath}:\n${hunk.oldLines.join("\n")}`);
    }
    replacements.push({
      startLineIndex: foundLineIndex,
      removedLineCount: hunk.oldLines.length,
      newLines: hunk.newLines,
    });
    searchStartLineIndex = foundLineIndex + hunk.oldLines.length;
  }

  const updatedLines = [...originalLines];
  for (const replacement of replacements.sort((left, right) => right.startLineIndex - left.startLineIndex)) {
    updatedLines.splice(replacement.startLineIndex, replacement.removedLineCount, ...replacement.newLines);
  }
  if (updatedLines.length === 0 || updatedLines.at(-1) !== "") {
    updatedLines.push("");
  }

  return `${currentFileTextParts.bom}${convertToLineEnding(updatedLines.join("\n"), lineEnding)}`;
}

function createPreparedPatchWorkspaceFileChange(stagedFile: StagedPatchWorkspaceFile): PreparedPatchWorkspaceFileChange {
  return {
    absolutePath: stagedFile.absolutePath,
    displayPath: stagedFile.displayPath,
    expectedFileText: stagedFile.expectedFileText,
    nextFileText: stagedFile.nextFileText,
    changeKind: resolvePatchFileChangeKind(stagedFile),
  };
}

function resolvePatchFileChangeKind(stagedFile: StagedPatchWorkspaceFile): WorkspacePatchFileChangeKind {
  if (stagedFile.expectedFileText === undefined) {
    return "added";
  }
  if (stagedFile.nextFileText === undefined) {
    return "deleted";
  }
  return "modified";
}

function buildPatchWorkspacePatchFileDiff(preparedWorkspaceFileChange: PreparedPatchWorkspaceFileChange): WorkspacePatchFileDiff {
  const unifiedFileDiff = createUnifiedFileDiff({
    displayPath: preparedWorkspaceFileChange.displayPath,
    beforeText: preparedWorkspaceFileChange.expectedFileText,
    afterText: preparedWorkspaceFileChange.nextFileText ?? "",
  });
  return {
    filePath: preparedWorkspaceFileChange.displayPath,
    changeKind: preparedWorkspaceFileChange.changeKind,
    addedLineCount: unifiedFileDiff.addedLineCount,
    removedLineCount: unifiedFileDiff.removedLineCount,
    unifiedDiffText: unifiedFileDiff.unifiedDiffText,
  };
}

function buildPatchToolCallDetail<ToolName extends PatchToolName>(input: {
  toolName: ToolName;
  changedFiles: readonly WorkspacePatchFileDiff[];
}): PatchToolCallDetailForName<ToolName> {
  const addedLineCount = input.changedFiles.reduce((sum, changedFile) => sum + changedFile.addedLineCount, 0);
  const removedLineCount = input.changedFiles.reduce((sum, changedFile) => sum + changedFile.removedLineCount, 0);
  const patchTargetText = input.changedFiles.length === 1
    ? input.changedFiles[0]?.filePath ?? "patch"
    : `${input.changedFiles.length} files`;
  return {
    toolName: input.toolName,
    patchTargetText,
    changedFileCount: input.changedFiles.length,
    addedLineCount,
    removedLineCount,
    changedFiles: [...input.changedFiles],
  } as PatchToolCallDetailForName<ToolName>;
}

function buildPreparedPatchToolCallOutcome<ToolName extends PatchToolName>(
  toolName: ToolName,
  preparedPatchToolCall: PreparedPatchToolCallForName<ToolName>,
): ToolName extends "patch" ? PatchToolPreparationOutcome : PatchManyToolPreparationOutcome {
  if (toolName === "patch") {
    return {
      preparationKind: "prepared",
      preparedPatchToolCall: preparedPatchToolCall as PreparedPatchToolCall,
    } as ToolName extends "patch" ? PatchToolPreparationOutcome : PatchManyToolPreparationOutcome;
  }

  return {
    preparationKind: "prepared",
    preparedPatchManyToolCall: preparedPatchToolCall as PreparedPatchManyToolCall,
  } as ToolName extends "patch" ? PatchToolPreparationOutcome : PatchManyToolPreparationOutcome;
}

async function readPatchWorkspaceFileTextIfExists(input: {
  preparedWorkspaceFileChange: PreparedPatchWorkspaceFileChange;
  workspaceRootPath: string;
}): Promise<string | undefined> {
  try {
    const patchTargetStats = await lstat(input.preparedWorkspaceFileChange.absolutePath);
    if (patchTargetStats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not supported: ${input.preparedWorkspaceFileChange.displayPath}`);
    }
    if (!patchTargetStats.isFile()) {
      throw new Error(`Patch target must be a file path: ${input.preparedWorkspaceFileChange.displayPath}`);
    }

    const patchTargetRealPath = await realpath(input.preparedWorkspaceFileChange.absolutePath);
    if (!isPathInsideWorkspace(input.workspaceRootPath, patchTargetRealPath)) {
      throw new Error(`Patch path must stay inside the workspace root: ${input.workspaceRootPath}`);
    }
    return await readWorkspaceTextFile({
      absolutePath: input.preparedWorkspaceFileChange.absolutePath,
      displayPath: input.preparedWorkspaceFileChange.displayPath,
    });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw error;
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
        throw new Error(`Patch path contains a symbolic-link ancestor: ${input.displayPath}`);
      }
      if (!ancestorStats.isDirectory()) {
        throw new Error(`Patch parent path is not a directory: ${formatWorkspaceDisplayPath(input.workspaceRootPath, currentAncestorPath)}`);
      }

      const ancestorRealPath = await realpath(currentAncestorPath);
      if (!isPathInsideWorkspace(input.workspaceRootPath, ancestorRealPath)) {
        throw new Error(`Patch path must stay inside the workspace root: ${input.workspaceRootPath}`);
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

  throw new Error(`Patch path must stay inside the workspace root: ${input.workspaceRootPath}`);
}

function buildCompletedPatchToolResultText(toolCallDetail: ToolCallPatchDetail | ToolCallPatchManyDetail): string {
  const changedFileLines = toolCallDetail.changedFiles?.map((changedFile) =>
    `- ${changedFile.changeKind} ${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`
  ) ?? [];
  return [
    `Patched files: ${toolCallDetail.changedFileCount ?? 0}`,
    `Added lines: ${toolCallDetail.addedLineCount ?? 0}`,
    `Removed lines: ${toolCallDetail.removedLineCount ?? 0}`,
    ...changedFileLines,
  ].join("\n");
}

function readPatchHeaderPath(patchLine: string, headerPrefix: string): string {
  const filePath = patchLine.slice(headerPrefix.length).trim();
  if (filePath.length === 0) {
    throw new Error(`Invalid patch header: missing path after ${headerPrefix}`);
  }
  return filePath;
}

function isPatchFileOperationHeader(patchLine: string): boolean {
  return patchLine.startsWith("*** Add File:") ||
    patchLine.startsWith("*** Delete File:") ||
    patchLine.startsWith("*** Update File:");
}

function splitPatchEditableLines(fileText: string): string[] {
  const lines = fileText.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function seekLineSequence(
  lines: readonly string[],
  pattern: readonly string[],
  startLineIndex: number,
  isEndOfFile: boolean,
): number {
  const exactMatchLineIndex = trySeekLineSequence(lines, pattern, startLineIndex, (left, right) => left === right, isEndOfFile);
  if (exactMatchLineIndex >= 0) {
    return exactMatchLineIndex;
  }
  const trimmedEndMatchLineIndex = trySeekLineSequence(lines, pattern, startLineIndex, (left, right) => left.trimEnd() === right.trimEnd(), isEndOfFile);
  if (trimmedEndMatchLineIndex >= 0) {
    return trimmedEndMatchLineIndex;
  }
  return trySeekLineSequence(lines, pattern, startLineIndex, (left, right) => left.trim() === right.trim(), isEndOfFile);
}

function trySeekLineSequence(
  lines: readonly string[],
  pattern: readonly string[],
  startLineIndex: number,
  areLinesEqual: (leftLine: string, rightLine: string) => boolean,
  isEndOfFile: boolean,
): number {
  if (pattern.length === 0) {
    return -1;
  }
  if (isEndOfFile) {
    const endMatchLineIndex = lines.length - pattern.length;
    if (endMatchLineIndex >= startLineIndex && doLinesMatchAtIndex(lines, pattern, endMatchLineIndex, areLinesEqual)) {
      return endMatchLineIndex;
    }
  }

  for (let lineIndex = startLineIndex; lineIndex <= lines.length - pattern.length; lineIndex += 1) {
    if (doLinesMatchAtIndex(lines, pattern, lineIndex, areLinesEqual)) {
      return lineIndex;
    }
  }
  return -1;
}

function doLinesMatchAtIndex(
  lines: readonly string[],
  pattern: readonly string[],
  lineIndex: number,
  areLinesEqual: (leftLine: string, rightLine: string) => boolean,
): boolean {
  for (let patternLineIndex = 0; patternLineIndex < pattern.length; patternLineIndex += 1) {
    const line = lines[lineIndex + patternLineIndex];
    const patternLine = pattern[patternLineIndex];
    if (line === undefined || patternLine === undefined || !areLinesEqual(line, patternLine)) {
      return false;
    }
  }
  return true;
}

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function detectLineEnding(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function convertToLineEnding(text: string, ending: "\n" | "\r\n"): string {
  if (ending === "\n") {
    return text;
  }
  return text.replaceAll("\n", "\r\n");
}

function splitOptionalBom(text: string): { bom: string; text: string } {
  return text.charCodeAt(0) === 0xfeff
    ? { bom: text.charAt(0), text: text.slice(1) }
    : { bom: "", text };
}

function formatPatchToolDisplayName(toolName: PatchToolName): string {
  return toolName === "patch" ? "Patch" : "PatchMany";
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function throwIfPatchToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Patch interrupted");
  }
}
