import { spawn } from "node:child_process";
import type { Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { DEFAULT_EXCLUDED_SEARCH_DIRECTORY_NAMES } from "./workspaceFileSearch.ts";
import { formatWorkspaceDisplayPath, isPathInsideWorkspace } from "./workspacePath.ts";

const DEFAULT_RIPGREP_EXECUTABLE_PATH = "rg";
const MAX_RIPGREP_STDOUT_CAPTURE_CHARACTERS = 1_000_000;
const MAX_RIPGREP_STDERR_CAPTURE_CHARACTERS = 100_000;

export type RipgrepWorkspaceFile = {
  absolutePath: string;
  displayPath: string;
  stats: Stats;
};

export type RipgrepFileSearchAttempt =
  | {
    attemptKind: "completed";
    files: RipgrepWorkspaceFile[];
  }
  | RipgrepUnavailableAttempt
  | RipgrepFailedAttempt;

export type RipgrepGrepMatch = {
  matchFilePath: string;
  matchLineNumber: number;
  matchSnippet: string;
  fileModifiedAtMilliseconds: number;
};

export type RipgrepGrepSearchAttempt =
  | {
    attemptKind: "completed";
    matches: RipgrepGrepMatch[];
    matchedFilePaths: ReadonlySet<string>;
  }
  | RipgrepUnavailableAttempt
  | RipgrepFailedAttempt;

type RipgrepUnavailableAttempt = {
  attemptKind: "unavailable";
  failureExplanation: string;
};

type RipgrepFailedAttempt = {
  attemptKind: "failed";
  failureExplanation: string;
};

type RipgrepProcessAttempt =
  | {
    attemptKind: "completed";
    exitCode: number;
    stdoutText: string;
    stderrText: string;
  }
  | RipgrepUnavailableAttempt
  | RipgrepFailedAttempt;

type JsonObjectRecord = {
  readonly [fieldName: string]: unknown;
};

type RipgrepJsonMatchEvent = {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
  };
};

type BoundedRipgrepOutputCapture = {
  capturedText: string;
  capturedCharacterCount: number;
  maximumCharacterCount: number;
  wasTruncated: boolean;
};

export async function listWorkspaceFilesWithRipgrep(input: {
  workspaceRootPath: string;
  searchRootPath: string;
  includeGlobPattern?: string;
  ripgrepExecutablePath?: string;
  maximumCapturedOutputCharacters?: number;
  abortSignal?: AbortSignal;
}): Promise<RipgrepFileSearchAttempt> {
  const workspaceRootPath = await realpath(input.workspaceRootPath);
  const searchRootPath = await realpath(input.searchRootPath);
  const ripgrepProcessAttempt = await runRipgrepProcess({
    executablePath: input.ripgrepExecutablePath ?? DEFAULT_RIPGREP_EXECUTABLE_PATH,
    workingDirectoryPath: searchRootPath,
    args: buildRipgrepFileListArgs(input.includeGlobPattern),
    ...(input.maximumCapturedOutputCharacters !== undefined
      ? { maximumStdoutCaptureCharacters: input.maximumCapturedOutputCharacters }
      : {}),
    abortSignal: input.abortSignal,
  });
  if (ripgrepProcessAttempt.attemptKind !== "completed") {
    return ripgrepProcessAttempt;
  }
  if (ripgrepProcessAttempt.exitCode !== 0 && ripgrepProcessAttempt.exitCode !== 1) {
    return {
      attemptKind: "failed",
      failureExplanation: buildRipgrepFailureExplanation(ripgrepProcessAttempt),
    };
  }

  const files: RipgrepWorkspaceFile[] = [];
  for (const ripgrepPathText of ripgrepProcessAttempt.stdoutText.split("\0")) {
    if (ripgrepPathText.length === 0) {
      continue;
    }

    const absolutePath = resolve(searchRootPath, ripgrepPathText);
    const workspaceFile = await loadRipgrepWorkspaceFile({
      workspaceRootPath,
      absolutePath,
    });
    if (workspaceFile) {
      files.push(workspaceFile);
    }
  }

  return {
    attemptKind: "completed",
    files,
  };
}

