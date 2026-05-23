import type { Dirent } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  normalizePromptContextQueryText,
  parsePromptContextPathQuery,
  type PromptContextCandidate,
  type PromptContextPathQuery,
} from "@buli/prompt-context-core";
export {
  determinePromptContextQueryLoadStrategy,
  normalizePromptContextQueryText,
  parsePromptContextPathQuery,
} from "@buli/prompt-context-core";
export type { PromptContextPathQuery, PromptContextQueryLoadStrategy } from "@buli/prompt-context-core";
import { buildPromptContextReferenceTextFromDisplayPath } from "./buildPromptContextReferenceTextFromDisplayPath.ts";
import {
  buildPromptContextDisplayPathFromAbsolutePath,
  isPathInsidePromptContextBrowseRoot,
  resolvePromptContextPathFromReference,
  resolvePromptContextPathScope,
  type PromptContextPathScope,
} from "./promptContextPathScope.ts";

export const DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT = 50;
export const DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT = 2_000;

// Fuzzy search should not spend its limited traversal budget inside generated dependency trees.
const RECURSIVE_PROMPT_CONTEXT_IGNORED_DIRECTORY_NAMES = new Set<string>([
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".svelte-kit",
  ".turbo",
  ".venv",
  ".vite",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "venv",
]);

export async function listPromptContextCandidates(input: {
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath?: string;
  promptContextQueryText: string;
  maximumCandidateCount?: number;
  maximumSearchEntryCount?: number;
}): Promise<readonly PromptContextCandidate[]> {
  const maximumCandidateCount = input.maximumCandidateCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT;
  const maximumSearchEntryCount = input.maximumSearchEntryCount ?? DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT;
  const normalizedPromptContextQueryText = normalizePromptContextQueryText(input.promptContextQueryText);
  const promptContextPathScope = await resolvePromptContextPathScope({
    promptContextBrowseRootPath: input.promptContextBrowseRootPath,
    ...(input.promptContextStartingDirectoryPath
      ? { promptContextStartingDirectoryPath: input.promptContextStartingDirectoryPath }
      : {}),
  });

  const promptContextPathQuery = parsePromptContextPathQuery(normalizedPromptContextQueryText);

  const visiblePromptContextEntries = normalizedPromptContextQueryText.length === 0
    ? await listCurrentDirectoryPromptContextEntries({ promptContextPathScope })
    : promptContextPathQuery
      ? await listPromptContextPathQueryEntries({
          promptContextPathQuery,
          promptContextPathScope,
        })
      : await listFuzzyPromptContextEntries({
          promptContextPathScope,
          maximumSearchEntryCount,
          promptContextQueryText: normalizedPromptContextQueryText,
        });

  return filterAndSortPromptContextEntries({
    promptContextEntries: visiblePromptContextEntries,
    promptContextQueryText: normalizedPromptContextQueryText,
    maximumCandidateCount,
    promptContextStartingDirectoryPath: promptContextPathScope.promptContextStartingDirectoryPath,
    treatsEntriesAsPathQueryResults: promptContextPathQuery !== undefined,
  });
}

export type PromptContextEntry = Omit<PromptContextCandidate, "promptReferenceText"> & {
  absolutePath: string;
};

export async function listCurrentDirectoryPromptContextEntries(input: {
  promptContextPathScope: PromptContextPathScope;
}): Promise<PromptContextEntry[]> {
  return listDirectoryPromptContextEntries({
    directoryPath: input.promptContextPathScope.promptContextStartingDirectoryPath,
    promptContextPathScope: input.promptContextPathScope,
  });
}

