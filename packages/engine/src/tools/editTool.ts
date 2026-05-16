import { writeFile } from "node:fs/promises";
import {
  createStartedToolCallDetailFromRequest,
  type EditToolCallRequest,
  type ToolCallEditDetail,
} from "@buli/contracts";
import { createUnifiedFileDiff } from "./fileMutationDiff.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./toolCallOutcome.ts";
import { readWorkspaceTextFile } from "./workspaceTextFile.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";

export type PreparedEditToolCall = {
  toolName: "edit";
  absolutePath: string;
  displayPath: string;
  expectedFileText: string;
  nextFileText: string;
  toolCallDetail: ToolCallEditDetail;
};

export type EditToolPreparationOutcome =
  | { preparationKind: "prepared"; preparedEditToolCall: PreparedEditToolCall }
  | FailedToolCallOutcome;

export function createStartedEditToolCallDetail(editToolCallRequest: EditToolCallRequest): ToolCallEditDetail {
  return createStartedToolCallDetailFromRequest(editToolCallRequest);
}

export async function prepareEditToolCall(input: {
  editToolCallRequest: EditToolCallRequest;
  workspaceRootPath: string;
  abortSignal?: AbortSignal;
}): Promise<EditToolPreparationOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedEditToolCallDetail(input.editToolCallRequest);

  try {
    throwIfEditToolAborted(input.abortSignal);
    const resolvedEditPath = await resolveExistingWorkspacePath({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: input.editToolCallRequest.editTargetPath,
    });
    if (!resolvedEditPath.stats.isFile()) {
      throw new Error(`Edit target must be a file: ${resolvedEditPath.displayPath}`);
    }

    const currentFileText = await readWorkspaceTextFile({
      absolutePath: resolvedEditPath.absolutePath,
      displayPath: resolvedEditPath.displayPath,
    });
    throwIfEditToolAborted(input.abortSignal);

    const matchCount = countExactOccurrences(currentFileText, input.editToolCallRequest.oldString);
    if (matchCount === 0) {
      throw new Error(`Edit target text was not found in ${resolvedEditPath.displayPath}`);
    }
    if (matchCount > 1) {
      throw new Error(`Edit target text matched ${matchCount} times in ${resolvedEditPath.displayPath}; make oldString more specific`);
    }

    const nextFileText = currentFileText.replace(input.editToolCallRequest.oldString, input.editToolCallRequest.newString);
    if (nextFileText === currentFileText) {
      throw new Error(`Edit would not change ${resolvedEditPath.displayPath}`);
    }

    const unifiedFileDiff = createUnifiedFileDiff({
      displayPath: resolvedEditPath.displayPath,
      beforeText: currentFileText,
      afterText: nextFileText,
    });
    const toolCallDetail: ToolCallEditDetail = {
      toolName: "edit",
      editedFilePath: resolvedEditPath.displayPath,
      addedLineCount: unifiedFileDiff.addedLineCount,
      removedLineCount: unifiedFileDiff.removedLineCount,
      unifiedDiffText: unifiedFileDiff.unifiedDiffText,
    };

    return {
      preparationKind: "prepared",
      preparedEditToolCall: {
        toolName: "edit",
        absolutePath: resolvedEditPath.absolutePath,
        displayPath: resolvedEditPath.displayPath,
        expectedFileText: currentFileText,
        nextFileText,
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
      toolResultText: `Edit failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

export async function runPreparedEditToolCall(input: {
  preparedEditToolCall: PreparedEditToolCall;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();

  try {
    throwIfEditToolAborted(input.abortSignal);
    const currentFileText = await readWorkspaceTextFile({
      absolutePath: input.preparedEditToolCall.absolutePath,
      displayPath: input.preparedEditToolCall.displayPath,
    });
    if (currentFileText !== input.preparedEditToolCall.expectedFileText) {
      throw new Error(`File changed after edit approval preview: ${input.preparedEditToolCall.displayPath}`);
    }

    await writeFile(input.preparedEditToolCall.absolutePath, input.preparedEditToolCall.nextFileText, "utf8");
    throwIfEditToolAborted(input.abortSignal);

    return {
      outcomeKind: "completed",
      toolCallDetail: input.preparedEditToolCall.toolCallDetail,
      toolResultText: buildCompletedEditToolResultText(input.preparedEditToolCall.toolCallDetail),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: input.preparedEditToolCall.toolCallDetail,
      failureExplanation,
      toolResultText: `Edit failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

function buildCompletedEditToolResultText(toolCallDetail: ToolCallEditDetail): string {
  return [
    `Edited file: ${toolCallDetail.editedFilePath}`,
    `Added lines: ${toolCallDetail.addedLineCount ?? 0}`,
    `Removed lines: ${toolCallDetail.removedLineCount ?? 0}`,
    "Diff:",
    toolCallDetail.unifiedDiffText ?? "<not available>",
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

function throwIfEditToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Edit interrupted");
  }
}
