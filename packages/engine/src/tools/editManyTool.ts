import { writeFile } from "node:fs/promises";
import {
  createStartedToolCallDetailFromRequest,
  type EditManyToolCallEdit,
  type EditManyToolCallRequest,
  type ToolCallEditManyDetail,
  type WorkspacePatchFileDiff,
} from "@buli/contracts";
import { createUnifiedFileDiff } from "./fileMutationDiff.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./toolCallOutcome.ts";
import { readWorkspaceTextFile } from "./workspaceTextFile.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";

export type PreparedEditManyToolCall = {
  toolName: "edit_many";
  editCount: number;
  preparedFileEdits: PreparedEditManyFileEdit[];
  toolCallDetail: ToolCallEditManyDetail;
};

type PreparedEditManyFileEdit = {
  absolutePath: string;
  displayPath: string;
  expectedFileText: string;
  nextFileText: string;
};

type StagedEditManyFileEdit = PreparedEditManyFileEdit;

type ApprovedEditManyFileCommitter = (input: {
  absolutePath: string;
  nextFileText: string;
}) => Promise<void>;

export type EditManyToolPreparationOutcome =
  | { preparationKind: "prepared"; preparedEditManyToolCall: PreparedEditManyToolCall }
  | FailedToolCallOutcome;

export function createStartedEditManyToolCallDetail(editManyToolCallRequest: EditManyToolCallRequest): ToolCallEditManyDetail {
  return createStartedToolCallDetailFromRequest(editManyToolCallRequest);
}