async function listDirectoryPromptContextEntries(input: {
  directoryPath: string;
  promptContextPathScope: PromptContextPathScope;
  entryNameQuery?: string;
}): Promise<PromptContextEntry[]> {
  const directoryEntries = await readdir(input.directoryPath, { withFileTypes: true });
  return directoryEntries
    .filter((directoryEntry) => !directoryEntry.isSymbolicLink() && (directoryEntry.isFile() || directoryEntry.isDirectory()))
    .filter((directoryEntry) => {
      if (!input.entryNameQuery) {
        return true;
      }

      return directoryEntry.name.toLowerCase().includes(input.entryNameQuery.toLowerCase());
    })
    .map((directoryEntry) => ({
      kind: directoryEntry.isDirectory() ? "directory" : "file",
      absolutePath: join(input.directoryPath, directoryEntry.name),
      displayPath: buildPromptContextDisplayPathFromAbsolutePath({
        absolutePath: join(input.directoryPath, directoryEntry.name),
        promptContextStartingDirectoryPath: input.promptContextPathScope.promptContextStartingDirectoryPath,
        isDirectory: directoryEntry.isDirectory(),
      }),
    }));
}

export async function listRecursivePromptContextEntries(input: {
  promptContextPathScope: PromptContextPathScope;
  maximumSearchEntryCount: number;
  recursiveSearchRootPath?: string;
  promptContextQueryText?: string;
  excludedDescendantDirectoryPaths?: readonly string[];
}): Promise<PromptContextEntry[]> {
  const promptContextEntries: PromptContextEntry[] = [];
  const recursiveSearchRootPath = input.recursiveSearchRootPath ?? input.promptContextPathScope.promptContextBrowseRootPath;
  const normalizedPromptContextQueryText = input.promptContextQueryText
    ? normalizePromptContextQueryText(input.promptContextQueryText)
    : "";
  const normalizedPromptContextQueryTextLowerCase = normalizedPromptContextQueryText.toLowerCase();
  const excludedDescendantDirectoryPaths = input.excludedDescendantDirectoryPaths ?? [];
  let searchedPromptContextEntryCount = 0;

  const directoryPathsToVisit = [recursiveSearchRootPath];
  let directoryVisitIndex = 0;

  while (
    directoryVisitIndex < directoryPathsToVisit.length && searchedPromptContextEntryCount < input.maximumSearchEntryCount
  ) {
    const currentDirectoryPath = directoryPathsToVisit[directoryVisitIndex];
    directoryVisitIndex += 1;
    if (!currentDirectoryPath) {
      continue;
    }

    const directoryEntries = await readPromptContextDirectoryEntriesIfAccessible(currentDirectoryPath);
    if (!directoryEntries) {
      continue;
    }

    directoryEntries.sort((leftDirectoryEntry, rightDirectoryEntry) => leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name));

    for (const directoryEntry of directoryEntries) {
      if (searchedPromptContextEntryCount >= input.maximumSearchEntryCount) {
        return promptContextEntries;
      }

      if (directoryEntry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = join(currentDirectoryPath, directoryEntry.name);
      if (directoryEntry.isFile() || directoryEntry.isDirectory()) {
        searchedPromptContextEntryCount += 1;
        const displayPath = buildPromptContextDisplayPathFromAbsolutePath({
          absolutePath,
          promptContextStartingDirectoryPath: input.promptContextPathScope.promptContextStartingDirectoryPath,
          isDirectory: directoryEntry.isDirectory(),
        });
        const promptContextEntry: PromptContextEntry = {
          kind: directoryEntry.isDirectory() ? "directory" : "file",
          absolutePath,
          displayPath,
        };
        if (
          doesPromptContextEntryMatchQuery({
            promptContextEntry,
            normalizedPromptContextQueryTextLowerCase,
          })
        ) {
          promptContextEntries.push(promptContextEntry);
        }
      }

      if (
        directoryEntry.isDirectory() && !shouldSkipRecursivePromptContextDirectoryDescendants({
          directoryName: directoryEntry.name,
          directoryPath: absolutePath,
          excludedDescendantDirectoryPaths,
        })
      ) {
        directoryPathsToVisit.push(absolutePath);
      }
    }
  }

  return promptContextEntries;
}

async function readPromptContextDirectoryEntriesIfAccessible(directoryPath: string): Promise<Dirent[] | undefined> {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return undefined;
  }
}

