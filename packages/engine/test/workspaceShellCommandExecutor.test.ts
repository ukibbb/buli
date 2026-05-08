import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { WorkspaceShellCommandExecutor } from "../src/index.ts";

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
