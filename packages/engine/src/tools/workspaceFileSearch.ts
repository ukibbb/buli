import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { Stats } from "node:fs";
import { formatWorkspaceDisplayPath, isPathInsideWorkspace } from "./workspacePath.ts";

export const DEFAULT_EXCLUDED_SEARCH_DIRECTORY_NAMES = [
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
] as const;

const EXCLUDED_SEARCH_DIRECTORY_NAMES = new Set<string>(DEFAULT_EXCLUDED_SEARCH_DIRECTORY_NAMES);

export type WorkspaceSearchFile = {
  absolutePath: string;
  displayPath: string;
  stats: Stats;
};

export type WorkspaceFileSearchRequest = {
  workspaceRootPath: string;
  searchRootPath: string;
  maximumFileCount?: number;
  includeGlobPattern?: string;
  abortSignal?: AbortSignal;
};

export type WorkspaceFileSearchResult = {
  files: WorkspaceSearchFile[];
  wasTruncated: boolean;
};

export interface WorkspaceFileSearchBackend {
  listWorkspaceFiles(input: WorkspaceFileSearchRequest): Promise<WorkspaceFileSearchResult>;
}

type WorkspaceGlobPatternMatcher = (portableRelativePath: string) => boolean;

export class TypeScriptWorkspaceFileSearchBackend implements WorkspaceFileSearchBackend {
  async listWorkspaceFiles(input: WorkspaceFileSearchRequest): Promise<WorkspaceFileSearchResult> {
    return listWorkspaceFilesWithTypeScriptBackend(input);
  }
}

const defaultWorkspaceFileSearchBackend = new TypeScriptWorkspaceFileSearchBackend();

export function matchesWorkspaceGlobPattern(input: {
  globPattern: string;
  portableRelativePath: string;
}): boolean {
  return createWorkspaceGlobPatternMatcher(input.globPattern)(input.portableRelativePath);
}

export async function listWorkspaceFiles(input: WorkspaceFileSearchRequest): Promise<WorkspaceFileSearchResult> {
  return defaultWorkspaceFileSearchBackend.listWorkspaceFiles(input);
}

async function listWorkspaceFilesWithTypeScriptBackend(input: WorkspaceFileSearchRequest): Promise<WorkspaceFileSearchResult> {
  const workspaceRootPath = await realpath(input.workspaceRootPath);
  const searchRootPath = await realpath(input.searchRootPath);
  const maximumFileCount = input.maximumFileCount ?? Number.POSITIVE_INFINITY;
  const files: WorkspaceSearchFile[] = [];
  let wasTruncated = false;
  const includeGlobPatternMatcher = input.includeGlobPattern
    ? createWorkspaceGlobPatternMatcher(input.includeGlobPattern)
    : undefined;

  async function visitDirectory(directoryPath: string): Promise<void> {
    throwIfWorkspaceSearchAborted(input.abortSignal);
    if (files.length >= maximumFileCount) {
      wasTruncated = true;
      return;
    }

    const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
    directoryEntries.sort((leftDirectoryEntry, rightDirectoryEntry) => {
      if (leftDirectoryEntry.isDirectory() !== rightDirectoryEntry.isDirectory()) {
        return leftDirectoryEntry.isDirectory() ? -1 : 1;
      }

      return leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name);
    });

    for (const directoryEntry of directoryEntries) {
      throwIfWorkspaceSearchAborted(input.abortSignal);
      if (files.length >= maximumFileCount) {
        wasTruncated = true;
        return;
      }
      if (directoryEntry.isSymbolicLink()) {
        continue;
      }

      const absolutePath = join(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        if (!EXCLUDED_SEARCH_DIRECTORY_NAMES.has(directoryEntry.name)) {
          await visitDirectory(absolutePath);
        }
        continue;
      }
      if (!directoryEntry.isFile() || !isPathInsideWorkspace(workspaceRootPath, absolutePath)) {
        continue;
      }

      const portableRelativePath = relative(searchRootPath, absolutePath).split(sep).join("/");
      if (includeGlobPatternMatcher && !includeGlobPatternMatcher(portableRelativePath)) {
        continue;
      }

      files.push({
        absolutePath,
        displayPath: formatWorkspaceDisplayPath(workspaceRootPath, absolutePath),
        stats: await lstat(absolutePath),
      });
    }
  }

  await visitDirectory(searchRootPath);
  return { files, wasTruncated };
}

function createWorkspaceGlobPatternMatcher(globPattern: string): WorkspaceGlobPatternMatcher {
  const glob = new Bun.Glob(globPattern);
  if (globPattern.includes("/")) {
    return (portableRelativePath) => glob.match(portableRelativePath);
  }

  return (portableRelativePath) => glob.match(basename(portableRelativePath));
}

function throwIfWorkspaceSearchAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Workspace file search interrupted");
  }
}