export async function searchWorkspaceFilesWithRipgrep(input: {
  workspaceRootPath: string;
  searchPath: string;
  isSearchPathDirectory: boolean;
  regexPattern: string;
  includeGlobPattern?: string;
  ripgrepExecutablePath?: string;
  maximumCapturedOutputCharacters?: number;
  abortSignal?: AbortSignal;
}): Promise<RipgrepGrepSearchAttempt> {
  const workspaceRootPath = await realpath(input.workspaceRootPath);
  const searchPath = await realpath(input.searchPath);
  const ripgrepSearchDirectoryPath = input.isSearchPathDirectory ? searchPath : dirname(searchPath);
  const ripgrepSearchTargetPath = input.isSearchPathDirectory ? "." : basename(searchPath);

  const ripgrepProcessAttempt = await runRipgrepProcess({
    executablePath: input.ripgrepExecutablePath ?? DEFAULT_RIPGREP_EXECUTABLE_PATH,
    workingDirectoryPath: ripgrepSearchDirectoryPath,
    args: buildRipgrepSearchArgs({
      regexPattern: input.regexPattern,
      searchTargetPath: ripgrepSearchTargetPath,
      ...(input.includeGlobPattern ? { includeGlobPattern: input.includeGlobPattern } : {}),
    }),
    ...(input.maximumCapturedOutputCharacters !== undefined
      ? { maximumStdoutCaptureCharacters: input.maximumCapturedOutputCharacters }
      : {}),
    abortSignal: input.abortSignal,
  });
  if (ripgrepProcessAttempt.attemptKind !== "completed") {
    return ripgrepProcessAttempt;
  }
  if (ripgrepProcessAttempt.exitCode !== 0 && ripgrepProcessAttempt.exitCode !== 1) {
    return {
      attemptKind: "failed",
      failureExplanation: buildRipgrepFailureExplanation(ripgrepProcessAttempt),
    };
  }

  const matches: RipgrepGrepMatch[] = [];
  const matchedFilePaths = new Set<string>();
  const fileMetadataByAbsolutePath = new Map<string, { displayPath: string; modifiedAtMilliseconds: number }>();
  for (const outputLine of splitRipgrepJsonLines(ripgrepProcessAttempt.stdoutText)) {
    const ripgrepMatchEvent = parseRipgrepJsonMatchEvent(outputLine);
    if (!ripgrepMatchEvent) {
      continue;
    }

    const absolutePath = resolve(ripgrepSearchDirectoryPath, ripgrepMatchEvent.data.path.text);
    const fileMetadata = await loadRipgrepGrepFileMetadata({
      workspaceRootPath,
      absolutePath,
      fileMetadataByAbsolutePath,
    });
    if (!fileMetadata) {
      continue;
    }

    const matchSnippet = removeSingleTrailingLineBreak(ripgrepMatchEvent.data.lines.text);
    matchedFilePaths.add(fileMetadata.displayPath);
    matches.push({
      matchFilePath: fileMetadata.displayPath,
      matchLineNumber: ripgrepMatchEvent.data.line_number,
      matchSnippet,
      fileModifiedAtMilliseconds: fileMetadata.modifiedAtMilliseconds,
    });
  }

  matches.sort((leftMatch, rightMatch) => {
    if (leftMatch.fileModifiedAtMilliseconds !== rightMatch.fileModifiedAtMilliseconds) {
      return rightMatch.fileModifiedAtMilliseconds - leftMatch.fileModifiedAtMilliseconds;
    }
    if (leftMatch.matchFilePath !== rightMatch.matchFilePath) {
      return leftMatch.matchFilePath.localeCompare(rightMatch.matchFilePath);
    }
    return leftMatch.matchLineNumber - rightMatch.matchLineNumber;
  });

  return {
    attemptKind: "completed",
    matches,
    matchedFilePaths,
  };
}

function buildRipgrepFileListArgs(includeGlobPattern: string | undefined): string[] {
  return [
    "--no-config",
    "--no-require-git",
    "--files",
    "--hidden",
    "--no-messages",
    "--null",
    ...(includeGlobPattern ? ["--glob", includeGlobPattern] : []),
    ...buildDefaultExcludedDirectoryGlobArgs(),
    ".",
  ];
}

function buildRipgrepSearchArgs(input: {
  regexPattern: string;
  searchTargetPath: string;
  includeGlobPattern?: string;
}): string[] {
  return [
    "--no-config",
    "--no-require-git",
    "--json",
    "--hidden",
    "--no-messages",
    "--engine=auto",
    ...(input.includeGlobPattern ? ["--glob", input.includeGlobPattern] : []),
    ...buildDefaultExcludedDirectoryGlobArgs(),
    "--",
    input.regexPattern,
    input.searchTargetPath,
  ];
}

