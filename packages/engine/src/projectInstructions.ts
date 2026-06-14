import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  PROJECT_INSTRUCTION_FILE_NAMES as CONTRACT_PROJECT_INSTRUCTION_FILE_NAMES,
  type ProjectInstructionFileName,
  type ProjectInstructionSnapshot,
} from "@buli/contracts";
import { formatWorkspaceDisplayPath, isPathInsideWorkspace } from "./tools/workspacePath.ts";

export const PROJECT_INSTRUCTION_FILE_NAMES = CONTRACT_PROJECT_INSTRUCTION_FILE_NAMES;

export type ProjectInstructionFile = ProjectInstructionSnapshot & {
  absolutePath: string;
};

export class ProjectInstructionTracker {
  readonly workspaceRootPath: string;
  private readonly loadedProjectInstructionFileByAbsolutePath = new Map<string, ProjectInstructionFile>();

  constructor(input: { workspaceRootPath: string }) {
    this.workspaceRootPath = input.workspaceRootPath;
  }

  async loadProjectInstructionsForDirectory(input: {
    targetDirectoryPath?: string;
    abortSignal?: AbortSignal;
  } = {}): Promise<readonly ProjectInstructionFile[]> {
    const discoveredProjectInstructionFiles = await discoverProjectInstructionFiles({
      workspaceRootPath: this.workspaceRootPath,
      targetDirectoryPath: input.targetDirectoryPath ?? this.workspaceRootPath,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    this.addProjectInstructionFiles(discoveredProjectInstructionFiles);
    return this.listProjectInstructionFiles();
  }

  async discoverNewProjectInstructionsForDirectory(input: {
    targetDirectoryPath: string;
    excludedAbsolutePath?: string;
    abortSignal?: AbortSignal;
  }): Promise<readonly ProjectInstructionFile[]> {
    const discoveredProjectInstructionFiles = await discoverProjectInstructionFiles({
      workspaceRootPath: this.workspaceRootPath,
      targetDirectoryPath: input.targetDirectoryPath,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const excludedAbsolutePath = input.excludedAbsolutePath ? resolve(input.excludedAbsolutePath) : undefined;
    const newProjectInstructionFiles = discoveredProjectInstructionFiles.filter(
      (projectInstructionFile) =>
        projectInstructionFile.absolutePath !== excludedAbsolutePath &&
        !this.loadedProjectInstructionFileByAbsolutePath.has(projectInstructionFile.absolutePath),
    );
    this.addProjectInstructionFiles(newProjectInstructionFiles);
    return newProjectInstructionFiles;
  }

  listProjectInstructionFiles(): readonly ProjectInstructionFile[] {
    return [...this.loadedProjectInstructionFileByAbsolutePath.values()];
  }

  private addProjectInstructionFiles(projectInstructionFiles: readonly ProjectInstructionFile[]): void {
    for (const projectInstructionFile of projectInstructionFiles) {
      this.loadedProjectInstructionFileByAbsolutePath.set(projectInstructionFile.absolutePath, projectInstructionFile);
    }
  }
}

export async function discoverProjectInstructionFiles(input: {
  workspaceRootPath: string;
  targetDirectoryPath: string;
  abortSignal?: AbortSignal;
}): Promise<ProjectInstructionFile[]> {
  throwIfProjectInstructionLoadAborted(input.abortSignal);
  const workspaceRootRealPath = await realpath(input.workspaceRootPath);
  const targetDirectoryCandidatePath = resolveTargetDirectoryCandidatePath({
    workspaceRootPath: workspaceRootRealPath,
    targetDirectoryPath: input.targetDirectoryPath,
  });
  const targetDirectoryRealPath = await realpath(targetDirectoryCandidatePath);
  if (!isPathInsideWorkspace(workspaceRootRealPath, targetDirectoryRealPath)) {
    return [];
  }

  const projectInstructionFiles: ProjectInstructionFile[] = [];
  for (const directoryPath of buildWorkspaceDirectoryChain({
    workspaceRootPath: workspaceRootRealPath,
    targetDirectoryPath: targetDirectoryRealPath,
  })) {
    for (const fileName of PROJECT_INSTRUCTION_FILE_NAMES) {
      throwIfProjectInstructionLoadAborted(input.abortSignal);
      const projectInstructionFile = await readProjectInstructionFile({
        workspaceRootPath: workspaceRootRealPath,
        absolutePath: join(directoryPath, fileName),
        fileName,
      });
      if (projectInstructionFile) {
        projectInstructionFiles.push(projectInstructionFile);
      }
    }
  }

  return projectInstructionFiles;
}

export function toProjectInstructionSnapshots(
  projectInstructionFiles: readonly ProjectInstructionFile[],
): ProjectInstructionSnapshot[] {
  return projectInstructionFiles.map((projectInstructionFile) => ({
    fileName: projectInstructionFile.fileName,
    displayPath: projectInstructionFile.displayPath,
    instructionText: projectInstructionFile.instructionText,
    contentHash: projectInstructionFile.contentHash,
  }));
}

export function buildProjectInstructionPromptBlock(
  projectInstructionSnapshots: readonly ProjectInstructionSnapshot[] | undefined,
): string | undefined {
  if (!projectInstructionSnapshots || projectInstructionSnapshots.length === 0) {
    return undefined;
  }

  return [
    "Project instructions:",
    "These workspace instructions describe local conventions. Follow them when inspecting, explaining, planning, or applying changes, while keeping Buli's learning-first agreement-before-apply behavior higher priority.",
    ...projectInstructionSnapshots.flatMap((projectInstructionSnapshot) => [
      `Instructions from: ${projectInstructionSnapshot.displayPath}`,
      projectInstructionSnapshot.instructionText,
    ]),
  ].join("\n");
}

export function buildProjectInstructionUpdateText(
  projectInstructionFiles: readonly ProjectInstructionFile[],
): string | undefined {
  if (projectInstructionFiles.length === 0) {
    return undefined;
  }

  return [
    "<project_instruction_update>",
    "New project instructions discovered while reading this path:",
    ...projectInstructionFiles.flatMap((projectInstructionFile) => [
      `Instructions from: ${projectInstructionFile.displayPath}`,
      projectInstructionFile.instructionText,
    ]),
    "</project_instruction_update>",
  ].join("\n");
}

function resolveTargetDirectoryCandidatePath(input: {
  workspaceRootPath: string;
  targetDirectoryPath: string;
}): string {
  return isAbsolute(input.targetDirectoryPath)
    ? resolve(input.targetDirectoryPath)
    : resolve(input.workspaceRootPath, input.targetDirectoryPath);
}

function buildWorkspaceDirectoryChain(input: {
  workspaceRootPath: string;
  targetDirectoryPath: string;
}): string[] {
  const workspaceRelativePath = relative(input.workspaceRootPath, input.targetDirectoryPath);
  const directories = [input.workspaceRootPath];
  let currentDirectoryPath = input.workspaceRootPath;
  for (const pathSegment of workspaceRelativePath.split(sep).filter(Boolean)) {
    currentDirectoryPath = join(currentDirectoryPath, pathSegment);
    directories.push(currentDirectoryPath);
  }
  return directories;
}

async function readProjectInstructionFile(input: {
  workspaceRootPath: string;
  absolutePath: string;
  fileName: ProjectInstructionFileName;
}): Promise<ProjectInstructionFile | undefined> {
  try {
    const fileStats = await lstat(input.absolutePath);
    if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
      return undefined;
    }

    const instructionText = await readFile(input.absolutePath, "utf8");
    return {
      absolutePath: resolve(input.absolutePath),
      fileName: input.fileName,
      displayPath: formatWorkspaceDisplayPath(input.workspaceRootPath, input.absolutePath),
      instructionText,
      contentHash: createHash("sha256").update(instructionText).digest("hex"),
    };
  } catch {
    return undefined;
  }
}

function throwIfProjectInstructionLoadAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Project instruction loading interrupted");
  }
}
