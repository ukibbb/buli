import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareEditManyToolCall,
  prepareEditToolCall,
  preparePatchManyToolCall,
  preparePatchToolCall,
  prepareWriteToolCall,
  runPreparedEditManyToolCall,
  runPreparedEditToolCall,
  runPreparedPatchManyToolCall,
  runPreparedPatchToolCall,
  runPreparedWriteToolCall,
} from "../src/index.ts";

test("prepareEditToolCall previews a diff and runPreparedEditToolCall applies the approved edit", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-tool-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\ngamma\n", "utf8");

  const editPreparationOutcome = await prepareEditToolCall({
    workspaceRootPath,
    editToolCallRequest: {
      toolName: "edit",
      editTargetPath: "notes.txt",
      oldString: "beta",
      newString: "delta",
    },
  });

  if (!("preparationKind" in editPreparationOutcome) || editPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared edit");
  }

  expect(editPreparationOutcome.preparedEditToolCall.toolCallDetail).toMatchObject({
    toolName: "edit",
    editedFilePath: "notes.txt",
    addedLineCount: 1,
    removedLineCount: 1,
  });
  expect(editPreparationOutcome.preparedEditToolCall.toolCallDetail.unifiedDiffText).toContain("-beta");
  expect(editPreparationOutcome.preparedEditToolCall.toolCallDetail.unifiedDiffText).toContain("+delta");

  const editToolCallOutcome = await runPreparedEditToolCall({
    preparedEditToolCall: editPreparationOutcome.preparedEditToolCall,
  });

  expect(editToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(join(workspaceRootPath, "notes.txt"), "utf8")).toBe("alpha\ndelta\ngamma\n");
});

test("prepareEditToolCall rejects ambiguous exact replacement text", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-tool-ambiguous-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "same\nsame\n", "utf8");

  const editPreparationOutcome = await prepareEditToolCall({
    workspaceRootPath,
    editToolCallRequest: {
      toolName: "edit",
      editTargetPath: "notes.txt",
      oldString: "same",
      newString: "different",
    },
  });

  expect(editPreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("matched 2 times"),
  });
});

test("prepareEditToolCall rejects empty exact replacement text", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-tool-empty-old-string-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\n", "utf8");

  const editPreparationOutcome = await prepareEditToolCall({
    workspaceRootPath,
    editToolCallRequest: {
      toolName: "edit",
      editTargetPath: "notes.txt",
      oldString: "",
      newString: "delta",
    },
  });

  expect(editPreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: "Edit target text must not be empty",
  });
});

test("prepareEditManyToolCall previews and applies multiple edits to the same file", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-many-tool-"));
  const notesPath = join(workspaceRootPath, "notes.txt");
  await writeFile(notesPath, "alpha\nbeta\ngamma\n", "utf8");

  const editManyPreparationOutcome = await prepareEditManyToolCall({
    workspaceRootPath,
    editManyToolCallRequest: {
      toolName: "edit_many",
      edits: [
        { editTargetPath: "notes.txt", oldString: "beta", newString: "delta" },
        { editTargetPath: "notes.txt", oldString: "gamma", newString: "omega" },
      ],
    },
  });

  if (!("preparationKind" in editManyPreparationOutcome) || editManyPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared edit_many");
  }

  expect(editManyPreparationOutcome.preparedEditManyToolCall.toolCallDetail).toMatchObject({
    toolName: "edit_many",
    editCount: 2,
    editedFileCount: 1,
    addedLineCount: 2,
    removedLineCount: 2,
  });

  const editManyToolCallOutcome = await runPreparedEditManyToolCall({
    preparedEditManyToolCall: editManyPreparationOutcome.preparedEditManyToolCall,
  });

  expect(editManyToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(notesPath, "utf8")).toBe("alpha\ndelta\nomega\n");
});

