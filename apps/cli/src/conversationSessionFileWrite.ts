import { randomUUID } from "node:crypto";
import {
  closeSync,
  chmodSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const defaultConversationSessionWriteLockWaitTimeoutMs = 5_000;
const defaultConversationSessionWriteLockRetryDelayMs = 25;
const defaultConversationSessionStaleLockAgeMs = 30 * 60 * 1000;
const processHeldConversationSessionWriteLockCounts = new Map<string, number>();
const privateConversationSessionDirectoryMode = 0o700;
const privateConversationSessionFileMode = 0o600;

type ConversationSessionWriteLockFile = {
  processId: number;
  acquiredAtMs: number;
};

export function runWithExclusiveConversationSessionFileWriteLock<T>(
  input: {
    lockFilePath: string;
    waitTimeoutMs?: number;
    retryDelayMs?: number;
    staleLockAgeMs?: number;
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
    staleLockAgeMs: input.staleLockAgeMs ?? defaultConversationSessionStaleLockAgeMs,
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

  ensurePrivateConversationSessionDirectory(fileDirectoryPath);
  try {
    writeFileSync(temporaryFilePath, input.text, { encoding: "utf8", mode: privateConversationSessionFileMode });
    chmodSync(temporaryFilePath, privateConversationSessionFileMode);
    temporaryFileWasCreated = true;
    renameSync(temporaryFilePath, input.filePath);
    chmodSync(input.filePath, privateConversationSessionFileMode);
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

  ensurePrivateConversationSessionDirectory(dirname(input.filePath));
  const fileDescriptor = openSync(input.filePath, "a+", privateConversationSessionFileMode);
  try {
    chmodSync(input.filePath, privateConversationSessionFileMode);
    const fileStats = fstatSync(fileDescriptor);
    if (fileStats.size > 0) {
      const finalByte = Buffer.alloc(1);
      readSync(fileDescriptor, finalByte, 0, 1, fileStats.size - 1);
      if (finalByte[0] !== 10) {
        writeSync(fileDescriptor, "\n", null, "utf8");
      }
    }
    writeSync(fileDescriptor, `${input.lineText}\n`, null, "utf8");
    fsyncSync(fileDescriptor);
  } finally {
    closeSync(fileDescriptor);
  }
}

function acquireConversationSessionWriteLock(input: {
  lockFilePath: string;
  waitTimeoutMs: number;
  retryDelayMs: number;
  staleLockAgeMs: number;
}): void {
  ensurePrivateConversationSessionDirectory(dirname(input.lockFilePath));
  const waitStartedAtMs = Date.now();
  const lockWaitTimeoutMs = Math.max(0, input.waitTimeoutMs);
  const lockRetryDelayMs = Math.max(1, input.retryDelayMs);

  while (true) {
    const wasLockAcquired = tryAcquireConversationSessionWriteLock(input.lockFilePath);
    if (wasLockAcquired) {
      return;
    }

    if (tryRecoverStaleConversationSessionWriteLock({
      lockFilePath: input.lockFilePath,
      staleLockAgeMs: input.staleLockAgeMs,
    })) {
      continue;
    }

    const elapsedWaitMs = Date.now() - waitStartedAtMs;
    if (elapsedWaitMs >= lockWaitTimeoutMs) {
      throw new Error(`Timed out waiting for conversation session write lock: ${input.lockFilePath}`);
    }

    sleepSynchronously(Math.min(lockRetryDelayMs, lockWaitTimeoutMs - elapsedWaitMs));
  }
}

function tryRecoverStaleConversationSessionWriteLock(input: {
  lockFilePath: string;
  staleLockAgeMs: number;
}): boolean {
  const lockFile = readConversationSessionWriteLockFile(input.lockFilePath);
  if (!lockFile) {
    return false;
  }

  const lockAgeMs = Date.now() - lockFile.acquiredAtMs;
  if (lockAgeMs < Math.max(0, input.staleLockAgeMs) || isProcessAlive(lockFile.processId)) {
    return false;
  }

  rmSync(input.lockFilePath, { force: true });
  return true;
}

function readConversationSessionWriteLockFile(lockFilePath: string): ConversationSessionWriteLockFile | undefined {
  try {
    const parsedLockFile = JSON.parse(readFileSync(lockFilePath, "utf8")) as unknown;
    if (
      typeof parsedLockFile === "object" &&
      parsedLockFile !== null &&
      "processId" in parsedLockFile &&
      "acquiredAtMs" in parsedLockFile &&
      typeof parsedLockFile.processId === "number" &&
      Number.isInteger(parsedLockFile.processId) &&
      parsedLockFile.processId > 0 &&
      typeof parsedLockFile.acquiredAtMs === "number" &&
      Number.isFinite(parsedLockFile.acquiredAtMs)
    ) {
      return {
        processId: parsedLockFile.processId,
        acquiredAtMs: parsedLockFile.acquiredAtMs,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (isNodeErrorWithCode(error, "ESRCH")) {
      return false;
    }

    return true;
  }
}

function tryAcquireConversationSessionWriteLock(lockFilePath: string): boolean {
  let lockFileDescriptor: number | undefined;
  try {
    lockFileDescriptor = openSync(lockFilePath, "wx", privateConversationSessionFileMode);
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

function ensurePrivateConversationSessionDirectory(directoryPath: string): void {
  mkdirSync(directoryPath, { recursive: true, mode: privateConversationSessionDirectoryMode });
  chmodSync(directoryPath, privateConversationSessionDirectoryMode);
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
