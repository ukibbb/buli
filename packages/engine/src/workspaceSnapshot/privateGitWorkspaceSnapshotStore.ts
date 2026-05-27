import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { WorkspacePatch, WorkspacePatchFileChangeKind, WorkspacePatchFileDiff } from "@buli/contracts";
import type { CaptureWorkspacePatchInput, WorkspaceSnapshotStore } from "./workspaceSnapshotStore.ts";

type GitCommandResult = {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
};

type GitDiffNameStatus = {
  filePath: string;
  changeKind: WorkspacePatchFileChangeKind;
};

type GitDiffLineStat = {
  addedLineCount: number;
  removedLineCount: number;
};

const GIT_CONFIG_ARGS = [
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.quotepath=false",
  "-c",
  "core.longpaths=true",
  "-c",
  "core.symlinks=true",
] as const;

const PRIVATE_SNAPSHOT_EXCLUDE_PATTERNS = [
  "/.git/",
  "/.buli/",
];

const MAX_STORED_UNIFIED_DIFF_TEXT_CHARACTERS = 500_000;

export function defaultPrivateGitWorkspaceSnapshotDirectoryPath(input: { workspaceRootPath: string }): string {
  const workspaceRootPath = resolve(input.workspaceRootPath);
  return join(
    homedir(),
    ".buli",
    "workspace-snapshots",
    `${createSafeWorkspaceSnapshotDirectoryNamePrefix(workspaceRootPath)}-${createWorkspaceSnapshotHash(workspaceRootPath)}`,
  );
}

export class PrivateGitWorkspaceSnapshotStore implements WorkspaceSnapshotStore {
  readonly workspaceRootPath: string;
  readonly privateGitDirectoryPath: string;
  readonly gitExecutablePath: string;
  readonly createWorkspacePatchId: () => string;
  readonly nowMs: () => number;

  constructor(input: {
    workspaceRootPath: string;
    privateGitDirectoryPath?: string | undefined;
    gitExecutablePath?: string | undefined;
    createWorkspacePatchId?: (() => string) | undefined;
    nowMs?: (() => number) | undefined;
  }) {
    this.workspaceRootPath = resolve(input.workspaceRootPath);
    this.privateGitDirectoryPath = input.privateGitDirectoryPath ?? defaultPrivateGitWorkspaceSnapshotDirectoryPath({
      workspaceRootPath: this.workspaceRootPath,
    });
    this.gitExecutablePath = input.gitExecutablePath ?? "git";
    this.createWorkspacePatchId = input.createWorkspacePatchId ?? randomUUID;
    this.nowMs = input.nowMs ?? (() => Date.now());
  }

  async trackWorkspaceSnapshot(input: { abortSignal?: AbortSignal | undefined } = {}): Promise<string | undefined> {
    throwIfWorkspaceSnapshotAborted(input.abortSignal);
    await this.ensurePrivateGitRepositoryReady(input.abortSignal);
    await this.stageWorkspaceSnapshot(input.abortSignal);
    const writeTreeResult = await this.runPrivateGitCommand(["write-tree"], { abortSignal: input.abortSignal });
    assertSuccessfulGitCommand(writeTreeResult, "write private workspace snapshot tree");
    const snapshotHash = writeTreeResult.stdoutText.trim();
    return snapshotHash.length > 0 ? snapshotHash : undefined;
  }

