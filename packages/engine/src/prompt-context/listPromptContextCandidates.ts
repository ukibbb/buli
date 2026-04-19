import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { buildPromptContextReferenceTextFromDisplayPath } from "./buildPromptContextReferenceTextFromDisplayPath.ts";
import {
  buildPromptContextDisplayPathFromAbsolutePath,
  isPathInsidePromptContextBrowseRoot,
  resolvePromptContextPathFromReference,
  resolvePromptContextPathScope,
  type PromptContextPathScope,
} from "./promptContextPathScope.ts";
import type { PromptContextCandidate } from "./types.ts";

export const DEFAULT_MAXIMUM_PROMPT_CONTEXT_CANDIDATE_COUNT = 50;
export const DEFAULT_MAXIMUM_PROMPT_CONTEXT_SEARCH_ENTRY_COUNT = 2_000;

export type PromptContextQueryLoadStrategy = "browse_current_directory" | "path_query" | "fuzzy_query";

export function determinePromptContextQueryLoadStrategy(promptContextQueryText: string): PromptContextQueryLoadStrategy {
  const normalizedPromptContextQueryText = normalizePromptContextQueryText(promptContextQueryText);
  if (normalizedPromptContextQueryText.length === 0) {
    return "browse_current_directory";
  }

  return parsePromptContextPathQuery(normalizedPromptContextQueryText) ? "path_query" : "fuzzy_query";
}

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
      : await listRecursivePromptContextEntries({
          promptContextPathScope,
          maximumSearchEntryCount,
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
}): Promise<PromptContextEntry[]> {
  const promptContextEntries: PromptContextEntry[] = [];

  async function visitDirectory(currentDirectoryPath: string): Promise<void> {
    if (promptContextEntries.length >= input.maximumSearchEntryCount) {
      return;
    }

    const directoryEntries = await readdir(currentDirectoryPath, { withFileTypes: true });
    directoryEntries.sort((leftDirectoryEntry, rightDirectoryEntry) => leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name));

    for (const directoryEntry of directoryEntries) {
      if (promptContextEntries.length >= input.maximumSearchEntryCount) {
        return;
      }

      if (directoryEntry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = join(currentDirectoryPath, directoryEntry.name);
      const displayPath = buildPromptContextDisplayPathFromAbsolutePath({
        absolutePath,
        promptContextStartingDirectoryPath: input.promptContextPathScope.promptContextStartingDirectoryPath,
        isDirectory: directoryEntry.isDirectory(),
      });
      if (directoryEntry.isFile() || directoryEntry.isDirectory()) {
        promptContextEntries.push({
          kind: directoryEntry.isDirectory() ? "directory" : "file",
          absolutePath,
          displayPath,
        });
      }

      if (directoryEntry.isDirectory()) {
        await visitDirectory(absolutePath);
      }
    }
  }

  await visitDirectory(input.promptContextPathScope.promptContextBrowseRootPath);
  return promptContextEntries;
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

type PromptContextPathQuery = {
  queryDirectoryPathText: string;
  entryNameQuery: string;
};

function parsePromptContextPathQuery(promptContextQueryText: string): PromptContextPathQuery | undefined {
  if (promptContextQueryText === "~") {
    return { queryDirectoryPathText: "~/", entryNameQuery: "" };
  }

  if (promptContextQueryText.startsWith("~") && !promptContextQueryText.startsWith("~/")) {
    return {
      queryDirectoryPathText: "~/",
      entryNameQuery: promptContextQueryText.slice(1),
    };
  }

  if (promptContextQueryText === "." || promptContextQueryText === "..") {
    return {
      queryDirectoryPathText: `${promptContextQueryText}/`,
      entryNameQuery: "",
    };
  }

  if (!promptContextQueryText.includes("/")) {
    return undefined;
  }

  if (promptContextQueryText.endsWith("/")) {
    return {
      queryDirectoryPathText: promptContextQueryText,
      entryNameQuery: "",
    };
  }

  const lastSlashIndex = promptContextQueryText.lastIndexOf("/");
  return {
    queryDirectoryPathText: promptContextQueryText.slice(0, lastSlashIndex + 1),
    entryNameQuery: promptContextQueryText.slice(lastSlashIndex + 1),
  };
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
    if (!isPathInsidePromptContextBrowseRoot(input.promptContextPathScope.promptContextBrowseRootPath, candidateRealPath)) {
      return undefined;
    }

    return candidateRealPath;
  } catch {
    return undefined;
  }
}

function normalizePromptContextQueryText(promptContextQueryText: string): string {
  const queryWithoutLeadingQuote = promptContextQueryText.startsWith('"')
    ? promptContextQueryText.slice(1)
    : promptContextQueryText;
  return queryWithoutLeadingQuote.replace(/\\([\\"\s])/g, "$1");
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

  const leftBaseName = basename(leftCandidate.displayPath.replace(/\/$/, ""));
  const rightBaseName = basename(rightCandidate.displayPath.replace(/\/$/, ""));
  const leftBaseNameStartsWithQuery = normalizedPromptContextQueryText.length > 0
    && leftBaseName.toLowerCase().startsWith(normalizedPromptContextQueryText.toLowerCase());
  const rightBaseNameStartsWithQuery = normalizedPromptContextQueryText.length > 0
    && rightBaseName.toLowerCase().startsWith(normalizedPromptContextQueryText.toLowerCase());
  if (leftBaseNameStartsWithQuery !== rightBaseNameStartsWithQuery) {
    return leftBaseNameStartsWithQuery ? -1 : 1;
  }

  return leftCandidate.displayPath.localeCompare(rightCandidate.displayPath);
}
