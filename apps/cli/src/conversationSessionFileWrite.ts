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
const processHeldConversationSessionWriteLocks = new Map<string, ProcessHeldConversationSessionWriteLock>();
const privateConversationSessionDirectoryMode = 0o700;
const privateConversationSessionFileMode = 0o600;

type ConversationSessionWriteLockFile = {
  processId: number;
  acquiredAtMs: number;
  rawLockFileText: string;
  lockOwnerId?: string;
};

type AcquiredConversationSessionWriteLock = {
  lockOwnerId: string;
};

type ProcessHeldConversationSessionWriteLock = AcquiredConversationSessionWriteLock & {
  heldLockCount: number;
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
  const processHeldLock = processHeldConversationSessionWriteLocks.get(resolvedLockFilePath);
  if (processHeldLock) {
    processHeldLock.heldLockCount += 1;
    try {
      return writeConversationSessionFiles();
    } finally {
      releaseProcessHeldConversationSessionWriteLock({ lockFilePath: resolvedLockFilePath, removeLockFile: false });
    }
  }

  const acquiredConversationSessionWriteLock = acquireConversationSessionWriteLock({
    lockFilePath: resolvedLockFilePath,
    waitTimeoutMs: input.waitTimeoutMs ?? defaultConversationSessionWriteLockWaitTimeoutMs,
    retryDelayMs: input.retryDelayMs ?? defaultConversationSessionWriteLockRetryDelayMs,
    staleLockAgeMs: input.staleLockAgeMs ?? defaultConversationSessionStaleLockAgeMs,
  });
  processHeldConversationSessionWriteLocks.set(resolvedLockFilePath, {
    ...acquiredConversationSessionWriteLock,
    heldLockCount: 1,
  });

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
}): AcquiredConversationSessionWriteLock {
  ensurePrivateConversationSessionDirectory(dirname(input.lockFilePath));
  const waitStartedAtMs = Date.now();
  const lockWaitTimeoutMs = Math.max(0, input.waitTimeoutMs);
  const lockRetryDelayMs = Math.max(1, input.retryDelayMs);

  while (true) {
    const acquiredConversationSessionWriteLock = tryAcquireConversationSessionWriteLock(input.lockFilePath);
    if (acquiredConversationSessionWriteLock) {
      return acquiredConversationSessionWriteLock;
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

  const currentLockFile = readConversationSessionWriteLockFile(input.lockFilePath);
  if (
    !currentLockFile ||
    currentLockFile.rawLockFileText !== lockFile.rawLockFileText ||
    (lockFile.lockOwnerId !== undefined && currentLockFile.lockOwnerId !== lockFile.lockOwnerId)
  ) {
    return false;
  }

  rmSync(input.lockFilePath, { force: true });
  return true;
}

function readConversationSessionWriteLockFile(lockFilePath: string): ConversationSessionWriteLockFile | undefined {
  try {
    const rawLockFileText = readFileSync(lockFilePath, "utf8");
    const parsedLockFile = JSON.parse(rawLockFileText) as unknown;
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
      const lockOwnerId = "lockOwnerId" in parsedLockFile ? parsedLockFile.lockOwnerId : undefined;
      if (lockOwnerId !== undefined && (typeof lockOwnerId !== "string" || lockOwnerId.length === 0)) {
        return undefined;
      }

      return {
        processId: parsedLockFile.processId,
        acquiredAtMs: parsedLockFile.acquiredAtMs,
        rawLockFileText,
        ...(lockOwnerId !== undefined ? { lockOwnerId } : {}),
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

function tryAcquireConversationSessionWriteLock(lockFilePath: string): AcquiredConversationSessionWriteLock | undefined {
  let lockFileDescriptor: number | undefined;
  const lockOwnerId = randomUUID();
  try {
    lockFileDescriptor = openSync(lockFilePath, "wx", privateConversationSessionFileMode);
    writeFileSync(
      lockFileDescriptor,
      JSON.stringify({ processId: process.pid, acquiredAtMs: Date.now(), lockOwnerId }) + "\n",
      "utf8",
    );
    return { lockOwnerId };
  } catch (error) {
    if (lockFileDescriptor !== undefined) {
      rmSync(lockFilePath, { force: true });
    }
    if (isNodeErrorWithCode(error, "EEXIST")) {
      return undefined;
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
  const processHeldLock = processHeldConversationSessionWriteLocks.get(input.lockFilePath);
  if (!processHeldLock) {
    return;
  }

  if (processHeldLock.heldLockCount > 1) {
    processHeldLock.heldLockCount -= 1;
    return;
  }

  processHeldConversationSessionWriteLocks.delete(input.lockFilePath);
  if (input.removeLockFile && isConversationSessionWriteLockOwnedBy(input.lockFilePath, processHeldLock.lockOwnerId)) {
    rmSync(input.lockFilePath, { force: true });
  }
}

function isConversationSessionWriteLockOwnedBy(lockFilePath: string, lockOwnerId: string): boolean {
  return readConversationSessionWriteLockFile(lockFilePath)?.lockOwnerId === lockOwnerId;
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
