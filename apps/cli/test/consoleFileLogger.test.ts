import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installConsoleFileLogger, type ConsoleMethodTarget } from "../src/consoleFileLogger.ts";

function createRecordingConsoleTarget(recordedConsoleLines: string[]): ConsoleMethodTarget {
  return {
    debug: (...consoleArguments) => recordedConsoleLines.push(`debug:${consoleArguments.join(" ")}`),
    error: (...consoleArguments) => recordedConsoleLines.push(`error:${consoleArguments.join(" ")}`),
    info: (...consoleArguments) => recordedConsoleLines.push(`info:${consoleArguments.join(" ")}`),
    log: (...consoleArguments) => recordedConsoleLines.push(`log:${consoleArguments.join(" ")}`),
    warn: (...consoleArguments) => recordedConsoleLines.push(`warn:${consoleArguments.join(" ")}`),
  };
}

test("installConsoleFileLogger leaves console methods untouched when no log file is configured", () => {
  const recordedConsoleLines: string[] = [];
  const consoleTarget = createRecordingConsoleTarget(recordedConsoleLines);
  const originalConsoleLog = consoleTarget.log;

  const installation = installConsoleFileLogger({ environment: {}, consoleTarget });
  consoleTarget.log("visible");

  expect(installation.isInstalled).toBe(false);
  expect(consoleTarget.log).toBe(originalConsoleLog);
  expect(recordedConsoleLines).toEqual(["log:visible"]);
});

test("installConsoleFileLogger writes console calls to the configured file only", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-console-logger-"));
  const logFilePath = join(directoryPath, "buli-console.log");
  const recordedConsoleLines: string[] = [];
  const consoleTarget = createRecordingConsoleTarget(recordedConsoleLines);

  const installation = installConsoleFileLogger({
    environment: {
      BULI_CONSOLE_LOG_FILE: logFilePath,
      BULI_CONSOLE_LOG_RESET: "true",
    },
    consoleTarget,
    now: () => new Date("2026-04-28T12:34:56.000Z"),
  });

  consoleTarget.log("renderArgs", { selectedModelId: "gpt-5.4" });
  consoleTarget.error(new Error("boom"));
  installation.restore();

  const logText = await readFile(logFilePath, "utf8");
  expect(installation.isInstalled).toBe(true);
  expect(recordedConsoleLines).toEqual([]);
  expect(logText).toContain("[2026-04-28T12:34:56.000Z] [log] renderArgs");
  expect(logText).toContain("selectedModelId: 'gpt-5.4'");
  expect(logText).toContain("[2026-04-28T12:34:56.000Z] [error] Error: boom");
});

test("installConsoleFileLogger can preserve existing file contents", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-console-logger-"));
  const logFilePath = join(directoryPath, "buli-console.log");
  await writeFile(logFilePath, "previous\n", "utf8");

  const recordedConsoleLines: string[] = [];
  const consoleTarget = createRecordingConsoleTarget(recordedConsoleLines);

  const installation = installConsoleFileLogger({
    environment: {
      BULI_CONSOLE_LOG_FILE: logFilePath,
    },
    consoleTarget,
    now: () => new Date("2026-04-28T12:34:56.000Z"),
  });

  consoleTarget.warn("still visible");
  installation.restore();

  const logText = await readFile(logFilePath, "utf8");
  expect(recordedConsoleLines).toEqual([]);
  expect(logText.startsWith("previous\n")).toBe(true);
  expect(logText).toContain("[2026-04-28T12:34:56.000Z] [warn] still visible");
});
