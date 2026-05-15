import { expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectInstructionTracker, runGlobToolCall, runGrepToolCall, runReadToolCall } from "../src/index.ts";

test("runReadToolCall reads a workspace file with line offsets", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\nbeta\ngamma\n", "utf8");

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "notes.txt",
      offsetLineNumber: 2,
      maximumLineCount: 1,
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("completed");
  expect(readToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "read",
    readFilePath: "notes.txt",
    readLineCount: 3,
    previewLines: [{ lineNumber: 2, lineText: "beta" }],
  });
  expect(readToolCallOutcome.toolResultText).toContain("2: beta");
});

test("runReadToolCall rejects paths outside the workspace", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-scope-"));

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "../outside.txt",
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("Path must stay inside the workspace root");
});

test("runReadToolCall rejects direct symbolic links as workspace policy", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-symlink-"));
  await writeFile(join(workspaceRootPath, "target.txt"), "safe target\n", "utf8");
  await symlink(join(workspaceRootPath, "target.txt"), join(workspaceRootPath, "linked.txt"));

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "linked.txt",
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("Symbolic links are not supported");
});

test("runReadToolCall reports line count and long-line truncation", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-truncation-"));
  await writeFile(join(workspaceRootPath, "long.txt"), `${"x".repeat(2_100)}\nsecond\nthird\n`, "utf8");

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "long.txt",
      maximumLineCount: 2,
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("completed");
  expect(readToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "read",
    readFilePath: "long.txt",
    readLineCount: 3,
    returnedLineCount: 2,
    wasLineCountTruncated: true,
    wasLongLineTruncated: true,
    previewLines: [
      { lineNumber: 1, wasLineTruncated: true },
      { lineNumber: 2, lineText: "second" },
    ],
  });
  expect(readToolCallOutcome.toolResultText).toContain("Use offset=3 to continue");
  expect(readToolCallOutcome.toolResultText).toContain("Long lines were truncated to 2000 characters");
});

test("runReadToolCall appends newly discovered nested project instructions", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-instructions-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "AGENTS.md"), "- Root convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "AGENTS.md"), "- Source convention.\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "module.ts"), "export const moduleValue = true;\n", "utf8");
  const projectInstructionTracker = new ProjectInstructionTracker({ workspaceRootPath });
  await projectInstructionTracker.loadProjectInstructionsForDirectory({ targetDirectoryPath: workspaceRootPath });

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    projectInstructionTracker,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "src/module.ts",
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("completed");
  expect(readToolCallOutcome.toolResultText).toContain("<project_instruction_update>");
  expect(readToolCallOutcome.toolResultText).toContain("Instructions from: src/AGENTS.md");
  expect(readToolCallOutcome.toolResultText).toContain("- Source convention.");
  expect(readToolCallOutcome.toolResultText).not.toContain("- Root convention.");
});

test("runGlobToolCall finds files by glob pattern", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "src", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "app.test.ts"), "test('app', () => {});\n", "utf8");
  await writeFile(join(workspaceRootPath, "README.md"), "docs\n", "utf8");

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "*.ts",
      searchDirectoryPath: "src",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("completed");
  expect(globToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "glob",
    globPattern: "*.ts",
    searchDirectoryPath: "src/",
    matchedPathCount: 2,
  });
  expect(globToolCallOutcome.toolResultText).toContain("src/app.ts");
  expect(globToolCallOutcome.toolResultText).toContain("src/app.test.ts");
});

test("runGlobToolCall ignores default excluded directories", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-excluded-"));
  await mkdir(join(workspaceRootPath, "src"));
  await mkdir(join(workspaceRootPath, "node_modules"));
  await writeFile(join(workspaceRootPath, "src", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(join(workspaceRootPath, "node_modules", "dependency.ts"), "export const dependency = true;\n", "utf8");

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "**/*.ts",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("completed");
  expect(globToolCallOutcome.toolResultText).toContain("src/app.ts");
  expect(globToolCallOutcome.toolResultText).not.toContain("node_modules/dependency.ts");
});

test("runGlobToolCall reports returned and total path counts when truncated", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-truncated-"));
  await mkdir(join(workspaceRootPath, "src"));
  for (let fileIndex = 0; fileIndex < 105; fileIndex += 1) {
    await writeFile(join(workspaceRootPath, "src", `file-${fileIndex}.ts`), "export const value = true;\n", "utf8");
  }

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "**/*.ts",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("completed");
  expect(globToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "glob",
    matchedPathCount: 105,
    returnedPathCount: 100,
    wasTruncated: true,
  });
  expect(globToolCallOutcome.toolResultText).toContain("Found 105 files (showing first 100)");
  expect(globToolCallOutcome.toolResultText).toContain("Results truncated");
});

test("runGrepToolCall searches text files with include glob", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-"));
  await mkdir(join(workspaceRootPath, "src"));
  await writeFile(join(workspaceRootPath, "src", "app.ts"), "const answer = 42;\n", "utf8");
  await writeFile(join(workspaceRootPath, "src", "app.md"), "answer in docs\n", "utf8");

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "answer",
      searchPath: "src",
      includeGlobPattern: "*.ts",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    searchPattern: "answer",
    matchedFileCount: 1,
    totalMatchCount: 1,
    matchHits: [{ matchFilePath: "src/app.ts", matchLineNumber: 1, matchSnippet: "const answer = 42;" }],
  });
  expect(grepToolCallOutcome.toolResultText).toContain("Line 1: const answer = 42;");
});

test("runGrepToolCall rejects invalid regex with a useful failure", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-invalid-regex-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\n", "utf8");

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "[",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("failed");
  expect(grepToolCallOutcome.toolResultText).toContain("Grep failed");
  expect(grepToolCallOutcome.toolResultText).toContain("Invalid regular expression");
});

test("runGrepToolCall limits match hits and marks truncation", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-truncated-"));
  await writeFile(
    join(workspaceRootPath, "notes.txt"),
    Array.from({ length: 105 }, (_unusedValue, lineIndex) => `match ${lineIndex}`).join("\n"),
    "utf8",
  );

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "match",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    matchedFileCount: 1,
    totalMatchCount: 105,
    returnedMatchHitCount: 100,
    wasTruncated: true,
  });
  expect(grepToolCallOutcome.toolResultText).toContain("Results truncated: showing 100 of 105 matches");
});
