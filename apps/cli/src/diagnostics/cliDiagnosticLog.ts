import {
  emitBuliDiagnosticLogEvent,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
} from "@buli/contracts";

export function logCliDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "cli",
    eventName,
    ...(fields ? { fields } : {}),
  });
}
