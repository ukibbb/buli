import { mkdtemp, readFile, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  isOpenAiDebugLoggingEnabled,
  resolveOpenAiDebugLogFilePath,
  writeOpenAiDebugLog,
} from "../src/provider/debugLog.ts";

test("isOpenAiDebugLoggingEnabled recognizes enabled values", () => {
  expect(isOpenAiDebugLoggingEnabled({ BULI_OPENAI_DEBUG_LOG: "true" })).toBe(true);
  expect(isOpenAiDebugLoggingEnabled({ BULI_OPENAI_DEBUG_LOG: "off" })).toBe(false);
});

test("resolveOpenAiDebugLogFilePath defaults to the private buli log directory", () => {
  expect(resolveOpenAiDebugLogFilePath({})).toBe(join(homedir(), ".buli", "logs", "openai-debug.md"));
});

test("writeOpenAiDebugLog writes enabled logs to an explicit private file", async () => {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "buli-openai-debug-log-"));
  const logFilePath = join(temporaryDirectoryPath, "openai-debug.md");

  await writeOpenAiDebugLog("OpenAI debug title", { requestId: "req_123" }, {
    environment: {
      BULI_OPENAI_DEBUG_LOG: "1",
      BULI_OPENAI_DEBUG_LOG_FILE: logFilePath,
    },
  });

  await expect(readFile(logFilePath, "utf8")).resolves.toContain("OpenAI debug title");
  await expect(readFile(logFilePath, "utf8")).resolves.toContain("req_123");
  expect((await stat(logFilePath)).mode & 0o777).toBe(0o600);
});
