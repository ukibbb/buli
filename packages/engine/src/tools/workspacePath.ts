import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Stats } from "node:fs";

export type ExistingWorkspacePath = {
  absolutePath: string;
  displayPath: string;
  stats: Stats;
};

export async function resolveExistingWorkspacePath(input: {
  workspaceRootPath: string;
  requestedPath: string;
}): Promise<ExistingWorkspacePath> {
  const workspaceRootPath = await realpath(input.workspaceRootPath);
  const candidateAbsolutePath = isAbsolute(input.requestedPath)
    ? resolve(input.requestedPath)
    : resolve(workspaceRootPath, input.requestedPath);

  if (!isPathInsideWorkspace(workspaceRootPath, candidateAbsolutePath)) {
    throw new Error(`Path must stay inside the workspace root: ${workspaceRootPath}`);
  }

  const candidateStats = await lstat(candidateAbsolutePath).catch(async (error: unknown) => {
    if (isMissingPathError(error)) {
      throw new Error(await buildMissingWorkspacePathError({ workspaceRootPath, candidateAbsolutePath }));
    }

    throw error;
  });
  if (candidateStats.isSymbolicLink()) {
    throw new Error(`Symbolic links are not supported: ${formatWorkspaceDisplayPath(workspaceRootPath, candidateAbsolutePath)}`);
  }

  const candidateRealPath = await realpath(candidateAbsolutePath);
  if (!isPathInsideWorkspace(workspaceRootPath, candidateRealPath)) {
    throw new Error(`Path must stay inside the workspace root: ${workspaceRootPath}`);
  }

  return {
    absolutePath: candidateRealPath,
    displayPath: formatWorkspaceDisplayPath(workspaceRootPath, candidateRealPath, candidateStats.isDirectory()),
    stats: candidateStats,
  };
}

export function resolveWorkspacePath(input: {
  workspaceRootPath: string;
  requestedPath: string;
}): string {
  const workspaceRootPath = resolve(input.workspaceRootPath);
  const candidateAbsolutePath = isAbsolute(input.requestedPath)
    ? resolve(input.requestedPath)
    : resolve(workspaceRootPath, input.requestedPath);

  if (!isPathInsideWorkspace(workspaceRootPath, candidateAbsolutePath)) {
    throw new Error(`Path must stay inside the workspace root: ${workspaceRootPath}`);
  }

  return candidateAbsolutePath;
}

export function formatWorkspaceDisplayPath(workspaceRootPath: string, absolutePath: string, isDirectory = false): string {
  const workspaceRelativePath = relative(resolve(workspaceRootPath), resolve(absolutePath));
  const portableRelativePath = workspaceRelativePath.length === 0 ? "." : workspaceRelativePath.split(sep).join("/");
  return isDirectory && !portableRelativePath.endsWith("/") ? `${portableRelativePath}/` : portableRelativePath;
}

export function isPathInsideWorkspace(workspaceRootPath: string, candidatePath: string): boolean {
  const resolvedWorkspaceRootPath = resolve(workspaceRootPath);
  const resolvedCandidatePath = resolve(candidatePath);
  if (resolvedCandidatePath === resolvedWorkspaceRootPath) {
    return true;
  }

  const rootPrefix = resolvedWorkspaceRootPath.endsWith(sep)
    ? resolvedWorkspaceRootPath
    : `${resolvedWorkspaceRootPath}${sep}`;
  return resolvedCandidatePath.startsWith(rootPrefix);
}

async function buildMissingWorkspacePathError(input: {
  workspaceRootPath: string;
  candidateAbsolutePath: string;
}): Promise<string> {
  const missingDisplayPath = formatWorkspaceDisplayPath(input.workspaceRootPath, input.candidateAbsolutePath);
  const parentAbsolutePath = dirname(input.candidateAbsolutePath);
  if (!isPathInsideWorkspace(input.workspaceRootPath, parentAbsolutePath)) {
    return `File not found: ${missingDisplayPath}`;
  }

  const parentDirectoryEntries = await readdir(parentAbsolutePath, { withFileTypes: true }).catch(() => []);
  const suggestedDisplayPaths = listClosestMissingWorkspacePathSuggestions({
    workspaceRootPath: input.workspaceRootPath,
    parentAbsolutePath,
    requestedBasename: basename(input.candidateAbsolutePath),
    parentDirectoryEntries,
  });
  if (suggestedDisplayPaths.length === 0) {
    return `File not found: ${missingDisplayPath}`;
  }

  return [
    `File not found: ${missingDisplayPath}`,
    "",
    "Did you mean one of these?",
    ...suggestedDisplayPaths,
  ].join("\n");
}

function listClosestMissingWorkspacePathSuggestions(input: {
  workspaceRootPath: string;
  parentAbsolutePath: string;
  requestedBasename: string;
  parentDirectoryEntries: readonly { name: string; isDirectory(): boolean }[];
}): string[] {
  return input.parentDirectoryEntries
    .filter((parentDirectoryEntry) => isObviousMissingPathSuggestion(input.requestedBasename, parentDirectoryEntry.name))
    .sort((leftDirectoryEntry, rightDirectoryEntry) => leftDirectoryEntry.name.localeCompare(rightDirectoryEntry.name))
    .slice(0, 3)
    .map((parentDirectoryEntry) =>
      formatWorkspaceDisplayPath(
        input.workspaceRootPath,
        resolve(input.parentAbsolutePath, parentDirectoryEntry.name),
        parentDirectoryEntry.isDirectory(),
      )
    );
}

function isObviousMissingPathSuggestion(requestedBasename: string, candidateBasename: string): boolean {
  const requestedBasenameLower = requestedBasename.toLowerCase();
  const candidateBasenameLower = candidateBasename.toLowerCase();
  if (requestedBasenameLower === candidateBasenameLower) {
    return true;
  }
  if (candidateBasenameLower.includes(requestedBasenameLower) || requestedBasenameLower.includes(candidateBasenameLower)) {
    return true;
  }

  const requestedStemLower = stripExtension(requestedBasenameLower);
  const candidateStemLower = stripExtension(candidateBasenameLower);
  return candidateStemLower.includes(requestedStemLower) || requestedStemLower.includes(candidateStemLower);
}

function stripExtension(fileBasename: string): string {
  const extension = extname(fileBasename);
  return extension.length === 0 ? fileBasename : fileBasename.slice(0, -extension.length);
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
