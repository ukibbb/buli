import type { ToolCallGrepMatch } from "@buli/contracts";

export function buildGlobToolResultText(input: {
  globPattern: string;
  searchDirectoryPath: string;
  totalMatchedPathCount: number;
  matchedPaths: readonly string[];
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
    `Found ${input.totalMatchedPathCount} files`,
    ...(input.matchedPaths.length < input.totalMatchedPathCount
      ? [
          `Results too broad/incomplete: showing first ${input.matchedPaths.length} of ${input.totalMatchedPathCount} files. This search result cannot support absence or completeness claims; narrow the directory or glob pattern, or run batched follow-up glob calls, before making conclusions about absence or coverage.`,
        ]
      : []),
    ...input.matchedPaths,
  ].join("\n");
}

export function buildGrepToolResultText(input: {
  regexPattern: string;
  searchPath: string;
  matchHits: readonly ToolCallGrepMatch[];
  matchedFileCount: number;
  totalMatchCount: number;
  contextLineCount?: number | undefined;
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
    ...(input.contextLineCount !== undefined && input.contextLineCount > 0
      ? [`Context: ${input.contextLineCount} lines before and after each returned match`]
      : []),
    `Found ${input.totalMatchCount} matches in ${input.matchedFileCount} files`,
    ...(input.matchHits.length < input.totalMatchCount
      ? [
          `Results too broad/incomplete: showing first ${input.matchHits.length} of ${input.totalMatchCount} matches. This search result cannot support absence or completeness claims; narrow the path, regex, include glob, or context before making conclusions about absence or coverage.`,
        ]
      : []),
  ];
  let currentFilePath = "";
  for (const matchHit of input.matchHits) {
    if (matchHit.matchFilePath !== currentFilePath) {
      currentFilePath = matchHit.matchFilePath;
      outputLines.push("", `${matchHit.matchFilePath}:`);
    }

    outputLines.push(...formatGrepMatchOutputLines(matchHit));
  }

  return outputLines.join("\n");
}

function formatGrepMatchOutputLines(matchHit: ToolCallGrepMatch): string[] {
  const hasContextLines = (matchHit.contextBeforeLines?.length ?? 0) > 0 || (matchHit.contextAfterLines?.length ?? 0) > 0;
  if (!hasContextLines) {
    return [`  Line ${matchHit.matchLineNumber}: ${matchHit.matchSnippet}`];
  }

  return [
    ...(matchHit.contextBeforeLines ?? []).map((contextLine) => `  Line ${contextLine.lineNumber}: ${contextLine.lineText}`),
    `> Line ${matchHit.matchLineNumber}: ${matchHit.matchSnippet}`,
    ...(matchHit.contextAfterLines ?? []).map((contextLine) => `  Line ${contextLine.lineNumber}: ${contextLine.lineText}`),
  ];
}
