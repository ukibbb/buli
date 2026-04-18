import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildPromptContextReferenceTextFromDisplayPath } from "./buildPromptContextReferenceTextFromDisplayPath.ts";
import type { PromptContextCandidate } from "./types.ts";

const DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT = 50;
const DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT = 2_000;

export async function listPromptContextCandidates(input: {
  promptContextBrowseRootPath: string;
  promptContextQueryText: string;
  maximumCandidateCount?: number;
  maximumSearchEntryCount?: number;
}): Promise<readonly PromptContextCandidate[]> {
  const maximumCandidateCount = input.maximumCandidateCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT;
  const maximumSearchEntryCount = input.maximumSearchEntryCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT;
  const normalizedPromptContextQueryText = normalizePromptContextQueryText(input.promptContextQueryText);

  const visiblePromptContextEntries = normalizedPromptContextQueryText.length === 0
    ? await listTopLevelPromptContextEntries(input.promptContextBrowseRootPath)
    : await listRecursivePromptContextEntries(input.promptContextBrowseRootPath, maximumSearchEntryCount);

  return visiblePromptContextEntries
    .filter((entry) => {
      if (normalizedPromptContextQueryText.length === 0) {
        return true;
      }

      return entry.displayPath.toLowerCase().includes(normalizedPromptContextQueryText.toLowerCase());
    })
    .sort((leftCandidate, rightCandidate) => comparePromptContextCandidates(leftCandidate, rightCandidate, normalizedPromptContextQueryText))
    .slice(0, maximumCandidateCount)
    .map((entry) => ({
      ...entry,
      promptReferenceText: buildPromptContextReferenceTextFromDisplayPath(entry.displayPath),
    }));
}

type PromptContextEntry = Omit<PromptContextCandidate, "promptReferenceText">;

async function listTopLevelPromptContextEntries(promptContextBrowseRootPath: string): Promise<PromptContextEntry[]> {
  const directoryEntries = await readdir(promptContextBrowseRootPath, { withFileTypes: true });
  return directoryEntries
    .filter((directoryEntry) => !directoryEntry.isSymbolicLink() && (directoryEntry.isFile() || directoryEntry.isDirectory()))
    .map((directoryEntry) => ({
      kind: directoryEntry.isDirectory() ? "directory" : "file",
      displayPath: directoryEntry.isDirectory() ? `${directoryEntry.name}/` : directoryEntry.name,
    }));
}

async function listRecursivePromptContextEntries(
  promptContextBrowseRootPath: string,
  maximumSearchEntryCount: number,
): Promise<PromptContextEntry[]> {
  const promptContextEntries: PromptContextEntry[] = [];

  async function visitDirectory(currentDirectoryPath: string, pathPrefix: string): Promise<void> {
    if (promptContextEntries.length >= maximumSearchEntryCount) {
      return;
    }

    const directoryEntries = await readdir(currentDirectoryPath, { withFileTypes: true });
    directoryEntries.sort((leftDirectoryEntry, rightDirectoryEntry) => leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name));

    for (const directoryEntry of directoryEntries) {
      if (promptContextEntries.length >= maximumSearchEntryCount) {
        return;
      }

      if (directoryEntry.isSymbolicLink()) {
        continue;
      }

      const displayPath = `${pathPrefix}${directoryEntry.name}${directoryEntry.isDirectory() ? "/" : ""}`;
      if (directoryEntry.isFile() || directoryEntry.isDirectory()) {
        promptContextEntries.push({
          kind: directoryEntry.isDirectory() ? "directory" : "file",
          displayPath,
        });
      }

      if (directoryEntry.isDirectory()) {
        await visitDirectory(join(currentDirectoryPath, directoryEntry.name), `${pathPrefix}${directoryEntry.name}/`);
      }
    }
  }

  await visitDirectory(promptContextBrowseRootPath, "");
  return promptContextEntries;
}

function normalizePromptContextQueryText(promptContextQueryText: string): string {
  const queryWithoutLeadingQuote = promptContextQueryText.startsWith('"')
    ? promptContextQueryText.slice(1)
    : promptContextQueryText;
  return queryWithoutLeadingQuote.replace(/\\([\\"\s])/g, "$1");
}

function comparePromptContextCandidates(
  leftCandidate: PromptContextEntry,
  rightCandidate: PromptContextEntry,
  normalizedPromptContextQueryText: string,
): number {
  const leftStartsWithQuery = normalizedPromptContextQueryText.length > 0
    && leftCandidate.displayPath.toLowerCase().startsWith(normalizedPromptContextQueryText.toLowerCase());
  const rightStartsWithQuery = normalizedPromptContextQueryText.length > 0
    && rightCandidate.displayPath.toLowerCase().startsWith(normalizedPromptContextQueryText.toLowerCase());
  if (leftStartsWithQuery !== rightStartsWithQuery) {
    return leftStartsWithQuery ? -1 : 1;
  }

  if (leftCandidate.kind !== rightCandidate.kind) {
    return leftCandidate.kind === "directory" ? -1 : 1;
  }

  const leftDepth = leftCandidate.displayPath.split("/").length;
  const rightDepth = rightCandidate.displayPath.split("/").length;
  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  return leftCandidate.displayPath.localeCompare(rightCandidate.displayPath);
}
