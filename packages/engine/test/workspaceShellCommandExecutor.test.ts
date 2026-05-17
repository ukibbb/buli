import { access, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { MAX_BASH_TOOL_TIMEOUT_MILLISECONDS } from "@buli/contracts";
import { createScrubbedShellCommandEnvironment, runApprovedBashToolCall, WorkspaceShellCommandExecutor } from "../src/index.ts";

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

test("createScrubbedShellCommandEnvironment removes secret-like process variables", () => {
  expect(createScrubbedShellCommandEnvironment({
    PATH: "/bin",
    HOME: "/tmp/home",
    OPENAI_API_KEY: "secret",
    BULI_SECRET_TOKEN: "secret",
  })).toEqual({
    PATH: "/bin",
    HOME: "/tmp/home",
  });
});

test("WorkspaceShellCommandExecutor runs commands with a scrubbed environment", async () => {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "buli-shell-env-"));
  const workspaceShellCommandExecutor = new WorkspaceShellCommandExecutor({
    workspaceRootPath: temporaryDirectoryPath,
    environment: {
      PATH: process.env.PATH,
      BULI_SECRET_TOKEN: "secret-token",
    },
  });

  const executionResult = await workspaceShellCommandExecutor.runShellCommand({
    shellCommand: "printf '%s' \"${BULI_SECRET_TOKEN-unset}\"",
    workingDirectoryPath: temporaryDirectoryPath,
    timeoutMilliseconds: 10_000,
  });

  expect(executionResult.exitCode).toBe(0);
  expect(executionResult.stdoutText).toBe("unset");
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

test("runApprovedBashToolCall clamps provider-requested timeout to the safety cap", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-shell-timeout-cap-"));
  let receivedTimeoutMilliseconds: number | undefined;
  const workspaceShellCommandExecutor = {
    workspaceRootPath,
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand(input) {
      receivedTimeoutMilliseconds = input.timeoutMilliseconds;
      return { exitCode: 0, stdoutText: "ok\n", stderrText: "" };
    },
  } satisfies WorkspaceShellCommandExecutor;

  const bashToolCallOutcome = await runApprovedBashToolCall({
    workspaceRootPath,
    workspaceShellCommandExecutor,
    bashToolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
      timeoutMilliseconds: MAX_BASH_TOOL_TIMEOUT_MILLISECONDS + 60_000,
    },
  });

  expect(bashToolCallOutcome.outcomeKind).toBe("completed");
  expect(receivedTimeoutMilliseconds).toBe(MAX_BASH_TOOL_TIMEOUT_MILLISECONDS);
});

test("runApprovedBashToolCall normalizes non-positive timeouts to one millisecond", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-shell-timeout-min-"));
  let receivedTimeoutMilliseconds: number | undefined;
  const workspaceShellCommandExecutor = {
    workspaceRootPath,
    shellExecutablePath: process.env.SHELL ?? "/bin/zsh",
    async runShellCommand(input) {
      receivedTimeoutMilliseconds = input.timeoutMilliseconds;
      return { exitCode: 0, stdoutText: "ok\n", stderrText: "" };
    },
  } satisfies WorkspaceShellCommandExecutor;

  const bashToolCallOutcome = await runApprovedBashToolCall({
    workspaceRootPath,
    workspaceShellCommandExecutor,
    bashToolCallRequest: {
      toolName: "bash",
      shellCommand: "pwd",
      commandDescription: "Print working directory",
      timeoutMilliseconds: 0,
    },
  });

  expect(bashToolCallOutcome.outcomeKind).toBe("completed");
  expect(receivedTimeoutMilliseconds).toBe(1);
});
