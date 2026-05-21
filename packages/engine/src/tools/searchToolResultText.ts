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
      ? [`Results truncated: showing first ${input.matchedPaths.length} of ${input.totalMatchedPathCount} files`]
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
    ...(input.matchHits.length < input.totalMatchCount
      ? [`Results truncated: showing first ${input.matchHits.length} of ${input.totalMatchCount} matches`]
      : []),
  ];
  let currentFilePath = "";
  for (const matchHit of input.matchHits) {
    if (matchHit.matchFilePath !== currentFilePath) {
      currentFilePath = matchHit.matchFilePath;
      outputLines.push("", `${matchHit.matchFilePath}:`);
    }

    outputLines.push(`  Line ${matchHit.matchLineNumber}: ${matchHit.matchSnippet}`);
  }

  return outputLines.join("\n");
}
