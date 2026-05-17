import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendConversationSessionTextFileLineAtomically,
  runWithExclusiveConversationSessionFileWriteLock,
  writeConversationSessionTextFileAtomically,
} from "../src/conversationSessionFileWrite.ts";

test("writeConversationSessionTextFileAtomically replaces text without leaving a temporary file", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-atomic-"));
  const filePath = join(directoryPath, "active-session.json");
  await writeFile(filePath, "old\n", "utf8");

  writeConversationSessionTextFileAtomically({
    filePath,
    text: '{"activeConversationSessionId":"session-1"}\n',
  });

  expect(await readFile(filePath, "utf8")).toBe('{"activeConversationSessionId":"session-1"}\n');
  expect((await readdir(directoryPath)).filter((fileName) => fileName.includes(".tmp"))).toEqual([]);
  expect((await stat(directoryPath)).mode & 0o777).toBe(0o700);
  expect((await stat(filePath)).mode & 0o777).toBe(0o600);
});

test("appendConversationSessionTextFileLineAtomically appends one line without leaving a temporary file", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-atomic-append-"));
  const filePath = join(directoryPath, "session.jsonl");
  await writeFile(filePath, "first\n", "utf8");

  appendConversationSessionTextFileLineAtomically({
    filePath,
    lineText: "second",
  });

  expect(await readFile(filePath, "utf8")).toBe("first\nsecond\n");
  expect((await readdir(directoryPath)).filter((fileName) => fileName.includes(".tmp"))).toEqual([]);
  expect((await stat(directoryPath)).mode & 0o777).toBe(0o700);
  expect((await stat(filePath)).mode & 0o777).toBe(0o600);
});

test("appendConversationSessionTextFileLineAtomically preserves line boundaries without a trailing newline", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-atomic-append-boundary-"));
  const filePath = join(directoryPath, "session.jsonl");
  await writeFile(filePath, "first", "utf8");

  appendConversationSessionTextFileLineAtomically({
    filePath,
    lineText: "second",
  });

  expect(await readFile(filePath, "utf8")).toBe("first\nsecond\n");
});

test("appendConversationSessionTextFileLineAtomically rejects multiline text before writing", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-atomic-append-invalid-"));
  const filePath = join(directoryPath, "session.jsonl");
  await writeFile(filePath, "first\n", "utf8");

  expect(() =>
    appendConversationSessionTextFileLineAtomically({
      filePath,
      lineText: "second\nthird",
    }),
  ).toThrow("single line");
  expect(await readFile(filePath, "utf8")).toBe("first\n");
});

test("runWithExclusiveConversationSessionFileWriteLock removes the lock after a successful write", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-lock-"));
  const lockFilePath = join(directoryPath, "session-store.lock");

  const writeResult = runWithExclusiveConversationSessionFileWriteLock({ lockFilePath }, () => "written");

  expect(writeResult).toBe("written");
  expect((await readdir(directoryPath)).includes("session-store.lock")).toBe(false);
});

test("runWithExclusiveConversationSessionFileWriteLock supports nested writes in one process", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-nested-lock-"));
  const lockFilePath = join(directoryPath, "session-store.lock");

  const writeResult = runWithExclusiveConversationSessionFileWriteLock({ lockFilePath }, () =>
    runWithExclusiveConversationSessionFileWriteLock({ lockFilePath }, () => "nested-write"),
  );

  expect(writeResult).toBe("nested-write");
  expect((await readdir(directoryPath)).includes("session-store.lock")).toBe(false);
});

test("runWithExclusiveConversationSessionFileWriteLock fails clearly when another writer holds the lock", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-held-lock-"));
  const lockFilePath = join(directoryPath, "session-store.lock");
  await writeFile(lockFilePath, "held by another process\n", "utf8");

  expect(() =>
    runWithExclusiveConversationSessionFileWriteLock(
      { lockFilePath, waitTimeoutMs: 1, retryDelayMs: 1 },
      () => "should not run",
    ),
  ).toThrow("Timed out waiting for conversation session write lock");
  expect(await readFile(lockFilePath, "utf8")).toBe("held by another process\n");
});

test("runWithExclusiveConversationSessionFileWriteLock recovers stale locks from dead processes", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-stale-lock-"));
  const lockFilePath = join(directoryPath, "session-store.lock");
  await writeFile(lockFilePath, JSON.stringify({ processId: 99_999_999, acquiredAtMs: 0 }) + "\n", "utf8");

  const writeResult = runWithExclusiveConversationSessionFileWriteLock(
    { lockFilePath, waitTimeoutMs: 100, retryDelayMs: 1, staleLockAgeMs: 0 },
    () => "recovered-write",
  );

  expect(writeResult).toBe("recovered-write");
  expect((await readdir(directoryPath)).includes("session-store.lock")).toBe(false);
});

test("runWithExclusiveConversationSessionFileWriteLock does not remove a lock that changed owner before release", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-file-write-stolen-lock-"));
  const lockFilePath = join(directoryPath, "session-store.lock");
  const replacementLockFile = {
    processId: 99_999_999,
    acquiredAtMs: 1234,
    lockOwnerId: "replacement-owner",
  };

  const writeResult = runWithExclusiveConversationSessionFileWriteLock({ lockFilePath }, () => {
    writeFileSync(lockFilePath, JSON.stringify(replacementLockFile) + "\n", "utf8");
    return "release-with-changed-owner";
  });

  expect(writeResult).toBe("release-with-changed-owner");
  expect(JSON.parse(await readFile(lockFilePath, "utf8")) as unknown).toEqual(replacementLockFile);
});
