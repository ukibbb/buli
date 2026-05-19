import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PrivateGitWorkspaceSnapshotStore,
  WorkspacePatchRevertConflictError,
} from "../src/workspaceSnapshot/privateGitWorkspaceSnapshotStore.ts";

test("PrivateGitWorkspaceSnapshotStore captures added modified and deleted workspace files", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-workspace-snapshot-store-"));
  const privateGitDirectoryPath = await mkdtemp(join(tmpdir(), "buli-workspace-snapshot-git-"));
  await mkdir(join(workspaceRootPath, "src"), { recursive: true });
  await writeFile(join(workspaceRootPath, "src", "notes.txt"), "alpha\n", "utf8");
  await writeFile(join(workspaceRootPath, "delete-me.txt"), "remove\n", "utf8");
  const workspaceSnapshotStore = new PrivateGitWorkspaceSnapshotStore({
    workspaceRootPath,
    privateGitDirectoryPath,
    createWorkspacePatchId: () => "patch-1",
    nowMs: () => 100,
  });

  const baselineSnapshotHash = await workspaceSnapshotStore.trackWorkspaceSnapshot();
  if (!baselineSnapshotHash) {
    throw new Error("expected baseline snapshot hash");
  }
  await writeFile(join(workspaceRootPath, "src", "notes.txt"), "alpha\nbeta\n", "utf8");
  await writeFile(join(workspaceRootPath, "created.txt"), "created\n", "utf8");
  await rm(join(workspaceRootPath, "delete-me.txt"));

  const workspacePatch = await workspaceSnapshotStore.captureWorkspacePatch({
    baselineSnapshotHash,
    toolCallId: "call-1",
  });

  expect(workspacePatch).toMatchObject({
    workspacePatchId: "patch-1",
    toolCallId: "call-1",
    capturedAtMs: 100,
    changedFileCount: 3,
    addedLineCount: 2,
    removedLineCount: 1,
  });
  expect(workspacePatch?.changedFiles).toEqual(expect.arrayContaining([
    expect.objectContaining({ filePath: "created.txt", changeKind: "added", addedLineCount: 1 }),
    expect.objectContaining({ filePath: "delete-me.txt", changeKind: "deleted", removedLineCount: 1 }),
    expect.objectContaining({ filePath: "src/notes.txt", changeKind: "modified", addedLineCount: 1 }),
  ]));
  expect(workspacePatch?.changedFiles.find((changedFile) => changedFile.filePath === "src/notes.txt")?.unifiedDiffText)
    .toContain("+beta");
  await expect(readFile(join(workspaceRootPath, ".git"), "utf8")).rejects.toThrow();
});

test("PrivateGitWorkspaceSnapshotStore reverts patch files only when they still match the patch result", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-workspace-snapshot-revert-"));
  const privateGitDirectoryPath = await mkdtemp(join(tmpdir(), "buli-workspace-snapshot-revert-git-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "before\n", "utf8");
  const workspaceSnapshotStore = new PrivateGitWorkspaceSnapshotStore({
    workspaceRootPath,
    privateGitDirectoryPath,
    createWorkspacePatchId: () => "patch-1",
    nowMs: () => 100,
  });
  const baselineSnapshotHash = await workspaceSnapshotStore.trackWorkspaceSnapshot();
  if (!baselineSnapshotHash) {
    throw new Error("expected baseline snapshot hash");
  }
  await writeFile(join(workspaceRootPath, "notes.txt"), "after\n", "utf8");
  const workspacePatch = await workspaceSnapshotStore.captureWorkspacePatch({
    baselineSnapshotHash,
    toolCallId: "call-1",
  });
  if (!workspacePatch) {
    throw new Error("expected workspace patch");
  }

  await workspaceSnapshotStore.revertWorkspacePatches({ workspacePatches: [workspacePatch] });

  expect(await readFile(join(workspaceRootPath, "notes.txt"), "utf8")).toBe("before\n");

  await writeFile(join(workspaceRootPath, "notes.txt"), "after\n", "utf8");
  await workspaceSnapshotStore.trackWorkspaceSnapshot();
  await writeFile(join(workspaceRootPath, "notes.txt"), "user changed after patch\n", "utf8");

  await expect(workspaceSnapshotStore.revertWorkspacePatches({ workspacePatches: [workspacePatch] }))
    .rejects.toBeInstanceOf(WorkspacePatchRevertConflictError);
  expect(await readFile(join(workspaceRootPath, "notes.txt"), "utf8")).toBe("user changed after patch\n");
});