test("prepareEditManyToolCall rejects empty exact replacement text", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-many-tool-empty-old-string-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\n", "utf8");

  const editManyPreparationOutcome = await prepareEditManyToolCall({
    workspaceRootPath,
    editManyToolCallRequest: {
      toolName: "edit_many",
      edits: [
        { editTargetPath: "notes.txt", oldString: "", newString: "delta" },
      ],
    },
  });

  expect(editManyPreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: "Edit target text must not be empty",
  });
});

test("preparePatchToolCall applies multiple hunks in one file", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-"));
  const notesPath = join(workspaceRootPath, "notes.txt");
  await writeFile(notesPath, "line1\nline2\nline3\nline4\n", "utf8");

  const patchPreparationOutcome = await preparePatchToolCall({
    workspaceRootPath,
    patchToolCallRequest: {
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Update File: notes.txt\n@@\n-line2\n+changed2\n@@\n-line4\n+changed4\n*** End Patch",
    },
  });

  if (!("preparationKind" in patchPreparationOutcome) || patchPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared patch");
  }

  expect(patchPreparationOutcome.preparedPatchToolCall.toolCallDetail).toMatchObject({
    toolName: "patch",
    patchTargetText: "notes.txt",
    changedFileCount: 1,
  });

  const patchToolCallOutcome = await runPreparedPatchToolCall({
    preparedPatchToolCall: patchPreparationOutcome.preparedPatchToolCall,
  });

  expect(patchToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(notesPath, "utf8")).toBe("line1\nchanged2\nline3\nchanged4\n");
});

test("preparePatchToolCall rejects multiple file sections", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-multiple-"));
  await writeFile(join(workspaceRootPath, "one.txt"), "old\n", "utf8");
  await writeFile(join(workspaceRootPath, "two.txt"), "old\n", "utf8");

  const patchPreparationOutcome = await preparePatchToolCall({
    workspaceRootPath,
    patchToolCallRequest: {
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Update File: one.txt\n@@\n-old\n+new\n*** Update File: two.txt\n@@\n-old\n+new\n*** End Patch",
    },
  });

  expect(patchPreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("exactly one file section"),
  });
});

test("preparePatchToolCall rejects add-file sections for existing files", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-add-existing-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "existing\n", "utf8");

  const patchPreparationOutcome = await preparePatchToolCall({
    workspaceRootPath,
    patchToolCallRequest: {
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Add File: notes.txt\n+replacement\n*** End Patch",
    },
  });

  expect(patchPreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("Cannot add existing file: notes.txt"),
  });
});

test("preparePatchToolCall rejects moves over existing files", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-move-existing-"));
  await writeFile(join(workspaceRootPath, "source.txt"), "source\n", "utf8");
  await writeFile(join(workspaceRootPath, "target.txt"), "target\n", "utf8");

  const patchPreparationOutcome = await preparePatchToolCall({
    workspaceRootPath,
    patchToolCallRequest: {
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Update File: source.txt\n*** Move to: target.txt\n*** End Patch",
    },
  });

  expect(patchPreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("Cannot move patch target over existing file: target.txt"),
  });
});

test("preparePatchManyToolCall applies add update and delete in one approval", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-many-tool-"));
  const modifyPath = join(workspaceRootPath, "modify.txt");
  const deletePath = join(workspaceRootPath, "delete.txt");
  await writeFile(modifyPath, "line1\nline2\n", "utf8");
  await writeFile(deletePath, "obsolete\n", "utf8");

  const patchManyPreparationOutcome = await preparePatchManyToolCall({
    workspaceRootPath,
    patchManyToolCallRequest: {
      toolName: "patch_many",
      patchText: "*** Begin Patch\n*** Add File: nested/new.txt\n+created\n*** Update File: modify.txt\n@@\n-line2\n+changed\n*** Delete File: delete.txt\n*** End Patch",
    },
  });

  if (!("preparationKind" in patchManyPreparationOutcome) || patchManyPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared patch_many");
  }

  expect(patchManyPreparationOutcome.preparedPatchManyToolCall.toolCallDetail).toMatchObject({
    toolName: "patch_many",
    changedFileCount: 3,
  });

  const patchManyToolCallOutcome = await runPreparedPatchManyToolCall({
    preparedPatchManyToolCall: patchManyPreparationOutcome.preparedPatchManyToolCall,
  });

  expect(patchManyToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(join(workspaceRootPath, "nested", "new.txt"), "utf8")).toBe("created\n");
  expect(await readFile(modifyPath, "utf8")).toBe("line1\nchanged\n");
  await expect(readFile(deletePath, "utf8")).rejects.toThrow();
});