export async function prepareEditManyToolCall(input: {
  editManyToolCallRequest: EditManyToolCallRequest;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<EditManyToolPreparationOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedEditManyToolCallDetail(input.editManyToolCallRequest);

  try {
    throwIfEditManyToolAborted(input.abortSignal);
    const stagedFileEditsByAbsolutePath = new Map<string, StagedEditManyFileEdit>();
    for (const editManyToolCallEdit of input.editManyToolCallRequest.edits) {
      await stageEditManyToolCallEdit({
        editManyToolCallEdit,
        workspaceRootPath: input.workspaceRootPath,
        stagedFileEditsByAbsolutePath,
        abortSignal: input.abortSignal,
      });
    }

    const preparedFileEdits = [...stagedFileEditsByAbsolutePath.values()].filter((stagedFileEdit) =>
      stagedFileEdit.expectedFileText !== stagedFileEdit.nextFileText
    );
    if (preparedFileEdits.length === 0) {
      throw new Error("EditMany would not change any files");
    }

    const changedFiles = preparedFileEdits.map(buildEditManyWorkspacePatchFileDiff);
    const addedLineCount = changedFiles.reduce((sum, changedFile) => sum + changedFile.addedLineCount, 0);
    const removedLineCount = changedFiles.reduce((sum, changedFile) => sum + changedFile.removedLineCount, 0);
    const toolCallDetail: ToolCallEditManyDetail = {
      toolName: "edit_many",
      editCount: input.editManyToolCallRequest.edits.length,
      editedFileCount: changedFiles.length,
      addedLineCount,
      removedLineCount,
      changedFiles,
    };

    return {
      preparationKind: "prepared",
      preparedEditManyToolCall: {
        toolName: "edit_many",
        editCount: input.editManyToolCallRequest.edits.length,
        preparedFileEdits,
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
      toolResultText: `EditMany failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

export async function runPreparedEditManyToolCall(input: {
  preparedEditManyToolCall: PreparedEditManyToolCall;
  abortSignal?: AbortSignal;
  commitApprovedEditManyFile?: ApprovedEditManyFileCommitter;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const commitApprovedEditManyFile = input.commitApprovedEditManyFile ?? writeApprovedEditManyFile;

  try {
    throwIfEditManyToolAborted(input.abortSignal);
    for (const preparedFileEdit of input.preparedEditManyToolCall.preparedFileEdits) {
      const currentFileText = await readWorkspaceTextFile({
        absolutePath: preparedFileEdit.absolutePath,
        displayPath: preparedFileEdit.displayPath,
      });
      if (currentFileText !== preparedFileEdit.expectedFileText) {
        throw new Error(`File changed after edit_many approval preview: ${preparedFileEdit.displayPath}`);
      }
    }

    for (const preparedFileEdit of input.preparedEditManyToolCall.preparedFileEdits) {
      await commitApprovedEditManyFile({
        absolutePath: preparedFileEdit.absolutePath,
        nextFileText: preparedFileEdit.nextFileText,
      });
    }

    return {
      outcomeKind: "completed",
      toolCallDetail: input.preparedEditManyToolCall.toolCallDetail,
      toolResultText: buildCompletedEditManyToolResultText(input.preparedEditManyToolCall.toolCallDetail),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: input.preparedEditManyToolCall.toolCallDetail,
      failureExplanation,
      toolResultText: `EditMany failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

async function stageEditManyToolCallEdit(input: {
  editManyToolCallEdit: EditManyToolCallEdit;
  workspaceRootPath: string;
  stagedFileEditsByAbsolutePath: Map<string, StagedEditManyFileEdit>;
  abortSignal: AbortSignal | undefined;
}): Promise<void> {
  if (input.editManyToolCallEdit.oldString.length === 0) {
    throw new Error("Edit target text must not be empty");
  }
  if (input.editManyToolCallEdit.oldString === input.editManyToolCallEdit.newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }

  const resolvedEditPath = await resolveExistingWorkspacePath({
    workspaceRootPath: input.workspaceRootPath,
    requestedPath: input.editManyToolCallEdit.editTargetPath,
  });
  if (!resolvedEditPath.stats.isFile()) {
    throw new Error(`EditMany target must be a file: ${resolvedEditPath.displayPath}`);
  }
  throwIfEditManyToolAborted(input.abortSignal);

  const stagedFileEdit = input.stagedFileEditsByAbsolutePath.get(resolvedEditPath.absolutePath) ?? await createInitialStagedEditManyFileEdit({
    absolutePath: resolvedEditPath.absolutePath,
    displayPath: resolvedEditPath.displayPath,
  });
  const currentStagedFileText = stagedFileEdit.nextFileText;
  const matchCount = countExactOccurrences(currentStagedFileText, input.editManyToolCallEdit.oldString);
  if (matchCount === 0) {
    throw new Error(`EditMany target text was not found in ${resolvedEditPath.displayPath}`);
  }
  if (matchCount > 1 && input.editManyToolCallEdit.replaceAll !== true) {
    throw new Error(`EditMany target text matched ${matchCount} times in ${resolvedEditPath.displayPath}; make oldString more specific or set replaceAll`);
  }

  const nextFileText = input.editManyToolCallEdit.replaceAll === true
    ? currentStagedFileText.replaceAll(input.editManyToolCallEdit.oldString, input.editManyToolCallEdit.newString)
    : currentStagedFileText.replace(input.editManyToolCallEdit.oldString, input.editManyToolCallEdit.newString);
  input.stagedFileEditsByAbsolutePath.set(resolvedEditPath.absolutePath, {
    ...stagedFileEdit,
    nextFileText,
  });
}

async function createInitialStagedEditManyFileEdit(input: {
  absolutePath: string;
  displayPath: string;
}): Promise<StagedEditManyFileEdit> {
  const expectedFileText = await readWorkspaceTextFile({
    absolutePath: input.absolutePath,
    displayPath: input.displayPath,
  });
  return {
    absolutePath: input.absolutePath,
    displayPath: input.displayPath,
    expectedFileText,
    nextFileText: expectedFileText,
  };
}

function buildEditManyWorkspacePatchFileDiff(preparedFileEdit: PreparedEditManyFileEdit): WorkspacePatchFileDiff {
  const unifiedFileDiff = createUnifiedFileDiff({
    displayPath: preparedFileEdit.displayPath,
    beforeText: preparedFileEdit.expectedFileText,
    afterText: preparedFileEdit.nextFileText,
  });
  return {
    filePath: preparedFileEdit.displayPath,
    changeKind: "modified",
    addedLineCount: unifiedFileDiff.addedLineCount,
    removedLineCount: unifiedFileDiff.removedLineCount,
    unifiedDiffText: unifiedFileDiff.unifiedDiffText,
  };
}

async function writeApprovedEditManyFile(input: {
  absolutePath: string;
  nextFileText: string;
}): Promise<void> {
  await writeFile(input.absolutePath, input.nextFileText, "utf8");
}

function buildCompletedEditManyToolResultText(toolCallDetail: ToolCallEditManyDetail): string {
  const changedFileLines = toolCallDetail.changedFiles?.map((changedFile) =>
    `- ${changedFile.filePath} (+${changedFile.addedLineCount} -${changedFile.removedLineCount})`
  ) ?? [];
  return [
    `Edited files: ${toolCallDetail.editedFileCount ?? 0}`,
    `Edits: ${toolCallDetail.editCount}`,
    `Added lines: ${toolCallDetail.addedLineCount ?? 0}`,
    `Removed lines: ${toolCallDetail.removedLineCount ?? 0}`,
    ...changedFileLines,
  ].join("\n");
}

function countExactOccurrences(text: string, searchText: string): number {
  let occurrenceCount = 0;
  let searchStartIndex = 0;
  while (searchStartIndex <= text.length) {
    const matchIndex = text.indexOf(searchText, searchStartIndex);
    if (matchIndex < 0) {
      return occurrenceCount;
    }

    occurrenceCount += 1;
    searchStartIndex = matchIndex + searchText.length;
  }

  return occurrenceCount;
}

function throwIfEditManyToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("EditMany interrupted");
  }
}
