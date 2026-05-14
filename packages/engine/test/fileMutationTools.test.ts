import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareEditToolCall,
  prepareWriteToolCall,
  runPreparedEditToolCall,
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
