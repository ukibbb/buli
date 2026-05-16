import { readFile } from "node:fs/promises";
import {
  createStartedToolCallDetailFromRequest,
  type GrepToolCallRequest,
  type ToolCallGrepDetail,
  type ToolCallGrepMatch,
} from "@buli/contracts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { listWorkspaceFiles, matchesWorkspaceGlobPattern, type WorkspaceSearchFile } from "./workspaceFileSearch.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";
import { searchWorkspaceFilesWithRipgrep } from "./workspaceRipgrepSearch.ts";

const MAX_GREP_MATCH_HIT_COUNT = 100;
const MAX_GREP_SEARCH_FILE_COUNT = 10_000;
const MAX_GREP_FILE_BYTE_COUNT = 1_000_000;
const MAX_LINE_LENGTH = 2_000;
const BINARY_SAMPLE_BYTE_COUNT = 4_096;

type GrepMatchSnippet = {
  matchSnippet: string;
  wasSnippetTruncated?: boolean;
};

export function createStartedGrepToolCallDetail(grepToolCallRequest: GrepToolCallRequest): ToolCallGrepDetail {
  return createStartedToolCallDetailFromRequest(grepToolCallRequest);
}

export async function runGrepToolCall(input: {
  grepToolCallRequest: GrepToolCallRequest;
  workspaceRootPath: string;
  ripgrepExecutablePath?: string;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedGrepToolCallDetail(input.grepToolCallRequest);

  try {
    const searchRegex = new RegExp(input.grepToolCallRequest.regexPattern);
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
          maximumSearchFileCount: MAX_GREP_SEARCH_FILE_COUNT,
          maximumFileByteCount: MAX_GREP_FILE_BYTE_COUNT,
          ...(resolvedSearchPath.stats.isDirectory() && input.grepToolCallRequest.includeGlobPattern !== undefined
            ? { includeGlobPattern: input.grepToolCallRequest.includeGlobPattern }
            : {}),
          ...(input.ripgrepExecutablePath ? { ripgrepExecutablePath: input.ripgrepExecutablePath } : {}),
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        })
      : undefined;
    const grepSearchResult = ripgrepSearchAttempt?.attemptKind === "completed"
      ? buildGrepSearchResultFromRipgrepMatches(ripgrepSearchAttempt)
      : await searchWorkspaceFilesWithJavaScriptRegex({
          workspaceRootPath: input.workspaceRootPath,
          resolvedSearchPath,
          includeGlobPattern: input.grepToolCallRequest.includeGlobPattern,
          searchRegex,
          abortSignal: input.abortSignal,
        });
    const matchHits = grepSearchResult.matchHits.slice(0, MAX_GREP_MATCH_HIT_COUNT);
    const totalMatchCount = grepSearchResult.totalMatchCount;
    const wasTruncated = totalMatchCount > matchHits.length
      || grepSearchResult.wasSearchFileCountTruncated
      || grepSearchResult.skippedLargeFileCount > 0;

    const toolCallDetail: ToolCallGrepDetail = {
      toolName: "grep",
      searchPattern: input.grepToolCallRequest.regexPattern,
      matchedFileCount: grepSearchResult.matchedFileCount,
      totalMatchCount,
      returnedMatchHitCount: matchHits.length,
      matchHits,
      wasTruncated,
      wasLongLineTruncated: grepSearchResult.wasLongLineTruncated,
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
        wasLongLineTruncated: grepSearchResult.wasLongLineTruncated,
        wasSearchFileCountTruncated: grepSearchResult.wasSearchFileCountTruncated,
        skippedLargeFileCount: grepSearchResult.skippedLargeFileCount,
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

type GrepSearchResult = {
  matchHits: ToolCallGrepMatch[];
  matchedFileCount: number;
  totalMatchCount: number;
  wasLongLineTruncated: boolean;
  wasSearchFileCountTruncated: boolean;
  skippedLargeFileCount: number;
};

function buildGrepSearchResultFromRipgrepMatches(
  input: Extract<Awaited<ReturnType<typeof searchWorkspaceFilesWithRipgrep>>, { attemptKind: "completed" }>,
): GrepSearchResult {
  return {
    matchHits: input.matches.map((match) => ({
      matchFilePath: match.matchFilePath,
      matchLineNumber: match.matchLineNumber,
      matchSnippet: match.matchSnippet,
      ...(match.wasSnippetTruncated ? { wasSnippetTruncated: true } : {}),
    })),
    matchedFileCount: input.matchedFilePaths.size,
    totalMatchCount: input.matches.length,
    wasLongLineTruncated: input.wasLongLineTruncated,
    wasSearchFileCountTruncated: input.wasSearchFileCountTruncated,
    skippedLargeFileCount: input.skippedLargeFileCount,
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
        maximumFileCount: MAX_GREP_SEARCH_FILE_COUNT,
        ...(input.includeGlobPattern !== undefined ? { includeGlobPattern: input.includeGlobPattern } : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      })
    : {
        files: await listSingleSearchableFile({
          resolvedSearchPath: input.resolvedSearchPath,
          includeGlobPattern: input.includeGlobPattern,
        }),
        wasTruncated: false,
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
  let wasLongLineTruncated = false;
  let skippedLargeFileCount = 0;
  for (const searchableFile of searchableFiles) {
    throwIfGrepToolAborted(input.abortSignal);
    if (searchableFile.stats.size > MAX_GREP_FILE_BYTE_COUNT) {
      skippedLargeFileCount += 1;
      continue;
    }
    const fileBytes = await readFile(searchableFile.absolutePath);
    if (isBinaryFileSample(fileBytes.subarray(0, BINARY_SAMPLE_BYTE_COUNT))) {
      continue;
    }

    const fileLines = splitFileTextIntoLines(fileBytes.toString("utf8"));
    for (let lineIndex = 0; lineIndex < fileLines.length; lineIndex += 1) {
      const lineText = fileLines[lineIndex] ?? "";
      const searchableLineText = lineText.length > MAX_LINE_LENGTH ? lineText.slice(0, MAX_LINE_LENGTH) : lineText;
      if (searchableLineText.length !== lineText.length) {
        wasLongLineTruncated = true;
      }
      input.searchRegex.lastIndex = 0;
      if (!input.searchRegex.test(searchableLineText)) {
        continue;
      }

      totalMatchCount += 1;
      matchedFilePaths.add(searchableFile.displayPath);
      if (matchHits.length < MAX_GREP_MATCH_HIT_COUNT) {
        const grepMatchSnippet = truncateLongLine(lineText);
        if (grepMatchSnippet.wasSnippetTruncated) {
          wasLongLineTruncated = true;
        }
        matchHits.push({
          matchFilePath: searchableFile.displayPath,
          matchLineNumber: lineIndex + 1,
          matchSnippet: grepMatchSnippet.matchSnippet,
          ...(grepMatchSnippet.wasSnippetTruncated ? { wasSnippetTruncated: true } : {}),
        });
      }
    }
  }

  return {
    matchHits,
    matchedFileCount: matchedFilePaths.size,
    totalMatchCount,
    wasLongLineTruncated,
    wasSearchFileCountTruncated: searchableFileListing.wasTruncated,
    skippedLargeFileCount,
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

function buildGrepToolResultText(input: {
  regexPattern: string;
  searchPath: string;
  matchHits: readonly ToolCallGrepMatch[];
  matchedFileCount: number;
  totalMatchCount: number;
  wasLongLineTruncated: boolean;
  wasSearchFileCountTruncated: boolean;
  skippedLargeFileCount: number;
}): string {
  const safetyNotes = buildGrepSafetyNoteLines(input);
  if (input.totalMatchCount === 0) {
    return [
      `Pattern: ${input.regexPattern}`,
      `Path: ${input.searchPath}`,
      "No matches found",
      ...safetyNotes,
    ].join("\n");
  }

  const outputLines = [
    `Pattern: ${input.regexPattern}`,
    `Path: ${input.searchPath}`,
    `Found ${input.totalMatchCount} matches in ${input.matchedFileCount} files`,
  ];
  let currentFilePath = "";
  for (const matchHit of input.matchHits) {
    if (matchHit.matchFilePath !== currentFilePath) {
      currentFilePath = matchHit.matchFilePath;
      outputLines.push("", `${matchHit.matchFilePath}:`);
    }

    outputLines.push(`  Line ${matchHit.matchLineNumber}: ${matchHit.matchSnippet}`);
  }
  if (input.totalMatchCount > input.matchHits.length) {
    outputLines.push("", `(Results truncated: showing ${input.matchHits.length} of ${input.totalMatchCount} matches.)`);
  }
  if (input.wasLongLineTruncated) {
    outputLines.push("", `(Long match snippets were truncated to ${MAX_LINE_LENGTH} characters.)`);
  }
  outputLines.push(...safetyNotes);

  return outputLines.join("\n");
}

function buildGrepSafetyNoteLines(input: {
  wasSearchFileCountTruncated: boolean;
  skippedLargeFileCount: number;
}): string[] {
  const safetyNotes: string[] = [];
  if (input.wasSearchFileCountTruncated) {
    safetyNotes.push("", `(Search was limited to the first ${MAX_GREP_SEARCH_FILE_COUNT} files.)`);
  }
  if (input.skippedLargeFileCount > 0) {
    safetyNotes.push(
      "",
      `(Skipped ${input.skippedLargeFileCount} files larger than ${MAX_GREP_FILE_BYTE_COUNT} bytes.)`,
    );
  }

  return safetyNotes;
}

function splitFileTextIntoLines(fileText: string): string[] {
  const lines = fileText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function truncateLongLine(lineText: string): GrepMatchSnippet {
  return lineText.length <= MAX_LINE_LENGTH
    ? { matchSnippet: lineText }
    : { matchSnippet: `${lineText.slice(0, MAX_LINE_LENGTH)}...`, wasSnippetTruncated: true };
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

function throwIfGrepToolAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Grep interrupted");
  }
}