  async captureWorkspacePatch(input: CaptureWorkspacePatchInput): Promise<WorkspacePatch | undefined> {
    throwIfWorkspaceSnapshotAborted(input.abortSignal);
    const resultingSnapshotHash = await this.trackWorkspaceSnapshot({ abortSignal: input.abortSignal });
    if (!resultingSnapshotHash || resultingSnapshotHash === input.baselineSnapshotHash) {
      return undefined;
    }

    const changedFileStatuses = await this.listChangedFileStatuses({
      baselineSnapshotHash: input.baselineSnapshotHash,
      abortSignal: input.abortSignal,
    });
    if (changedFileStatuses.length === 0) {
      return undefined;
    }

    const lineStatsByFilePath = await this.listChangedFileLineStats({
      baselineSnapshotHash: input.baselineSnapshotHash,
      abortSignal: input.abortSignal,
    });
    const changedFiles = await this.buildAllWorkspacePatchFileDiffs({
      baselineSnapshotHash: input.baselineSnapshotHash,
      changedFileStatuses,
      lineStatsByFilePath,
      abortSignal: input.abortSignal,
    });
    const addedLineCount = changedFiles.reduce((sum, changedFile) => sum + changedFile.addedLineCount, 0);
    const removedLineCount = changedFiles.reduce((sum, changedFile) => sum + changedFile.removedLineCount, 0);

    return {
      workspacePatchId: this.createWorkspacePatchId(),
      toolCallId: input.toolCallId,
      capturedAtMs: this.nowMs(),
      baselineSnapshotHash: input.baselineSnapshotHash,
      resultingSnapshotHash,
      changedFileCount: changedFiles.length,
      addedLineCount,
      removedLineCount,
      changedFiles,
    };
  }

  async revertWorkspacePatches(input: {
    workspacePatches: readonly WorkspacePatch[];
    abortSignal?: AbortSignal | undefined;
  }): Promise<void> {
    throwIfWorkspaceSnapshotAborted(input.abortSignal);
    if (input.workspacePatches.length === 0) {
      return;
    }

    await this.ensurePrivateGitRepositoryReady(input.abortSignal);
    for (const workspacePatch of [...input.workspacePatches].reverse()) {
      await this.assertWorkspacePatchFilesStillMatchResultingSnapshot({
        workspacePatch,
        abortSignal: input.abortSignal,
      });
      await this.restoreWorkspacePatchFilesFromBaselineSnapshot({
        workspacePatch,
        abortSignal: input.abortSignal,
      });
      await this.stageWorkspaceSnapshot(input.abortSignal);
    }
  }

  private async ensurePrivateGitRepositoryReady(abortSignal: AbortSignal | undefined): Promise<void> {
    throwIfWorkspaceSnapshotAborted(abortSignal);
    await mkdir(this.privateGitDirectoryPath, { recursive: true, mode: 0o700 });
    if (!existsSync(join(this.privateGitDirectoryPath, "HEAD"))) {
      const initResult = await runGitCommand({
        gitExecutablePath: this.gitExecutablePath,
        args: ["init"],
        cwd: this.workspaceRootPath,
        env: {
          GIT_DIR: this.privateGitDirectoryPath,
          GIT_WORK_TREE: this.workspaceRootPath,
        },
        abortSignal,
      });
      assertSuccessfulGitCommand(initResult, "initialize private workspace snapshot repository");
      await this.configurePrivateGitRepository(abortSignal);
    }

    await this.writePrivateGitExcludeFile();
  }

  private async configurePrivateGitRepository(abortSignal: AbortSignal | undefined): Promise<void> {
    const gitConfigCommands = [
      ["config", "core.autocrlf", "false"],
      ["config", "core.longpaths", "true"],
      ["config", "core.symlinks", "true"],
      ["config", "core.fsmonitor", "false"],
    ] as const;

    for (const gitConfigCommand of gitConfigCommands) {
      const configResult = await this.runPrivateGitCommand([...gitConfigCommand], { abortSignal });
      assertSuccessfulGitCommand(configResult, `configure private workspace snapshot repository: ${gitConfigCommand.join(" ")}`);
    }
  }

  private async writePrivateGitExcludeFile(): Promise<void> {
    const privateGitInfoDirectoryPath = join(this.privateGitDirectoryPath, "info");
    await mkdir(privateGitInfoDirectoryPath, { recursive: true, mode: 0o700 });
    await writeFile(
      join(privateGitInfoDirectoryPath, "exclude"),
      `${PRIVATE_SNAPSHOT_EXCLUDE_PATTERNS.join("\n")}\n`,
      "utf8",
    );
  }

