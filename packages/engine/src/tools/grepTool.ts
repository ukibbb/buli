import { readFile } from "node:fs/promises";
import {
  createStartedToolCallDetailFromRequest,
  type GrepToolCallRequest,
  type ToolCallGrepDetail,
  type ToolCallGrepMatch,
} from "@buli/contracts";
import { buildGrepToolResultText } from "./searchToolResultText.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { listWorkspaceFiles, matchesWorkspaceGlobPattern, type WorkspaceSearchFile } from "./workspaceFileSearch.ts";
import { isLikelyBinaryFileSample, splitWorkspaceTextFileIntoLines } from "./workspaceTextFileContent.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";
import { searchWorkspaceFilesWithRipgrep } from "./workspaceRipgrepSearch.ts";

const BINARY_SAMPLE_BYTE_COUNT = 4_096;
const MAX_RETURNED_GREP_MATCH_HITS = 1_000;

export function createStartedGrepToolCallDetail(grepToolCallRequest: GrepToolCallRequest): ToolCallGrepDetail {
  return createStartedToolCallDetailFromRequest(grepToolCallRequest);
}

export async function runGrepToolCall(input: {
  grepToolCallRequest: GrepToolCallRequest;
  workspaceRootPath: string;
  ripgrepExecutablePath?: string;
  maximumRipgrepCapturedOutputCharacters?: number;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedGrepToolCallDetail(input.grepToolCallRequest);

  try {
    const resolvedSearchPath = await resolveExistingWorkspacePath({
      workspaceRootPath: input.workspaceRootPath,
      requestedPath: input.grepToolCallRequest.searchPath ?? ".",
    });
    if (!resolvedSearchPath.stats.isFile() && !resolvedSearchPath.stats.isDirectory()) {
      throw new Error(`Grep search path must be a file or directory: ${resolvedSearchPath.displayPath}`);
    }

    const canSearchWithRipgrep = resolvedSearchPath.stats.isDirectory()
      || matchesSingleFileIncludeGlob({
        displayPath: resolvedSearchPath.displayPath,
        includeGlobPattern: input.grepToolCallRequest.includeGlobPattern,
      });
    const ripgrepSearchAttempt = canSearchWithRipgrep
      ? await searchWorkspaceFilesWithRipgrep({
          workspaceRootPath: input.workspaceRootPath,
          searchPath: resolvedSearchPath.absolutePath,
          isSearchPathDirectory: resolvedSearchPath.stats.isDirectory(),
          regexPattern: input.grepToolCallRequest.regexPattern,
          ...(resolvedSearchPath.stats.isDirectory() && input.grepToolCallRequest.includeGlobPattern !== undefined
            ? { includeGlobPattern: input.grepToolCallRequest.includeGlobPattern }
            : {}),
          ...(input.ripgrepExecutablePath ? { ripgrepExecutablePath: input.ripgrepExecutablePath } : {}),
          ...(input.maximumRipgrepCapturedOutputCharacters !== undefined
            ? { maximumCapturedOutputCharacters: input.maximumRipgrepCapturedOutputCharacters }
            : {}),
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        })
      : undefined;
    if (
      ripgrepSearchAttempt?.attemptKind !== "completed" &&
      hasPotentiallyCatastrophicJavaScriptRegexPattern(input.grepToolCallRequest.regexPattern)
    ) {
      throw new Error("Grep fallback cannot safely evaluate this regex pattern without ripgrep. Install ripgrep or simplify the pattern.");
    }
    const grepSearchResult = ripgrepSearchAttempt?.attemptKind === "completed"
      ? buildGrepSearchResultFromRipgrepMatches(ripgrepSearchAttempt)
      : await searchWorkspaceFilesWithJavaScriptRegex({
          workspaceRootPath: input.workspaceRootPath,
          resolvedSearchPath,
          includeGlobPattern: input.grepToolCallRequest.includeGlobPattern,
          searchRegex: new RegExp(input.grepToolCallRequest.regexPattern),
          abortSignal: input.abortSignal,
        });
    const matchHits = grepSearchResult.matchHits;
    const totalMatchCount = grepSearchResult.totalMatchCount;

    const toolCallDetail: ToolCallGrepDetail = {
      toolName: "grep",
      searchPattern: input.grepToolCallRequest.regexPattern,
      matchedFileCount: grepSearchResult.matchedFileCount,
      totalMatchCount,
      returnedMatchHitCount: matchHits.length,
      matchHits,
    };

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildGrepToolResultText({
        regexPattern: input.grepToolCallRequest.regexPattern,
        searchPath: resolvedSearchPath.displayPath,
        matchHits,
        matchedFileCount: grepSearchResult.matchedFileCount,
        totalMatchCount,
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
      toolResultText: `Grep failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

function hasPotentiallyCatastrophicJavaScriptRegexPattern(regexPattern: string): boolean {
  return /\([^)]*[+*][^)]*\)\s*[+*?]/.test(regexPattern) || /\([^)]*[+*][^)]*\)\s*\{/.test(regexPattern);
}

type GrepSearchResult = {
  matchHits: ToolCallGrepMatch[];
  matchedFileCount: number;
  totalMatchCount: number;
};

function buildGrepSearchResultFromRipgrepMatches(
  input: Extract<Awaited<ReturnType<typeof searchWorkspaceFilesWithRipgrep>>, { attemptKind: "completed" }>,
): GrepSearchResult {
  return {
    matchHits: input.matches
      .slice(0, MAX_RETURNED_GREP_MATCH_HITS)
      .map((match) => ({
        matchFilePath: match.matchFilePath,
        matchLineNumber: match.matchLineNumber,
        matchSnippet: match.matchSnippet,
      })),
    matchedFileCount: input.matchedFilePaths.size,
    totalMatchCount: input.matches.length,
  };
}

async function searchWorkspaceFilesWithJavaScriptRegex(input: {
  workspaceRootPath: string;
  resolvedSearchPath: { absolutePath: string; displayPath: string; stats: WorkspaceSearchFile["stats"] };
  includeGlobPattern: string | undefined;
  searchRegex: RegExp;
  abortSignal: AbortSignal | undefined;
}): Promise<GrepSearchResult> {
  const searchableFileListing = input.resolvedSearchPath.stats.isDirectory()
    ? await listWorkspaceFiles({
        workspaceRootPath: input.workspaceRootPath,
        searchRootPath: input.resolvedSearchPath.absolutePath,
        ...(input.includeGlobPattern !== undefined ? { includeGlobPattern: input.includeGlobPattern } : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      })
    : {
        files: await listSingleSearchableFile({
          resolvedSearchPath: input.resolvedSearchPath,
          includeGlobPattern: input.includeGlobPattern,
        }),
      };
  const searchableFiles = searchableFileListing.files.sort((leftSearchableFile, rightSearchableFile) => {
    if (leftSearchableFile.stats.mtimeMs !== rightSearchableFile.stats.mtimeMs) {
      return rightSearchableFile.stats.mtimeMs - leftSearchableFile.stats.mtimeMs;
    }

    return leftSearchableFile.displayPath.localeCompare(rightSearchableFile.displayPath);
  });

  const matchHits: ToolCallGrepMatch[] = [];
  const matchedFilePaths = new Set<string>();
  let totalMatchCount = 0;
  for (const searchableFile of searchableFiles) {
    throwIfGrepToolAborted(input.abortSignal);
    const fileBytes = await readFile(searchableFile.absolutePath);
    if (isLikelyBinaryFileSample(fileBytes.subarray(0, BINARY_SAMPLE_BYTE_COUNT))) {
      continue;
    }

    const fileLines = splitWorkspaceTextFileIntoLines(fileBytes.toString("utf8"));
    for (let lineIndex = 0; lineIndex < fileLines.length; lineIndex += 1) {
      const lineText = fileLines[lineIndex] ?? "";
      input.searchRegex.lastIndex = 0;
      if (!input.searchRegex.test(lineText)) {
        continue;
      }

      totalMatchCount += 1;
      matchedFilePaths.add(searchableFile.displayPath);
      if (matchHits.length < MAX_RETURNED_GREP_MATCH_HITS) {
        matchHits.push({
          matchFilePath: searchableFile.displayPath,
          matchLineNumber: lineIndex + 1,
          matchSnippet: lineText,
        });
      }
    }
  }

  return {
    matchHits,
    matchedFileCount: matchedFilePaths.size,
    totalMatchCount,
  };
}

async function listSingleSearchableFile(input: {
  resolvedSearchPath: { absolutePath: string; displayPath: string; stats: WorkspaceSearchFile["stats"] };
  includeGlobPattern: string | undefined;
}): Promise<WorkspaceSearchFile[]> {
  if (!input.resolvedSearchPath.stats.isFile()) {
    throw new Error(`Grep search path must be a file or directory: ${input.resolvedSearchPath.displayPath}`);
  }
  if (
    input.includeGlobPattern &&
    !matchesWorkspaceGlobPattern({
      globPattern: input.includeGlobPattern,
      portableRelativePath: input.resolvedSearchPath.displayPath,
    })
  ) {
    return [];
  }

  return [{
    absolutePath: input.resolvedSearchPath.absolutePath,
    displayPath: input.resolvedSearchPath.displayPath,
    stats: input.resolvedSearchPath.stats,
  }];
}

function matchesSingleFileIncludeGlob(input: {
  displayPath: string;
  includeGlobPattern: string | undefined;
}): boolean {
  if (!input.includeGlobPattern) {
    return true;
  }

  return matchesWorkspaceGlobPattern({
    globPattern: input.includeGlobPattern,
    portableRelativePath: input.displayPath,
  });
}

function throwIfGrepToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Grep interrupted");
  }
}
