export type BuliDiagnosticSubsystem = "cli" | "engine" | "openai" | "tui";

export type BuliDiagnosticLogPrimitive = boolean | number | string | null;

export type BuliDiagnosticLogFieldValue = BuliDiagnosticLogPrimitive | readonly BuliDiagnosticLogPrimitive[];

export type BuliDiagnosticLogFields = Readonly<Record<string, BuliDiagnosticLogFieldValue>>;

export type BuliDiagnosticLogEvent = Readonly<{
  subsystem: BuliDiagnosticSubsystem;
  eventName: string;
  fields?: BuliDiagnosticLogFields;
}>;

export type BuliDiagnosticLogger = (event: BuliDiagnosticLogEvent) => void;

export const noopBuliDiagnosticLogger: BuliDiagnosticLogger = () => {};

export function emitBuliDiagnosticLogEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  diagnosticLogEvent: BuliDiagnosticLogEvent,
): void {
  try {
    diagnosticLogger?.(diagnosticLogEvent);
  } catch {
    // Diagnostics must never change product behavior.
  }
}