  private async stageWorkspaceSnapshot(abortSignal: AbortSignal | undefined): Promise<void> {
    const addResult = await this.runPrivateGitCommand(["add", "--all", "--", "."], { abortSignal });
    assertSuccessfulGitCommand(addResult, "stage private workspace snapshot files");
  }

  private async listChangedFileStatuses(input: {
    baselineSnapshotHash: string;
    abortSignal: AbortSignal | undefined;
  }): Promise<GitDiffNameStatus[]> {
    const nameStatusResult = await this.runPrivateGitCommand(
      ["diff", "--cached", "--no-ext-diff", "--no-renames", "--name-status", input.baselineSnapshotHash, "--", "."],
      { abortSignal: input.abortSignal },
    );
    assertSuccessfulGitCommand(nameStatusResult, "list private workspace snapshot changed files");

    return nameStatusResult.stdoutText
      .trim()
      .split("\n")
      .filter((lineText) => lineText.length > 0)
      .flatMap(parseGitDiffNameStatusLine);
  }

  private async listChangedFileLineStats(input: {
    baselineSnapshotHash: string;
    abortSignal: AbortSignal | undefined;
  }): Promise<Map<string, GitDiffLineStat>> {
    const numstatResult = await this.runPrivateGitCommand(
      ["diff", "--cached", "--no-ext-diff", "--no-renames", "--numstat", input.baselineSnapshotHash, "--", "."],
      { abortSignal: input.abortSignal },
    );
    assertSuccessfulGitCommand(numstatResult, "list private workspace snapshot line stats");

    return new Map(
      numstatResult.stdoutText
        .trim()
        .split("\n")
        .filter((lineText) => lineText.length > 0)
        .flatMap(parseGitDiffNumstatLine)
        .map((lineStat) => [lineStat.filePath, lineStat] as const),
    );
  }

  private async buildAllWorkspacePatchFileDiffs(input: {
    baselineSnapshotHash: string;
    changedFileStatuses: GitDiffNameStatus[];
    lineStatsByFilePath: Map<string, GitDiffLineStat>;
    abortSignal: AbortSignal | undefined;
  }): Promise<WorkspacePatchFileDiff[]> {
    const batchedDiffResult = await this.runPrivateGitCommand(
      ["diff", "--cached", "--no-ext-diff", "--no-renames", input.baselineSnapshotHash, "--", "."],
      { abortSignal: input.abortSignal },
    );
    assertSuccessfulGitCommand(batchedDiffResult, "build private workspace snapshot file diffs");

    const diffTextByFilePath = splitCombinedDiffOutput(batchedDiffResult.stdoutText);

    return input.changedFileStatuses.map((changedFileStatus) => {
      const lineStat = input.lineStatsByFilePath.get(changedFileStatus.filePath);
      const rawDiffText = diffTextByFilePath.get(changedFileStatus.filePath);
      const unifiedDiffText = normalizeStoredUnifiedDiffText(rawDiffText ?? "");

      return {
        filePath: changedFileStatus.filePath,
        changeKind: changedFileStatus.changeKind,
        addedLineCount: lineStat?.addedLineCount ?? 0,
        removedLineCount: lineStat?.removedLineCount ?? 0,
        ...(unifiedDiffText ? { unifiedDiffText } : {}),
      };
    });
  }

  private async assertWorkspacePatchFilesStillMatchResultingSnapshot(input: {
    workspacePatch: WorkspacePatch;
    abortSignal: AbortSignal | undefined;
  }): Promise<void> {
    await this.stageWorkspaceSnapshot(input.abortSignal);
    const diffResult = await this.runPrivateGitCommand(
      [
        "diff",
        "--cached",
        "--quiet",
        input.workspacePatch.resultingSnapshotHash,
        "--",
        ...input.workspacePatch.changedFiles.map((changedFile) => changedFile.filePath),
      ],
      { abortSignal: input.abortSignal },
    );
    if (diffResult.exitCode === 0) {
      return;
    }
    if (diffResult.exitCode === 1) {
      throw new WorkspacePatchRevertConflictError({
        workspacePatchId: input.workspacePatch.workspacePatchId,
        conflictedFilePaths: input.workspacePatch.changedFiles.map((changedFile) => changedFile.filePath),
      });
    }

    assertSuccessfulGitCommand(diffResult, `verify workspace patch revert safety: ${input.workspacePatch.workspacePatchId}`);
  }