test("runPreparedPatchToolCall rejects stale files after approval preview", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-stale-"));
  const notesPath = join(workspaceRootPath, "notes.txt");
  await writeFile(notesPath, "old\n", "utf8");
  const patchPreparationOutcome = await preparePatchToolCall({
    workspaceRootPath,
    patchToolCallRequest: {
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Update File: notes.txt\n@@\n-old\n+new\n*** End Patch",
    },
  });

  if (!("preparationKind" in patchPreparationOutcome) || patchPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared patch");
  }

  await writeFile(notesPath, "changed\n", "utf8");
  const patchToolCallOutcome = await runPreparedPatchToolCall({
    preparedPatchToolCall: patchPreparationOutcome.preparedPatchToolCall,
  });

  expect(patchToolCallOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("File changed after patch approval preview"),
  });
  expect(await readFile(notesPath, "utf8")).toBe("changed\n");
});

test("runPreparedPatchToolCall rejects symlink parents swapped after approval preview", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-symlink-parent-"));
  const outsideRootPath = await mkdtemp(join(tmpdir(), "buli-patch-tool-outside-"));
  const nestedDirectoryPath = join(workspaceRootPath, "nested");
  await mkdir(nestedDirectoryPath, { recursive: true });

  const patchPreparationOutcome = await preparePatchToolCall({
    workspaceRootPath,
    patchToolCallRequest: {
      toolName: "patch",
      patchText: "*** Begin Patch\n*** Add File: nested/new.txt\n+created\n*** End Patch",
    },
  });

  if (!("preparationKind" in patchPreparationOutcome) || patchPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared patch");
  }

  await rm(nestedDirectoryPath, { recursive: true, force: true });
  await symlink(outsideRootPath, nestedDirectoryPath, "dir");
  const patchToolCallOutcome = await runPreparedPatchToolCall({
    preparedPatchToolCall: patchPreparationOutcome.preparedPatchToolCall,
  });

  expect(patchToolCallOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("symbolic-link ancestor"),
  });
  await expect(readFile(join(outsideRootPath, "new.txt"), "utf8")).rejects.toThrow();
});

test("runPreparedEditToolCall rejects stale files after the approval preview", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-tool-stale-"));
  const notesPath = join(workspaceRootPath, "notes.txt");
  await writeFile(notesPath, "alpha\nbeta\n", "utf8");
  const editPreparationOutcome = await prepareEditToolCall({
    workspaceRootPath,
    editToolCallRequest: {
      toolName: "edit",
      editTargetPath: "notes.txt",
      oldString: "beta",
      newString: "delta",
    },
  });

  if (!("preparationKind" in editPreparationOutcome) || editPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared edit");
  }

  await writeFile(notesPath, "alpha\nchanged\n", "utf8");
  const editToolCallOutcome = await runPreparedEditToolCall({
    preparedEditToolCall: editPreparationOutcome.preparedEditToolCall,
  });

  expect(editToolCallOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("File changed after edit approval preview"),
  });
  expect(await readFile(notesPath, "utf8")).toBe("alpha\nchanged\n");
});

