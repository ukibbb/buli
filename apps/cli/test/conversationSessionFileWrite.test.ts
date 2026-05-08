import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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
