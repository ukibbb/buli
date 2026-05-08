import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { Stats } from "node:fs";
import { formatWorkspaceDisplayPath, isPathInsideWorkspace } from "./workspacePath.ts";

const EXCLUDED_SEARCH_DIRECTORY_NAMES = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export type WorkspaceSearchFile = {
  absolutePath: string;
  displayPath: string;
  stats: Stats;
};

export function matchesWorkspaceGlobPattern(input: {
  globPattern: string;
  portableRelativePath: string;
}): boolean {
  const glob = new Bun.Glob(input.globPattern);
  if (input.globPattern.includes("/")) {
    return glob.match(input.portableRelativePath);
  }

  return glob.match(basename(input.portableRelativePath));
}

export async function listWorkspaceFiles(input: {
  workspaceRootPath: string;
  searchRootPath: string;
  maximumFileCount?: number;
  includeGlobPattern?: string;
  abortSignal?: AbortSignal;
}): Promise<{ files: WorkspaceSearchFile[]; wasTruncated: boolean }> {
  const workspaceRootPath = await realpath(input.workspaceRootPath);
  const searchRootPath = await realpath(input.searchRootPath);
  const maximumFileCount = input.maximumFileCount ?? Number.POSITIVE_INFINITY;
  const files: WorkspaceSearchFile[] = [];
  let wasTruncated = false;

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
      if (
        input.includeGlobPattern &&
        !matchesWorkspaceGlobPattern({ globPattern: input.includeGlobPattern, portableRelativePath })
      ) {
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

function throwIfWorkspaceSearchAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Workspace file search interrupted");
  }
}
