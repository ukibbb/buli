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

test("runReadToolCall suggests obvious nearby filenames when a file is missing", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-suggestion-"));
  await mkdir(join(workspaceRootPath, "packages", "chat-session-state", "src"), { recursive: true });
  await writeFile(
    join(workspaceRootPath, "packages", "chat-session-state", "src", "chatSlashCommands.ts"),
    "export const slashCommands = [];\n",
    "utf8",
  );

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "packages/chat-session-state/src/chatSlashCommand.ts",
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("File not found: packages/chat-session-state/src/chatSlashCommand.ts");
  expect(readToolCallOutcome.toolResultText).toContain("Did you mean one of these?");
  expect(readToolCallOutcome.toolResultText).toContain("packages/chat-session-state/src/chatSlashCommands.ts");
  expect(readToolCallOutcome.toolResultText).toContain("Do not retry guessed path variants");
  expect(readToolCallOutcome.toolResultText).not.toContain("ENOENT");
});

test("runReadToolCall tells the assistant to discover actual paths after a missing file", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-discovery-guidance-"));
  await mkdir(join(workspaceRootPath, "apps", "api", "app", "shared", "generated_illustrations"), { recursive: true });
  await writeFile(join(workspaceRootPath, "apps", "api", "app", "shared", "generated_illustrations", "models.py"), "# models\n", "utf8");

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: "app/shared/generated_illustrations/models.py",
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("File not found: app/shared/generated_illustrations/models.py");
  expect(readToolCallOutcome.toolResultText).toContain(
    "Do not retry guessed path variants. Use glob or grep to discover the actual workspace path before reading again.",
  );
});

test("runReadToolCall returns full visible lines without shortening long lines", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-truncation-"));
  const longLineText = "x".repeat(2_100);
  await writeFile(join(workspaceRootPath, "long.txt"), `${longLineText}\nsecond\nthird\n`, "utf8");

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
    previewLines: [
      { lineNumber: 1, lineText: longLineText },
      { lineNumber: 2, lineText: "second" },
    ],
  });
  expect(readToolCallOutcome.toolResultText).toContain("Use offset=3 to continue");
  expect(readToolCallOutcome.toolResultText).toContain(`1: ${longLineText}`);
  expect(readToolCallOutcome.toolResultText).not.toContain("Long lines were truncated");
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

test("runReadToolCall rejects directory offsets beyond the entry count", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-read-tool-directory-offset-"));
  await writeFile(join(workspaceRootPath, "notes.txt"), "alpha\n", "utf8");

  const readToolCallOutcome = await runReadToolCall({
    workspaceRootPath,
    readToolCallRequest: {
      toolName: "read",
      readTargetPath: ".",
      offsetLineNumber: 3,
    },
  });

  expect(readToolCallOutcome.outcomeKind).toBe("failed");
  expect(readToolCallOutcome.toolResultText).toContain("Offset 3 is out of range for this directory (1 entries)");
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

test("runGlobToolCall rejects shell-style multi-path search directory", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-multi-path-"));
  await mkdir(join(workspaceRootPath, "src"));
  await mkdir(join(workspaceRootPath, "test"));

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "**/*.ts",
      searchDirectoryPath: "src test *",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("failed");
  expect(globToolCallOutcome.toolResultText).toContain("Glob path must be a single directory");
  expect(globToolCallOutcome.toolResultText).toContain("not multiple shell arguments");
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

test("runGlobToolCall returns all matched paths", async () => {
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
    returnedPathCount: 105,
  });
  expect(globToolCallOutcome.toolResultText).toContain("Found 105 files");
  expect(globToolCallOutcome.toolResultText).toContain("src/file-104.ts");
  expect(globToolCallOutcome.toolResultText).not.toContain("Results truncated");
});

test("runGlobToolCall caps returned matched paths while keeping the total count", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-glob-tool-result-cap-"));
  await mkdir(join(workspaceRootPath, "src"));
  for (let fileIndex = 0; fileIndex < 1_005; fileIndex += 1) {
    await writeFile(join(workspaceRootPath, "src", `file-${fileIndex}.ts`), "export const value = true;\n", "utf8");
  }

  const globToolCallOutcome = await runGlobToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: join(workspaceRootPath, "missing-rg"),
    globToolCallRequest: {
      toolName: "glob",
      globPattern: "**/*.ts",
    },
  });

  expect(globToolCallOutcome.outcomeKind).toBe("completed");
  expect(globToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "glob",
    matchedPathCount: 1_005,
    returnedPathCount: 1_000,
  });
  expect(globToolCallOutcome.toolCallDetail.toolName).toBe("glob");
  if (globToolCallOutcome.toolCallDetail.toolName === "glob") {
    expect(globToolCallOutcome.toolCallDetail.matchedPaths).toHaveLength(1_000);
  }
  expect(globToolCallOutcome.toolResultText).toContain("Found 1005 files");
  expect(globToolCallOutcome.toolResultText).toContain("Results truncated: showing first 1000 of 1005 files");
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

