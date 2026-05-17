import { appendFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";
import type { BuliDiagnosticLogEvent, BuliDiagnosticLogger } from "@buli/contracts";

const privateDiagnosticLogDirectoryMode = 0o700;
const privateDiagnosticLogFileMode = 0o600;

export type DiagnosticFileLoggerOptions = {
  logFilePath: string;
  now?: () => Date;
};

export function createDiagnosticFileLogger(options: DiagnosticFileLoggerOptions): BuliDiagnosticLogger {
  ensurePrivateDiagnosticLogDirectory(dirname(options.logFilePath));
  tightenExistingDiagnosticLogFilePermissions(options.logFilePath);
  const now = options.now ?? (() => new Date());

  return (diagnosticLogEvent) => {
    appendFileSync(
      options.logFilePath,
      formatDiagnosticFileLogEntry({
        diagnosticLogEvent,
        loggedAt: now(),
      }),
      { encoding: "utf8", mode: privateDiagnosticLogFileMode },
    );
    chmodSync(options.logFilePath, privateDiagnosticLogFileMode);
  };
}

function ensurePrivateDiagnosticLogDirectory(logDirectoryPath: string): void {
  mkdirSync(logDirectoryPath, {
    recursive: true,
    mode: privateDiagnosticLogDirectoryMode,
  });
  chmodSync(logDirectoryPath, privateDiagnosticLogDirectoryMode);
}

function tightenExistingDiagnosticLogFilePermissions(logFilePath: string): void {
  if (existsSync(logFilePath)) {
    chmodSync(logFilePath, privateDiagnosticLogFileMode);
  }
}

function formatDiagnosticFileLogEntry(input: {
  diagnosticLogEvent: BuliDiagnosticLogEvent;
  loggedAt: Date;
}): string {
  const logEntryHeader = [
    `[${input.loggedAt.toISOString()}]`,
    "[info]",
    `[buli:${input.diagnosticLogEvent.subsystem}]`,
    input.diagnosticLogEvent.eventName,
  ].join(" ");

  if (!input.diagnosticLogEvent.fields) {
    return `${logEntryHeader}\n`;
  }

  return `${logEntryHeader} ${inspect(input.diagnosticLogEvent.fields, {
    breakLength: 80,
    colors: false,
    compact: false,
    depth: 8,
    sorted: false,
  })}\n`;
}
