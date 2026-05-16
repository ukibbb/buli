import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectInstructionTracker, runGlobToolCall, runGrepToolCall, runReadToolCall } from "../src/index.ts";

async function writeFakeRipgrepExecutable(workspaceRootPath: string, scriptBody: string): Promise<string> {
  const fakeRipgrepPath = join(workspaceRootPath, "fake-rg");
  await writeFile(fakeRipgrepPath, `#!${process.execPath}\n${scriptBody}`, "utf8");
  await chmod(fakeRipgrepPath, 0o755);
  return fakeRipgrepPath;
}

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

test("runReadToolCall rejects default reads of oversized text files with range guidance", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-large-file-"));
  await writeFile(join(workspaceRootPath, "large.txt"), "x".repeat(1_000_001), "utf8");

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "large.txt",
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("File is too large for a default read");
  expect(readToolCallOutcome.toolResultText).toContain("Use offsetLineNumber and maximumLineCount");
});

test("runReadToolCall reads bounded line windows from oversized text files", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-large-file-window-"));
  await writeFile(
    join(workspaceRootPath, "large.txt"),
    Array.from({ length: 1_005 }, (_unusedValue, lineIndex) => `line-${lineIndex + 1} ${"x".repeat(1_100)}`).join("\n"),
    "utf8",
  );

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "large.txt",
      offsetLineNumber: 2,
      maximumLineCount: 2,
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("completed");
  expect(readToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "read",
    readFilePath: "large.txt",
    returnedLineCount: 2,
    readByteCount: expect.any(Number),
    wasLineCountTruncated: true,
    previewLines: [
      { lineNumber: 2, lineText: expect.stringContaining("line-2") },
      { lineNumber: 3, lineText: expect.stringContaining("line-3") },
    ],
  });
  expect(readToolCallOutcome.toolResultText).toContain("2: line-2");
  expect(readToolCallOutcome.toolResultText).toContain("3: line-3");
  expect(readToolCallOutcome.toolResultText).not.toContain("4: line-4");
  expect(readToolCallOutcome.toolResultText).toContain("Use offset=4 to continue");
});

test("runReadToolCall rejects bounded reads of oversized binary files", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-large-binary-"));
  await writeFile(join(workspaceRootPath, "large.bin"), Buffer.alloc(1_000_001));

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "large.bin",
      offsetLineNumber: 1,
      maximumLineCount: 1,
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("Cannot read binary file: large.bin");
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

test("runGlobToolCall prefers ripgrep file discovery when available", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-rg-"));
  await writeFile(join(workspaceRootPath, "from-rg.ts"), "export const fromRipgrep = true;\n", "utf8");
  await writeFile(join(workspaceRootPath, "fallback-only.ts"), "export const fallbackOnly = true;\n", "utf8");
  const fakeRipgrepPath = await writeFakeRipgrepExecutable(
    workspaceRootPath,
    [
      "const args = process.argv.slice(2);",
      "if (args.includes('--files')) {",
      "  process.stdout.write('from-rg.ts\\0');",
      "  process.exit(0);",
      "}",
      "process.exit(2);",
    ].join("\n"),
  );

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: fakeRipgrepPath,
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "*.ts",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("completed");
  expect(globToolCallOutcome.toolResultText).toContain("from-rg.ts");
  expect(globToolCallOutcome.toolResultText).not.toContain("fallback-only.ts");
});

test("runGlobToolCall falls back when ripgrep is unavailable", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-rg-fallback-"));
  await writeFile(join(workspaceRootPath, "fallback.ts"), "export const fallback = true;\n", "utf8");

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: join(workspaceRootPath, "missing-rg"),
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "*.ts",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("completed");
  expect(globToolCallOutcome.toolResultText).toContain("fallback.ts");
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

test("runGrepToolCall prefers ripgrep JSON search when available", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-rg-"));
  await writeFile(join(workspaceRootPath, "from-rg.ts"), "no local match here\n", "utf8");
  const fakeRipgrepPath = await writeFakeRipgrepExecutable(
    workspaceRootPath,
    [
      "const args = process.argv.slice(2);",
      "if (args.includes('--files')) {",
      "  process.stdout.write('from-rg.ts\\0');",
      "  process.exit(0);",
      "}",
      "if (args.includes('--json')) {",
      "  process.stdout.write(JSON.stringify({ type: 'match', data: { path: { text: 'from-rg.ts' }, lines: { text: 'fake ripgrep hit\\n' }, line_number: 7 } }) + '\\n');",
      "  process.exit(0);",
      "}",
      "process.exit(2);",
    ].join("\n"),
  );

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: fakeRipgrepPath,
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "fake ripgrep hit",
      includeGlobPattern: "*.ts",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    matchedFileCount: 1,
    totalMatchCount: 1,
    matchHits: [{ matchFilePath: "from-rg.ts", matchLineNumber: 7, matchSnippet: "fake ripgrep hit" }],
  });
});

test("runGrepToolCall falls back when ripgrep is unavailable", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-rg-fallback-"));
  await writeFile(join(workspaceRootPath, "fallback.ts"), "const fallbackNeedle = true;\n", "utf8");

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: join(workspaceRootPath, "missing-rg"),
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "fallbackNeedle",
      includeGlobPattern: "*.ts",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    matchedFileCount: 1,
    totalMatchCount: 1,
    matchHits: [{ matchFilePath: "fallback.ts", matchLineNumber: 1, matchSnippet: "const fallbackNeedle = true;" }],
  });
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

test("runGrepToolCall skips oversized files instead of loading them", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-large-file-"));
  await writeFile(join(workspaceRootPath, "large.txt"), `needle ${"x".repeat(1_000_001)}`, "utf8");

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "needle",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    totalMatchCount: 0,
    wasTruncated: true,
  });
  expect(grepToolCallOutcome.toolResultText).toContain("Skipped 1 files larger than 1000000 bytes");
});