  private async restoreWorkspacePatchFilesFromBaselineSnapshot(input: {
    workspacePatch: WorkspacePatch;
    abortSignal: AbortSignal | undefined;
  }): Promise<void> {
    for (const changedFile of input.workspacePatch.changedFiles) {
      const baselineFileExists = await this.doesSnapshotContainFile({
        snapshotHash: input.workspacePatch.baselineSnapshotHash,
        filePath: changedFile.filePath,
        abortSignal: input.abortSignal,
      });
      if (baselineFileExists) {
        const checkoutResult = await this.runPrivateGitCommand(
          ["checkout", input.workspacePatch.baselineSnapshotHash, "--", changedFile.filePath],
          { abortSignal: input.abortSignal },
        );
        assertSuccessfulGitCommand(checkoutResult, `restore workspace patch file: ${changedFile.filePath}`);
        continue;
      }

      await rm(join(this.workspaceRootPath, changedFile.filePath), { force: true, recursive: true });
    }
  }

  private async doesSnapshotContainFile(input: {
    snapshotHash: string;
    filePath: string;
    abortSignal: AbortSignal | undefined;
  }): Promise<boolean> {
    const lsTreeResult = await this.runPrivateGitCommand(
      ["ls-tree", "--name-only", input.snapshotHash, "--", input.filePath],
      { abortSignal: input.abortSignal },
    );
    assertSuccessfulGitCommand(lsTreeResult, `check workspace snapshot file: ${input.filePath}`);
    return lsTreeResult.stdoutText.trim().length > 0;
  }

  private runPrivateGitCommand(
    args: readonly string[],
    options: { abortSignal?: AbortSignal | undefined } = {},
  ): Promise<GitCommandResult> {
    return runGitCommand({
      gitExecutablePath: this.gitExecutablePath,
      args: [
        ...GIT_CONFIG_ARGS,
        "--git-dir",
        this.privateGitDirectoryPath,
        "--work-tree",
        this.workspaceRootPath,
        ...args,
      ],
      cwd: this.workspaceRootPath,
      abortSignal: options.abortSignal,
    });
  }
}

export class WorkspacePatchRevertConflictError extends Error {
  readonly workspacePatchId: string;
  readonly conflictedFilePaths: readonly string[];

  constructor(input: { workspacePatchId: string; conflictedFilePaths: readonly string[] }) {
    super(`Workspace patch ${input.workspacePatchId} cannot be reverted because affected files changed after the patch.`);
    this.name = "WorkspacePatchRevertConflictError";
    this.workspacePatchId = input.workspacePatchId;
    this.conflictedFilePaths = input.conflictedFilePaths;
  }
}

