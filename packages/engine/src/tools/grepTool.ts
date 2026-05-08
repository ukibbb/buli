import { readFile } from "node:fs/promises";
import type { GrepToolCallRequest, ToolCallGrepDetail, ToolCallGrepMatch } from "@buli/contracts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";
import { listWorkspaceFiles, matchesWorkspaceGlobPattern, type WorkspaceSearchFile } from "./workspaceFileSearch.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";

const MAX_GREP_MATCH_HIT_COUNT = 100;
const MAX_LINE_LENGTH = 2_000;
const BINARY_SAMPLE_BYTE_COUNT = 4_096;

type GrepMatchSnippet = {
  matchSnippet: string;
  wasSnippetTruncated?: boolean;
};

export function createStartedGrepToolCallDetail(grepToolCallRequest: GrepToolCallRequest): ToolCallGrepDetail {
  return {
    toolName: "grep",
    searchPattern: grepToolCallRequest.regexPattern,
  };
}

export async function runGrepToolCall(input: {
  grepToolCallRequest: GrepToolCallRequest;
  workspaceRootPath: string;
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
    const searchableFiles = resolvedSearchPath.stats.isDirectory()
      ? (await listWorkspaceFiles({
          workspaceRootPath: input.workspaceRootPath,
          searchRootPath: resolvedSearchPath.absolutePath,
          ...(input.grepToolCallRequest.includeGlobPattern !== undefined
            ? { includeGlobPattern: input.grepToolCallRequest.includeGlobPattern }
            : {}),
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        })).files
      : await listSingleSearchableFile({
          workspaceRootPath: input.workspaceRootPath,
          resolvedSearchPath,
          includeGlobPattern: input.grepToolCallRequest.includeGlobPattern,
        });

    const matchHits: ToolCallGrepMatch[] = [];
    const matchedFilePaths = new Set<string>();
    let totalMatchCount = 0;
    let wasLongLineTruncated = false;
    for (const searchableFile of searchableFiles) {
      throwIfGrepToolAborted(input.abortSignal);
      const fileBytes = await readFile(searchableFile.absolutePath);
      if (isBinaryFileSample(fileBytes.subarray(0, BINARY_SAMPLE_BYTE_COUNT))) {
        continue;
      }

      const fileLines = splitFileTextIntoLines(fileBytes.toString("utf8"));
      for (let lineIndex = 0; lineIndex < fileLines.length; lineIndex += 1) {
        searchRegex.lastIndex = 0;
        if (!searchRegex.test(fileLines[lineIndex] ?? "")) {
          continue;
        }

        totalMatchCount += 1;
        matchedFilePaths.add(searchableFile.displayPath);
        if (matchHits.length < MAX_GREP_MATCH_HIT_COUNT) {
          const grepMatchSnippet = truncateLongLine(fileLines[lineIndex] ?? "");
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

    const wasTruncated = totalMatchCount > matchHits.length;

    const toolCallDetail: ToolCallGrepDetail = {
      toolName: "grep",
      searchPattern: input.grepToolCallRequest.regexPattern,
      matchedFileCount: matchedFilePaths.size,
      totalMatchCount,
      returnedMatchHitCount: matchHits.length,
      matchHits,
      wasTruncated,
      wasLongLineTruncated,
    };

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildGrepToolResultText({
        regexPattern: input.grepToolCallRequest.regexPattern,
        searchPath: resolvedSearchPath.displayPath,
        matchHits,
        matchedFileCount: matchedFilePaths.size,
        totalMatchCount,
        wasLongLineTruncated,
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

async function listSingleSearchableFile(input: {
  workspaceRootPath: string;
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

function buildGrepToolResultText(input: {
  regexPattern: string;
  searchPath: string;
  matchHits: readonly ToolCallGrepMatch[];
  matchedFileCount: number;
  totalMatchCount: number;
  wasLongLineTruncated: boolean;
}): string {
  if (input.totalMatchCount === 0) {
    return [
      `Pattern: ${input.regexPattern}`,
      `Path: ${input.searchPath}`,
      "No matches found",
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

  return outputLines.join("\n");
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