function buildDefaultExcludedDirectoryGlobArgs(): string[] {
  return DEFAULT_EXCLUDED_SEARCH_DIRECTORY_NAMES.flatMap((directoryName) => ["--glob", `!**/${directoryName}/**`]);
}

async function runRipgrepProcess(input: {
  executablePath: string;
  args: readonly string[];
  workingDirectoryPath: string;
  maximumStdoutCaptureCharacters?: number;
  maximumStderrCaptureCharacters?: number;
  abortSignal: AbortSignal | undefined;
}): Promise<RipgrepProcessAttempt> {
  if (input.abortSignal?.aborted) {
    throw new Error("Ripgrep interrupted");
  }

  return new Promise<RipgrepProcessAttempt>((resolveProcess, rejectProcess) => {
    const childProcess = spawn(input.executablePath, [...input.args], {
      cwd: input.workingDirectoryPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutCapture = createBoundedRipgrepOutputCapture(
      input.maximumStdoutCaptureCharacters ?? MAX_RIPGREP_STDOUT_CAPTURE_CHARACTERS,
    );
    let stderrCapture = createBoundedRipgrepOutputCapture(
      input.maximumStderrCaptureCharacters ?? MAX_RIPGREP_STDERR_CAPTURE_CHARACTERS,
    );
    let hasSettled = false;

    const settleProcess = (settle: () => void): void => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      input.abortSignal?.removeEventListener("abort", interruptRipgrepProcess);
      settle();
    };

    function interruptRipgrepProcess(): void {
      childProcess.kill("SIGTERM");
      settleProcess(() => rejectProcess(new Error("Ripgrep interrupted")));
    }

    function failRipgrepForCapturedOutputLimit(outputName: "stderr" | "stdout", maximumCharacterCount: number): void {
      childProcess.kill("SIGTERM");
      settleProcess(() => resolveProcess({
        attemptKind: "failed",
        failureExplanation: `Ripgrep ${outputName} exceeded ${maximumCharacterCount} captured characters`,
      }));
    }

    childProcess.stdout.setEncoding("utf8");
    childProcess.stderr.setEncoding("utf8");
    childProcess.stdout.on("data", (chunk: string | Buffer) => {
      stdoutCapture = appendRipgrepOutputChunk(stdoutCapture, String(chunk));
      if (stdoutCapture.wasTruncated) {
        failRipgrepForCapturedOutputLimit("stdout", stdoutCapture.maximumCharacterCount);
      }
    });
    childProcess.stderr.on("data", (chunk: string | Buffer) => {
      stderrCapture = appendRipgrepOutputChunk(stderrCapture, String(chunk));
      if (stderrCapture.wasTruncated) {
        failRipgrepForCapturedOutputLimit("stderr", stderrCapture.maximumCharacterCount);
      }
    });
    childProcess.on("error", (error) => {
      if (hasErrorCode(error, "ENOENT")) {
        settleProcess(() => resolveProcess({
          attemptKind: "unavailable",
          failureExplanation: `Ripgrep executable not found: ${input.executablePath}`,
        }));
        return;
      }

      settleProcess(() => resolveProcess({
        attemptKind: "failed",
        failureExplanation: error.message,
      }));
    });
    childProcess.on("close", (exitCode) => {
      settleProcess(() => resolveProcess({
        attemptKind: "completed",
        exitCode: exitCode ?? 1,
        stdoutText: stdoutCapture.capturedText,
        stderrText: stderrCapture.capturedText,
      }));
    });

    input.abortSignal?.addEventListener("abort", interruptRipgrepProcess, { once: true });
    if (input.abortSignal?.aborted) {
      interruptRipgrepProcess();
    }
  });
}

function createBoundedRipgrepOutputCapture(maximumCharacterCount: number): BoundedRipgrepOutputCapture {
  return {
    capturedText: "",
    capturedCharacterCount: 0,
    maximumCharacterCount,
    wasTruncated: false,
  };
}

function appendRipgrepOutputChunk(
  ripgrepOutputCapture: BoundedRipgrepOutputCapture,
  chunk: string,
): BoundedRipgrepOutputCapture {
  const remainingCharacterCount = ripgrepOutputCapture.maximumCharacterCount - ripgrepOutputCapture.capturedCharacterCount;
  if (remainingCharacterCount <= 0) {
    return { ...ripgrepOutputCapture, wasTruncated: true };
  }

  if (chunk.length <= remainingCharacterCount) {
    return {
      ...ripgrepOutputCapture,
      capturedText: `${ripgrepOutputCapture.capturedText}${chunk}`,
      capturedCharacterCount: ripgrepOutputCapture.capturedCharacterCount + chunk.length,
    };
  }

  return {
    ...ripgrepOutputCapture,
    capturedText: `${ripgrepOutputCapture.capturedText}${chunk.slice(0, remainingCharacterCount)}`,
    capturedCharacterCount: ripgrepOutputCapture.maximumCharacterCount,
    wasTruncated: true,
  };
}

async function loadRipgrepWorkspaceFile(input: {
  workspaceRootPath: string;
  absolutePath: string;
}): Promise<RipgrepWorkspaceFile | undefined> {
  if (!isPathInsideWorkspace(input.workspaceRootPath, input.absolutePath)) {
    return undefined;
  }

  try {
    const stats = await lstat(input.absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return undefined;
    }

    return {
      absolutePath: input.absolutePath,
      displayPath: formatWorkspaceDisplayPath(input.workspaceRootPath, input.absolutePath),
      stats,
    };
  } catch {
    return undefined;
  }
}

async function loadRipgrepGrepFileMetadata(input: {
  workspaceRootPath: string;
  absolutePath: string;
  fileMetadataByAbsolutePath: Map<string, { displayPath: string; modifiedAtMilliseconds: number }>;
}): Promise<{ displayPath: string; modifiedAtMilliseconds: number } | undefined> {
  const existingFileMetadata = input.fileMetadataByAbsolutePath.get(input.absolutePath);
  if (existingFileMetadata) {
    return existingFileMetadata;
  }
  if (!isPathInsideWorkspace(input.workspaceRootPath, input.absolutePath)) {
    return undefined;
  }

  try {
    const stats = await lstat(input.absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return undefined;
    }

    const fileMetadata = {
      displayPath: formatWorkspaceDisplayPath(input.workspaceRootPath, input.absolutePath),
      modifiedAtMilliseconds: stats.mtimeMs,
    };
    input.fileMetadataByAbsolutePath.set(input.absolutePath, fileMetadata);
    return fileMetadata;
  } catch {
    return undefined;
  }
}

function buildRipgrepFailureExplanation(ripgrepProcessAttempt: Extract<RipgrepProcessAttempt, { attemptKind: "completed" }>): string {
  const stderrText = ripgrepProcessAttempt.stderrText.trim();
  return stderrText.length > 0
    ? stderrText
    : `Ripgrep failed with exit code ${ripgrepProcessAttempt.exitCode}`;
}

function splitRipgrepJsonLines(stdoutText: string): string[] {
  return stdoutText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0);
}