function runGitCommand(input: {
  gitExecutablePath: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv | undefined;
  abortSignal?: AbortSignal | undefined;
}): Promise<GitCommandResult> {
  throwIfWorkspaceSnapshotAborted(input.abortSignal);

  return new Promise<GitCommandResult>((resolveCommand, rejectCommand) => {
    const childProcess = spawn(input.gitExecutablePath, [...input.args], {
      cwd: input.cwd,
      env: input.env ? { ...process.env, ...input.env } : process.env,
    });
    let stdoutText = "";
    let stderrText = "";
    let hasSettled = false;

    const settleCommand = (settle: () => void): void => {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      input.abortSignal?.removeEventListener("abort", interruptGitCommand);
      settle();
    };
    const interruptGitCommand = (): void => {
      childProcess.kill("SIGTERM");
      settleCommand(() => rejectCommand(new Error("Workspace snapshot interrupted")));
    };

    childProcess.stdout.setEncoding("utf8");
    childProcess.stderr.setEncoding("utf8");
    childProcess.stdout.on("data", (chunk: string) => {
      stdoutText += chunk;
    });
    childProcess.stderr.on("data", (chunk: string) => {
      stderrText += chunk;
    });
    childProcess.on("error", (error) => settleCommand(() => rejectCommand(error)));
    childProcess.on("close", (exitCode) => {
      settleCommand(() => resolveCommand({
        exitCode: exitCode ?? 1,
        stdoutText,
        stderrText,
      }));
    });

    input.abortSignal?.addEventListener("abort", interruptGitCommand, { once: true });
    if (input.abortSignal?.aborted) {
      interruptGitCommand();
    }
  });
}

function parseGitDiffNameStatusLine(lineText: string): GitDiffNameStatus[] {
  const [statusCode, filePath] = lineText.split("\t");
  if (!statusCode || !filePath) {
    return [];
  }

  const changeKind = statusCode.startsWith("A")
    ? "added"
    : statusCode.startsWith("D")
    ? "deleted"
    : "modified";
  return [{ filePath, changeKind }];
}

function parseGitDiffNumstatLine(lineText: string): Array<GitDiffLineStat & { filePath: string }> {
  const [addedLineCountText, removedLineCountText, filePath] = lineText.split("\t");
  if (!addedLineCountText || !removedLineCountText || !filePath) {
    return [];
  }

  return [{
    filePath,
    addedLineCount: parseNonnegativeGitLineCount(addedLineCountText),
    removedLineCount: parseNonnegativeGitLineCount(removedLineCountText),
  }];
}

function parseNonnegativeGitLineCount(lineCountText: string): number {
  const lineCount = Number.parseInt(lineCountText, 10);
  return Number.isFinite(lineCount) && lineCount >= 0 ? lineCount : 0;
}

function splitCombinedDiffOutput(combinedDiffText: string): Map<string, string> {
  const diffTextByFilePath = new Map<string, string>();
  if (combinedDiffText.length === 0) {
    return diffTextByFilePath;
  }

  // Split on "diff --git " at the start of a line, keeping each header with its content
  const fileDiffSections = combinedDiffText.split(/(?=^diff --git )/m);
  for (const section of fileDiffSections) {
    if (section.length === 0) {
      continue;
    }
    // Extract file path from "diff --git a/<path> b/<path>"
    const headerMatch = section.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (!headerMatch) {
      continue;
    }
    const filePath = headerMatch[2]!;
    diffTextByFilePath.set(filePath, section);
  }

  return diffTextByFilePath;
}

function normalizeStoredUnifiedDiffText(unifiedDiffText: string): string | undefined {
  if (unifiedDiffText.length === 0 || unifiedDiffText.length > MAX_STORED_UNIFIED_DIFF_TEXT_CHARACTERS) {
    return undefined;
  }

  return unifiedDiffText.endsWith("\n") ? unifiedDiffText : `${unifiedDiffText}\n`;
}

function assertSuccessfulGitCommand(gitCommandResult: GitCommandResult, actionDescription: string): void {
  if (gitCommandResult.exitCode === 0) {
    return;
  }

  throw new Error(`${actionDescription} failed: ${gitCommandResult.stderrText.trim() || `git exited ${gitCommandResult.exitCode}`}`);
}

function throwIfWorkspaceSnapshotAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw new Error("Workspace snapshot interrupted");
  }
}

function createWorkspaceSnapshotHash(workspaceRootPath: string): string {
  return createHash("sha256").update(resolve(workspaceRootPath)).digest("hex").slice(0, 16);
}

function createSafeWorkspaceSnapshotDirectoryNamePrefix(workspaceRootPath: string): string {
  return basename(resolve(workspaceRootPath)).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}
