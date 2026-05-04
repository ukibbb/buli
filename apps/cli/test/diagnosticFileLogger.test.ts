import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiagnosticFileLogger } from "../src/diagnosticFileLogger.ts";

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
