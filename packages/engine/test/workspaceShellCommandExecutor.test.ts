import { access, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { runApprovedBashToolCall, WorkspaceShellCommandExecutor } from "../src/index.ts";

test("WorkspaceShellCommandExecutor waits for interrupted process group to exit", async () => {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "buli-shell-interrupt-"));
  const terminatedMarkerPath = join(temporaryDirectoryPath, "terminated");
  const abortController = new AbortController();
  const workspaceShellCommandExecutor = new WorkspaceShellCommandExecutor({
    workspaceRootPath: temporaryDirectoryPath,
  });

  const executionPromise = workspaceShellCommandExecutor.runShellCommand({
    shellCommand: `trap 'sleep 0.2; touch ${JSON.stringify(terminatedMarkerPath)}; exit 0' TERM; while true; do sleep 1; done`,
    workingDirectoryPath: temporaryDirectoryPath,
    timeoutMilliseconds: 10_000,
    abortSignal: abortController.signal,
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  abortController.abort();

  await expect(executionPromise).rejects.toThrow("Command interrupted by user");
  await access(terminatedMarkerPath);
});

test("WorkspaceShellCommandExecutor bounds captured stdout before process exit", async () => {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "buli-shell-bounded-output-"));
  const workspaceShellCommandExecutor = new WorkspaceShellCommandExecutor({
    workspaceRootPath: temporaryDirectoryPath,
  });

  const executionResult = await workspaceShellCommandExecutor.runShellCommand({
    shellCommand: "printf '%05000d' 0",
    workingDirectoryPath: temporaryDirectoryPath,
    timeoutMilliseconds: 10_000,
    maximumCapturedOutputCharacters: 10,
  });

  expect(executionResult.exitCode).toBe(0);
  expect(executionResult.stdoutText).toHaveLength(10);
  expect(executionResult.stdoutWasTruncated).toBe(true);
  expect(executionResult.stdoutOmittedCharacterCount).toBeGreaterThan(0);
});

test("runApprovedBashToolCall rejects working directories that resolve outside the workspace", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-shell-workspace-"));
  const outsideDirectoryPath = await mkdtemp(join(tmpdir(), "buli-shell-outside-"));
  await mkdir(join(outsideDirectoryPath, "nested"));
  await symlink(outsideDirectoryPath, join(workspaceRootPath, "outside-link"));
  let didRunCommand = false;
  const workspaceShellCommandExecutor = {
    workspaceRootPath,
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand() {
      didRunCommand = true;
      return { exitCode: 0, stdoutText: "unsafe\n", stderrText: "" };
    },
  } satisfies WorkspaceShellCommandExecutor;

  const bashToolCallOutcome = await runApprovedBashToolCall({
    workspaceRootPath,
    workspaceShellCommandExecutor,
    bashToolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
      workingDirectoryPath: "outside-link/nested",
    },
  });

  expect(bashToolCallOutcome.outcomeKind).toBe("failed");
  expect(didRunCommand).toBe(false);
  expect(bashToolCallOutcome.toolResultText).toContain("Path must stay inside the workspace root");
});
