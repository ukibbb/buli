import {
  createStartedToolCallDetailFromRequest,
  type GlobToolCallRequest,
  type ToolCallGlobDetail,
} from "@buli/contracts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { listWorkspaceFiles } from "./workspaceFileSearch.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";
import { listWorkspaceFilesWithRipgrep } from "./workspaceRipgrepSearch.ts";

const MAX_GLOB_RESULT_COUNT = 100;

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
    const resolvedSearchPath = await resolveExistingWorkspacePath({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: input.globToolCallRequest.searchDirectoryPath ?? ".",
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
    const wasTruncated = totalMatchedPathCount > MAX_GLOB_RESULT_COUNT;
    const visibleMatchedFiles = matchedFiles.slice(0, MAX_GLOB_RESULT_COUNT);
    const matchedPaths = visibleMatchedFiles.map((workspaceFile) => workspaceFile.displayPath);
    const toolCallDetail: ToolCallGlobDetail = {
      toolName: "glob",
      globPattern: input.globToolCallRequest.globPattern,
      searchDirectoryPath: resolvedSearchPath.displayPath,
      matchedPathCount: totalMatchedPathCount,
      returnedPathCount: matchedPaths.length,
      matchedPaths,
      wasTruncated,
    };

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildGlobToolResultText({
        globPattern: input.globToolCallRequest.globPattern,
        searchDirectoryPath: resolvedSearchPath.displayPath,
        totalMatchedPathCount,
        matchedPaths,
        wasTruncated,
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

function buildGlobToolResultText(input: {
  globPattern: string;
  searchDirectoryPath: string;
  totalMatchedPathCount: number;
  matchedPaths: readonly string[];
  wasTruncated: boolean;
}): string {
  if (input.totalMatchedPathCount === 0) {
    return [
      `Pattern: ${input.globPattern}`,
      `Directory: ${input.searchDirectoryPath}`,
      "No files found",
    ].join("\n");
  }

  return [
    `Pattern: ${input.globPattern}`,
    `Directory: ${input.searchDirectoryPath}`,
    `Found ${input.totalMatchedPathCount} files${input.wasTruncated ? ` (showing first ${input.matchedPaths.length})` : ""}`,
    ...input.matchedPaths,
    ...(input.wasTruncated ? ["", "(Results truncated. Use a more specific path or pattern.)"] : []),
  ].join("\n");
}