export async function listFuzzyPromptContextEntries(input: {
  promptContextPathScope: PromptContextPathScope;
  maximumSearchEntryCount: number;
  promptContextQueryText: string;
}): Promise<PromptContextEntry[]> {
  const promptContextEntries: PromptContextEntry[] = [];
  const seenPromptContextAbsolutePaths = new Set<string>();

  async function appendPromptContextEntriesFromRoot(appendInput: {
    recursiveSearchRootPath: string;
    excludedDescendantDirectoryPaths?: readonly string[];
  }): Promise<void> {
    if (promptContextEntries.length >= input.maximumSearchEntryCount) {
      return;
    }

    const candidatePromptContextEntries = await listRecursivePromptContextEntries({
      promptContextPathScope: input.promptContextPathScope,
      maximumSearchEntryCount: input.maximumSearchEntryCount - promptContextEntries.length,
      recursiveSearchRootPath: appendInput.recursiveSearchRootPath,
      promptContextQueryText: input.promptContextQueryText,
      ...(appendInput.excludedDescendantDirectoryPaths
        ? { excludedDescendantDirectoryPaths: appendInput.excludedDescendantDirectoryPaths }
        : {}),
    });

    for (const promptContextEntry of candidatePromptContextEntries) {
      if (seenPromptContextAbsolutePaths.has(promptContextEntry.absolutePath)) {
        continue;
      }

      seenPromptContextAbsolutePaths.add(promptContextEntry.absolutePath);
      promptContextEntries.push(promptContextEntry);
      if (promptContextEntries.length >= input.maximumSearchEntryCount) {
        return;
      }
    }
  }

  await appendPromptContextEntriesFromRoot({
    recursiveSearchRootPath: input.promptContextPathScope.promptContextStartingDirectoryPath,
  });
  if (input.promptContextPathScope.promptContextStartingDirectoryPath !== input.promptContextPathScope.promptContextBrowseRootPath) {
    await appendPromptContextEntriesFromRoot({
      recursiveSearchRootPath: input.promptContextPathScope.promptContextBrowseRootPath,
      excludedDescendantDirectoryPaths: [input.promptContextPathScope.promptContextStartingDirectoryPath],
    });
  }

  return promptContextEntries;
}

function doesPromptContextEntryMatchQuery(input: {
  promptContextEntry: PromptContextEntry;
  normalizedPromptContextQueryTextLowerCase: string;
}): boolean {
  if (input.normalizedPromptContextQueryTextLowerCase.length === 0) {
    return true;
  }

  return input.promptContextEntry.displayPath.toLowerCase().includes(input.normalizedPromptContextQueryTextLowerCase);
}

function shouldSkipRecursivePromptContextDirectoryDescendants(input: {
  directoryName: string;
  directoryPath: string;
  excludedDescendantDirectoryPaths: readonly string[];
}): boolean {
  return RECURSIVE_PROMPT_CONTEXT_IGNORED_DIRECTORY_NAMES.has(input.directoryName)
    || input.excludedDescendantDirectoryPaths.includes(input.directoryPath);
}

async function listPromptContextPathQueryEntries(input: {
  promptContextPathQuery: PromptContextPathQuery;
  promptContextPathScope: PromptContextPathScope;
}): Promise<PromptContextEntry[]> {
  const queryDirectoryRealPath = await resolvePromptContextQueryDirectoryRealPath({
    promptContextPathText: input.promptContextPathQuery.queryDirectoryPathText,
    promptContextPathScope: input.promptContextPathScope,
  });
  if (!queryDirectoryRealPath) {
    return [];
  }

  return listDirectoryPromptContextEntries({
    directoryPath: queryDirectoryRealPath,
    promptContextPathScope: input.promptContextPathScope,
    entryNameQuery: input.promptContextPathQuery.entryNameQuery,
  });
}

async function resolvePromptContextQueryDirectoryRealPath(input: {
  promptContextPathText: string;
  promptContextPathScope: PromptContextPathScope;
}): Promise<string | undefined> {
  const candidateAbsolutePath = resolvePromptContextPathFromReference({
    promptContextPathText: input.promptContextPathText,
    promptContextPathScope: input.promptContextPathScope,
  });

  try {
    const candidateStats = await lstat(candidateAbsolutePath);
    if (candidateStats.isSymbolicLink() || !candidateStats.isDirectory()) {
      return undefined;
    }

    const candidateRealPath = await realpath(candidateAbsolutePath);
    return candidateRealPath;
  } catch {
    return undefined;
  }
}

