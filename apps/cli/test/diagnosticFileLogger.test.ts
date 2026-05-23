import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiagnosticFileLogger } from "../src/diagnostics/diagnosticFileLogger.ts";

async function readPermissionBits(filePath: string): Promise<number> {
  return (await stat(filePath)).mode & 0o777;
}

test("createDiagnosticFileLogger writes formatted diagnostic events directly to the log file", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-diagnostic-logger-"));
  const logFilePath = join(directoryPath, "buli-console.log");
  const diagnosticLogger = createDiagnosticFileLogger({
    logFilePath,
    now: () => new Date("2026-05-04T09:29:00.000Z"),
  });

  diagnosticLogger({
    subsystem: "tui",
    eventName: "chat_screen.render_snapshot",
    fields: {
      rows: 48,
      terminalSizeTier: "comfortable",
      conversationTurnStatus: "waiting_for_user_input",
      selectedModelId: "gpt-5.4",
      promptDraftLength: 4,
    },
  });

  await expect(readFile(logFilePath, "utf8")).resolves.toBe(
    [
      "[2026-05-04T09:29:00.000Z] [info] [buli:tui] chat_screen.render_snapshot {",
      "  rows: 48,",
      "  terminalSizeTier: 'comfortable',",
      "  conversationTurnStatus: 'waiting_for_user_input',",
      "  selectedModelId: 'gpt-5.4',",
      "  promptDraftLength: 4",
      "}\n",
    ].join("\n"),
  );
});

test("createDiagnosticFileLogger creates private log directory and file", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-diagnostic-logger-"));
  const logDirectoryPath = join(directoryPath, "logs");
  const logFilePath = join(logDirectoryPath, "buli-console.log");
  const diagnosticLogger = createDiagnosticFileLogger({ logFilePath });

  diagnosticLogger({
    subsystem: "engine",
    eventName: "conversation_turn.accepted",
  });

  await expect(readPermissionBits(logDirectoryPath)).resolves.toBe(0o700);
  await expect(readPermissionBits(logFilePath)).resolves.toBe(0o600);
});

test("createDiagnosticFileLogger tightens existing log permissions", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-diagnostic-logger-"));
  const logDirectoryPath = join(directoryPath, "logs");
  const logFilePath = join(logDirectoryPath, "buli-console.log");
  await mkdir(logDirectoryPath, { recursive: true });
  await writeFile(logFilePath, "previous\n", "utf8");
  await chmod(logDirectoryPath, 0o777);
  await chmod(logFilePath, 0o666);

  const diagnosticLogger = createDiagnosticFileLogger({ logFilePath });
  diagnosticLogger({
    subsystem: "tui",
    eventName: "chat_screen_root_rendered",
  });

  await expect(readPermissionBits(logDirectoryPath)).resolves.toBe(0o700);
  await expect(readPermissionBits(logFilePath)).resolves.toBe(0o600);
  await expect(readFile(logFilePath, "utf8")).resolves.toContain("previous\n");
});
