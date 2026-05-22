import {
  createStartedToolCallDetailFromRequest,
  type GlobToolCallRequest,
  type ToolCallGlobDetail,
} from "@buli/contracts";
import { buildGlobToolResultText } from "./searchToolResultText.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { listWorkspaceFiles } from "./workspaceFileSearch.ts";
import { assertSingleWorkspaceSearchPathArgument, resolveExistingWorkspacePath } from "./workspacePath.ts";
import { listWorkspaceFilesWithRipgrep } from "./workspaceRipgrepSearch.ts";

const MAX_RETURNED_GLOB_MATCHED_PATHS = 1_000;

export function createStartedGlobToolCallDetail(globToolCallRequest: GlobToolCallRequest): ToolCallGlobDetail {
  return createStartedToolCallDetailFromRequest(globToolCallRequest);
}

export async function runGlobToolCall(input: {
  globToolCallRequest: GlobToolCallRequest;
  workspaceRootPath: string;
  ripgrepExecutablePath?: string;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedGlobToolCallDetail(input.globToolCallRequest);

  try {
    const requestedSearchDirectoryPath = input.globToolCallRequest.searchDirectoryPath ?? ".";
    assertSingleWorkspaceSearchPathArgument({
      toolName: "Glob",
      pathKind: "directory",
      requestedPath: requestedSearchDirectoryPath,
      guidance: "Use one common parent path with the glob pattern, or make separate glob calls.",
    });
    const resolvedSearchPath = await resolveExistingWorkspacePath({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: requestedSearchDirectoryPath,
    });
    if (!resolvedSearchPath.stats.isDirectory()) {
      throw new Error(`Glob search path must be a directory: ${resolvedSearchPath.displayPath}`);
    }

    const ripgrepSearchAttempt = await listWorkspaceFilesWithRipgrep({
      workspaceRootPath: input.workspaceRootPath,
      searchRootPath: resolvedSearchPath.absolutePath,
      includeGlobPattern: input.globToolCallRequest.globPattern,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      ...(input.ripgrepExecutablePath ? { ripgrepExecutablePath: input.ripgrepExecutablePath } : {}),
    });
    const workspaceFiles = ripgrepSearchAttempt.attemptKind === "completed"
      ? ripgrepSearchAttempt.files
      : (await listWorkspaceFiles({
          workspaceRootPath: input.workspaceRootPath,
          searchRootPath: resolvedSearchPath.absolutePath,
          includeGlobPattern: input.globToolCallRequest.globPattern,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        })).files;
    const matchedFiles = workspaceFiles
      .sort((leftWorkspaceFile, rightWorkspaceFile) => {
        if (leftWorkspaceFile.stats.mtimeMs !== rightWorkspaceFile.stats.mtimeMs) {
          return rightWorkspaceFile.stats.mtimeMs - leftWorkspaceFile.stats.mtimeMs;
        }

        return leftWorkspaceFile.displayPath.localeCompare(rightWorkspaceFile.displayPath);
      });
    const totalMatchedPathCount = matchedFiles.length;
    const matchedPaths = matchedFiles
      .slice(0, MAX_RETURNED_GLOB_MATCHED_PATHS)
      .map((workspaceFile) => workspaceFile.displayPath);
    const toolCallDetail: ToolCallGlobDetail = {
      toolName: "glob",
      globPattern: input.globToolCallRequest.globPattern,
      searchDirectoryPath: resolvedSearchPath.displayPath,
      matchedPathCount: totalMatchedPathCount,
      returnedPathCount: matchedPaths.length,
      matchedPaths,
    };

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildGlobToolResultText({
        globPattern: input.globToolCallRequest.globPattern,
        searchDirectoryPath: resolvedSearchPath.displayPath,
        totalMatchedPathCount,
        matchedPaths,
      }),
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
      toolResultText: `Glob failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}