export function filterAndSortPromptContextEntries(input: {
  promptContextEntries: readonly PromptContextEntry[];
  promptContextQueryText: string;
  maximumCandidateCount: number;
  promptContextStartingDirectoryPath: string;
  treatsEntriesAsPathQueryResults: boolean;
}): PromptContextCandidate[] {
  const normalizedPromptContextQueryText = normalizePromptContextQueryText(input.promptContextQueryText);
  return input.promptContextEntries
    .filter((entry) => {
      if (normalizedPromptContextQueryText.length === 0) {
        return true;
      }

      if (input.treatsEntriesAsPathQueryResults) {
        return true;
      }

      return entry.displayPath.toLowerCase().includes(normalizedPromptContextQueryText.toLowerCase());
    })
    .sort((leftCandidate, rightCandidate) => comparePromptContextCandidates(
      leftCandidate,
      rightCandidate,
      normalizedPromptContextQueryText,
      input.promptContextStartingDirectoryPath,
    ))
    .slice(0, input.maximumCandidateCount)
    .map((entry) => ({
      kind: entry.kind,
      displayPath: entry.displayPath,
      promptReferenceText: buildPromptContextReferenceTextFromDisplayPath(entry.displayPath),
    }));
}

function comparePromptContextCandidates(
  leftCandidate: PromptContextEntry,
  rightCandidate: PromptContextEntry,
  normalizedPromptContextQueryText: string,
  promptContextStartingDirectoryPath: string,
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

  const leftBaseName = basename(leftCandidate.displayPath.replace(/\/$/, ""));
  const rightBaseName = basename(rightCandidate.displayPath.replace(/\/$/, ""));
  const leftBaseNameStartsWithQuery = normalizedPromptContextQueryText.length > 0
    && leftBaseName.toLowerCase().startsWith(normalizedPromptContextQueryText.toLowerCase());
  const rightBaseNameStartsWithQuery = normalizedPromptContextQueryText.length > 0
    && rightBaseName.toLowerCase().startsWith(normalizedPromptContextQueryText.toLowerCase());
  if (leftBaseNameStartsWithQuery !== rightBaseNameStartsWithQuery) {
    return leftBaseNameStartsWithQuery ? -1 : 1;
  }

  const leftBaseNameIncludesQuery = normalizedPromptContextQueryText.length > 0
    && leftBaseName.toLowerCase().includes(normalizedPromptContextQueryText.toLowerCase());
  const rightBaseNameIncludesQuery = normalizedPromptContextQueryText.length > 0
    && rightBaseName.toLowerCase().includes(normalizedPromptContextQueryText.toLowerCase());
  if (leftBaseNameIncludesQuery !== rightBaseNameIncludesQuery) {
    return leftBaseNameIncludesQuery ? -1 : 1;
  }

  const leftDepth = leftCandidate.displayPath.split("/").length;
  const rightDepth = rightCandidate.displayPath.split("/").length;
  if (leftBaseNameStartsWithQuery && rightBaseNameStartsWithQuery && leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  if (
    leftBaseNameStartsWithQuery && rightBaseNameStartsWithQuery && leftBaseName.length !== rightBaseName.length
  ) {
    return leftBaseName.length - rightBaseName.length;
  }

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  const leftStartsInsideStartingDirectory = isPathInsidePromptContextBrowseRoot(
    promptContextStartingDirectoryPath,
    leftCandidate.absolutePath,
  );
  const rightStartsInsideStartingDirectory = isPathInsidePromptContextBrowseRoot(
    promptContextStartingDirectoryPath,
    rightCandidate.absolutePath,
  );
  if (leftStartsInsideStartingDirectory !== rightStartsInsideStartingDirectory) {
    return leftStartsInsideStartingDirectory ? -1 : 1;
  }

  return leftCandidate.displayPath.localeCompare(rightCandidate.displayPath);
}
