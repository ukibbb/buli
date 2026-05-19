import {
  emitBuliDiagnosticLogEvent,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
} from "@buli/contracts";

export function logChatAppControllerDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "chat_app_controller",
    eventName,
    ...(fields ? { fields } : {}),
  });
}