test("runGrepToolCall rejects shell-style multi-path search path", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-multi-path-"));
  await mkdir(join(workspaceRootPath, "src"));
  await mkdir(join(workspaceRootPath, "test"));

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "answer",
      searchPath: "src test *",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("failed");
  expect(grepToolCallOutcome.toolResultText).toContain("Grep path must be a single file or directory");
  expect(grepToolCallOutcome.toolResultText).toContain("not multiple shell arguments");
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

test("runGrepToolCall accepts ripgrep-valid regex patterns before JavaScript fallback validation", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-rg-regex-"));
  await writeFile(join(workspaceRootPath, "from-rg.ts"), "Needle from ripgrep\n", "utf8");
  const fakeRipgrepPath = await writeFakeRipgrepExecutable(
    workspaceRootPath,
    [
      "const args = process.argv.slice(2);",
      "if (args.includes('--files')) {",
      "  process.stdout.write('from-rg.ts\\0');",
      "  process.exit(0);",
      "}",
      "if (args.includes('--json')) {",
      "  process.stdout.write(JSON.stringify({ type: 'match', data: { path: { text: 'from-rg.ts' }, lines: { text: 'Needle from ripgrep\\n' }, line_number: 1 } }) + '\\n');",
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
      regexPattern: "(?i)needle",
      includeGlobPattern: "*.ts",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    matchedFileCount: 1,
    totalMatchCount: 1,
    matchHits: [{ matchFilePath: "from-rg.ts", matchLineNumber: 1, matchSnippet: "Needle from ripgrep" }],
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

test("runGrepToolCall rejects unsafe JavaScript regex fallback patterns", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-unsafe-fallback-"));
  await writeFile(join(workspaceRootPath, "fallback.ts"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!\n", "utf8");

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: join(workspaceRootPath, "missing-rg"),
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "(a+)+$",
      includeGlobPattern: "*.ts",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("failed");
  expect(grepToolCallOutcome.toolResultText).toContain("Grep fallback cannot safely evaluate this regex pattern without ripgrep");
});

test("runGrepToolCall falls back before parsing when ripgrep stdout exceeds the capture limit", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-rg-output-cap-"));
  await writeFile(join(workspaceRootPath, "fallback.ts"), "const fallbackNeedle = true;\n", "utf8");
  const fakeRipgrepPath = await writeFakeRipgrepExecutable(
    workspaceRootPath,
    [
      "const args = process.argv.slice(2);",
      "if (args.includes('--files')) {",
      "  process.stdout.write('fallback.ts\\0');",
      "  process.exit(0);",
      "}",
      "else if (args.includes('--json')) {",
      "  process.stdout.write('x'.repeat(200), () => process.exit(0));",
      "}",
      "else {",
      "  process.exit(2);",
      "}",
    ].join("\n"),
  );

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: fakeRipgrepPath,
    maximumRipgrepCapturedOutputCharacters: 100,
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

test("runGrepToolCall returns all match hits", async () => {
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
    returnedMatchHitCount: 105,
  });
  expect(grepToolCallOutcome.toolCallDetail.toolName).toBe("grep");
  if (grepToolCallOutcome.toolCallDetail.toolName === "grep") {
    expect(grepToolCallOutcome.toolCallDetail.matchHits).toHaveLength(105);
  }
  expect(grepToolCallOutcome.toolResultText).toContain("Line 105: match 104");
  expect(grepToolCallOutcome.toolResultText).not.toContain("Results truncated");
});

test("runGrepToolCall caps returned match hits while keeping the total count", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-grep-tool-result-cap-"));
  await writeFile(
    join(workspaceRootPath, "notes.txt"),
    Array.from({ length: 1_005 }, (_unusedValue, lineIndex) => `match ${lineIndex}`).join("\n"),
    "utf8",
  );

  const grepToolCallOutcome = await runGrepToolCall({
    workspaceRootPath,
    ripgrepExecutablePath: join(workspaceRootPath, "missing-rg"),
    grepToolCallRequest: {
      toolName: "grep",
      regexPattern: "match",
    },
  });

  expect(grepToolCallOutcome.outcomeKind).toBe("completed");
  expect(grepToolCallOutcome.toolCallDetail).toMatchObject({
    toolName: "grep",
    matchedFileCount: 1,
    totalMatchCount: 1_005,
    returnedMatchHitCount: 1_000,
  });
  expect(grepToolCallOutcome.toolCallDetail.toolName).toBe("grep");
  if (grepToolCallOutcome.toolCallDetail.toolName === "grep") {
    expect(grepToolCallOutcome.toolCallDetail.matchHits).toHaveLength(1_000);
  }
  expect(grepToolCallOutcome.toolResultText).toContain("Found 1005 matches in 1 files");
  expect(grepToolCallOutcome.toolResultText).toContain("Results truncated: showing first 1000 of 1005 matches");
  expect(grepToolCallOutcome.toolResultText).toContain("Line 1000: match 999");
  expect(grepToolCallOutcome.toolResultText).not.toContain("Line 1005: match 1004");
});

test("runGrepToolCall searches oversized text files", async () => {
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
    totalMatchCount: 1,
    returnedMatchHitCount: 1,
  });
  expect(grepToolCallOutcome.toolResultText).toContain("Line 1: needle");
});
