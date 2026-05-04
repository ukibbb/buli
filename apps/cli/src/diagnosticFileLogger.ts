import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";
import type { BuliDiagnosticLogEvent, BuliDiagnosticLogger } from "@buli/contracts";

export type DiagnosticFileLoggerOptions = {
  logFilePath: string;
  now?: () => Date;
};

export function createDiagnosticFileLogger(options: DiagnosticFileLoggerOptions): BuliDiagnosticLogger {
  mkdirSync(dirname(options.logFilePath), { recursive: true });
  const now = options.now ?? (() => new Date());

  return (diagnosticLogEvent) => {
    appendFileSync(
      options.logFilePath,
      formatDiagnosticFileLogEntry({
        diagnosticLogEvent,
        loggedAt: now(),
      }),
      "utf8",
    );
  };
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
