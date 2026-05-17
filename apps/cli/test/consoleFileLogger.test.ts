import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installConsoleFileLogger, type ConsoleMethodTarget } from "../src/consoleFileLogger.ts";

async function readPermissionBits(filePath: string): Promise<number> {
  return (await stat(filePath)).mode & 0o777;
}

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
  const logDirectoryPath = join(directoryPath, "logs");
  const logFilePath = join(logDirectoryPath, "buli-console.log");
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
  await expect(readPermissionBits(logDirectoryPath)).resolves.toBe(0o700);
  await expect(readPermissionBits(logFilePath)).resolves.toBe(0o600);
  expect(logText).toContain("[2026-04-28T12:34:56.000Z] [log] renderArgs");
  expect(logText).toContain("selectedModelId: 'gpt-5.4'");
  expect(logText).toContain("[2026-04-28T12:34:56.000Z] [error] Error: boom");
});

test("installConsoleFileLogger can preserve existing file contents", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-console-logger-"));
  const logDirectoryPath = join(directoryPath, "logs");
  const logFilePath = join(logDirectoryPath, "buli-console.log");
  await mkdir(logDirectoryPath, { recursive: true });
  await writeFile(logFilePath, "previous\n", "utf8");
  await chmod(logDirectoryPath, 0o777);
  await chmod(logFilePath, 0o666);

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
  await expect(readPermissionBits(logDirectoryPath)).resolves.toBe(0o700);
  await expect(readPermissionBits(logFilePath)).resolves.toBe(0o600);
  expect(logText.startsWith("previous\n")).toBe(true);
  expect(logText).toContain("[2026-04-28T12:34:56.000Z] [warn] still visible");
});
