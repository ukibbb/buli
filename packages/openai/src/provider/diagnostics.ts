import {
  emitBuliDiagnosticLogEvent,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
  type ToolCallRequest,
} from "@buli/contracts";
export { summarizeTokenUsageForDiagnostics } from "@buli/contracts";

export function logOpenAiDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "openai",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

export function summarizeOpenAiToolCallRequestForDiagnostics(
  toolCallRequest: ToolCallRequest,
): BuliDiagnosticLogFields {
  if (toolCallRequest.toolName !== "bash") {
    return {
      toolName: toolCallRequest.toolName,
    };
  }

  return {
    toolName: toolCallRequest.toolName,
    shellCommandLength: toolCallRequest.shellCommand.length,
    commandDescriptionLength: toolCallRequest.commandDescription.length,
    hasWorkingDirectoryPath: toolCallRequest.workingDirectoryPath !== undefined,
    hasTimeoutMilliseconds: toolCallRequest.timeoutMilliseconds !== undefined,
  };
}
