import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
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

  const candidateStats = await lstat(candidateAbsolutePath);
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
