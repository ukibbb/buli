import {
  emitBuliDiagnosticLogEvent,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
} from "@buli/contracts";

export function logTuiDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "tui",
    eventName,
    ...(fields ? { fields } : {}),
  });
}