function parseRipgrepJsonMatchEvent(outputLine: string): RipgrepJsonMatchEvent | undefined {
  let parsedOutputLine: unknown;
  try {
    parsedOutputLine = JSON.parse(outputLine) as unknown;
  } catch {
    return undefined;
  }
  if (!isJsonObjectRecord(parsedOutputLine) || parsedOutputLine["type"] !== "match") {
    return undefined;
  }

  const matchData = parsedOutputLine["data"];
  if (!isJsonObjectRecord(matchData)) {
    return undefined;
  }
  const matchPath = matchData["path"];
  const matchLines = matchData["lines"];
  if (!isJsonObjectRecord(matchPath) || typeof matchPath["text"] !== "string") {
    return undefined;
  }
  if (!isJsonObjectRecord(matchLines) || typeof matchLines["text"] !== "string") {
    return undefined;
  }
  const matchLineNumber = matchData["line_number"];
  if (typeof matchLineNumber !== "number" || !Number.isInteger(matchLineNumber) || matchLineNumber < 1) {
    return undefined;
  }

  return {
    type: "match",
    data: {
      path: { text: matchPath["text"] },
      lines: { text: matchLines["text"] },
      line_number: matchLineNumber,
    },
  };
}

function isJsonObjectRecord(value: unknown): value is JsonObjectRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeSingleTrailingLineBreak(lineText: string): string {
  if (lineText.endsWith("\r\n")) {
    return lineText.slice(0, -2);
  }
  if (lineText.endsWith("\n") || lineText.endsWith("\r")) {
    return lineText.slice(0, -1);
  }

  return lineText;
}

function hasErrorCode(error: Error, errorCode: string): boolean {
  return (error as Error & { code?: string }).code === errorCode;
}