test("runPreparedEditToolCall completes when abort is signaled after the approved edit commits", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-edit-tool-post-commit-abort-"));
  const notesPath = join(workspaceRootPath, "notes.txt");
  const abortController = new AbortController();
  await writeFile(notesPath, "alpha\nbeta\n", "utf8");
  const editPreparationOutcome = await prepareEditToolCall({
    workspaceRootPath,
    editToolCallRequest: {
      toolName: "edit",
      editTargetPath: "notes.txt",
      oldString: "beta",
      newString: "delta",
    },
  });

  if (!("preparationKind" in editPreparationOutcome) || editPreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared edit");
  }

  const editToolCallOutcome = await runPreparedEditToolCall({
    preparedEditToolCall: editPreparationOutcome.preparedEditToolCall,
    abortSignal: abortController.signal,
    commitApprovedEditFile: async (approvedEditFile) => {
      await writeFile(approvedEditFile.absolutePath, approvedEditFile.nextFileText, "utf8");
      abortController.abort();
    },
  });

  expect(editToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(notesPath, "utf8")).toBe("alpha\ndelta\n");
});

test("prepareWriteToolCall previews a new-file diff and runPreparedWriteToolCall creates the file", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-write-tool-"));

  const writePreparationOutcome = await prepareWriteToolCall({
    workspaceRootPath,
    writeToolCallRequest: {
      toolName: "write",
      writeTargetPath: "src/generated.ts",
      fileContent: "export const generated = true;\n",
    },
  });

  if (!("preparationKind" in writePreparationOutcome) || writePreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared write");
  }

  expect(writePreparationOutcome.preparedWriteToolCall.toolCallDetail).toMatchObject({
    toolName: "write",
    writtenFilePath: "src/generated.ts",
    addedLineCount: 1,
    removedLineCount: 0,
  });
  expect(writePreparationOutcome.preparedWriteToolCall.toolCallDetail.unifiedDiffText).toContain("--- /dev/null");

  const writeToolCallOutcome = await runPreparedWriteToolCall({
    workspaceRootPath,
    preparedWriteToolCall: writePreparationOutcome.preparedWriteToolCall,
  });

  expect(writeToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(join(workspaceRootPath, "src", "generated.ts"), "utf8")).toBe("export const generated = true;\n");
});

test("prepareWriteToolCall rejects paths outside the workspace", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-write-tool-scope-"));

  const writePreparationOutcome = await prepareWriteToolCall({
    workspaceRootPath,
    writeToolCallRequest: {
      toolName: "write",
      writeTargetPath: "../outside.txt",
      fileContent: "unsafe\n",
    },
  });

  expect(writePreparationOutcome).toMatchObject({
    outcomeKind: "failed",
    failureExplanation: expect.stringContaining("Path must stay inside the workspace root"),
  });
});

test("runPreparedWriteToolCall completes when abort is signaled after the approved write commits", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-write-tool-post-commit-abort-"));
  const generatedPath = join(workspaceRootPath, "src", "generated.ts");
  const abortController = new AbortController();
  const writePreparationOutcome = await prepareWriteToolCall({
    workspaceRootPath,
    writeToolCallRequest: {
      toolName: "write",
      writeTargetPath: "src/generated.ts",
      fileContent: "export const generated = true;\n",
    },
  });

  if (!("preparationKind" in writePreparationOutcome) || writePreparationOutcome.preparationKind !== "prepared") {
    throw new Error("expected prepared write");
  }

  const writeToolCallOutcome = await runPreparedWriteToolCall({
    workspaceRootPath,
    preparedWriteToolCall: writePreparationOutcome.preparedWriteToolCall,
    abortSignal: abortController.signal,
    commitApprovedWriteFile: async (approvedWriteFile) => {
      await writeFile(approvedWriteFile.absolutePath, approvedWriteFile.nextFileText, "utf8");
      abortController.abort();
    },
  });

  expect(writeToolCallOutcome.outcomeKind).toBe("completed");
  expect(await readFile(generatedPath, "utf8")).toBe("export const generated = true;\n");
});
