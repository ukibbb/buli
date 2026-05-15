import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const defaultConversationSessionWriteLockWaitTimeoutMs = 5_000;
const defaultConversationSessionWriteLockRetryDelayMs = 25;
const processHeldConversationSessionWriteLockCounts = new Map<string, number>();

export function runWithExclusiveConversationSessionFileWriteLock<T>(
  input: {
    lockFilePath: string;
    waitTimeoutMs?: number;
    retryDelayMs?: number;
  },
  writeConversationSessionFiles: () => T,
): T {
  const resolvedLockFilePath = resolve(input.lockFilePath);
  const processHeldLockCount = processHeldConversationSessionWriteLockCounts.get(resolvedLockFilePath) ?? 0;
  if (processHeldLockCount > 0) {
    processHeldConversationSessionWriteLockCounts.set(resolvedLockFilePath, processHeldLockCount + 1);
    try {
      return writeConversationSessionFiles();
    } finally {
      releaseProcessHeldConversationSessionWriteLock({ lockFilePath: resolvedLockFilePath, removeLockFile: false });
    }
  }

  acquireConversationSessionWriteLock({
    lockFilePath: resolvedLockFilePath,
    waitTimeoutMs: input.waitTimeoutMs ?? defaultConversationSessionWriteLockWaitTimeoutMs,
    retryDelayMs: input.retryDelayMs ?? defaultConversationSessionWriteLockRetryDelayMs,
  });
  processHeldConversationSessionWriteLockCounts.set(resolvedLockFilePath, 1);

  try {
    return writeConversationSessionFiles();
  } finally {
    releaseProcessHeldConversationSessionWriteLock({ lockFilePath: resolvedLockFilePath, removeLockFile: true });
  }
}

export function writeConversationSessionTextFileAtomically(input: { filePath: string; text: string }): void {
  const fileDirectoryPath = dirname(input.filePath);
  const temporaryFilePath = join(
    fileDirectoryPath,
    `.${basename(input.filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let temporaryFileWasCreated = false;

  mkdirSync(fileDirectoryPath, { recursive: true });
  try {
    writeFileSync(temporaryFilePath, input.text, "utf8");
    temporaryFileWasCreated = true;
    renameSync(temporaryFilePath, input.filePath);
    temporaryFileWasCreated = false;
  } finally {
    if (temporaryFileWasCreated) {
      rmSync(temporaryFilePath, { force: true });
    }
  }
}

export function appendConversationSessionTextFileLineAtomically(input: { filePath: string; lineText: string }): void {
  if (/[\r\n]/u.test(input.lineText)) {
    throw new Error("Conversation session append text must be a single line.");
  }

  const existingText = existsSync(input.filePath) ? readFileSync(input.filePath, "utf8") : "";
  const existingTextWithLineBoundary = existingText.length === 0 || existingText.endsWith("\n") ? existingText : `${existingText}\n`;
  writeConversationSessionTextFileAtomically({
    filePath: input.filePath,
    text: `${existingTextWithLineBoundary}${input.lineText}\n`,
  });
}

function acquireConversationSessionWriteLock(input: {
  lockFilePath: string;
  waitTimeoutMs: number;
  retryDelayMs: number;
}): void {
  mkdirSync(dirname(input.lockFilePath), { recursive: true });
  const waitStartedAtMs = Date.now();
  const lockWaitTimeoutMs = Math.max(0, input.waitTimeoutMs);
  const lockRetryDelayMs = Math.max(1, input.retryDelayMs);

  while (true) {
    const wasLockAcquired = tryAcquireConversationSessionWriteLock(input.lockFilePath);
    if (wasLockAcquired) {
      return;
    }

    const elapsedWaitMs = Date.now() - waitStartedAtMs;
    if (elapsedWaitMs >= lockWaitTimeoutMs) {
      throw new Error(`Timed out waiting for conversation session write lock: ${input.lockFilePath}`);
    }

    sleepSynchronously(Math.min(lockRetryDelayMs, lockWaitTimeoutMs - elapsedWaitMs));
  }
}

function tryAcquireConversationSessionWriteLock(lockFilePath: string): boolean {
  let lockFileDescriptor: number | undefined;
  try {
    lockFileDescriptor = openSync(lockFilePath, "wx");
    writeFileSync(
      lockFileDescriptor,
      JSON.stringify({ processId: process.pid, acquiredAtMs: Date.now() }) + "\n",
      "utf8",
    );
    return true;
  } catch (error) {
    if (lockFileDescriptor !== undefined) {
      rmSync(lockFilePath, { force: true });
    }
    if (isNodeErrorWithCode(error, "EEXIST")) {
      return false;
    }
    throw error;
  } finally {
    if (lockFileDescriptor !== undefined) {
      closeSync(lockFileDescriptor);
    }
  }
}

function releaseProcessHeldConversationSessionWriteLock(input: {
  lockFilePath: string;
  removeLockFile: boolean;
}): void {
  const processHeldLockCount = processHeldConversationSessionWriteLockCounts.get(input.lockFilePath) ?? 0;
  if (processHeldLockCount > 1) {
    processHeldConversationSessionWriteLockCounts.set(input.lockFilePath, processHeldLockCount - 1);
    return;
  }

  processHeldConversationSessionWriteLockCounts.delete(input.lockFilePath);
  if (input.removeLockFile) {
    rmSync(input.lockFilePath, { force: true });
  }
}

function sleepSynchronously(delayMs: number): void {
  if (delayMs <= 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}
