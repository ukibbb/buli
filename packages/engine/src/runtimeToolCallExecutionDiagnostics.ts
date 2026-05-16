import type { AssistantResponseEvent, BuliDiagnosticLogger } from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { logEngineDiagnosticEvent, summarizeAssistantResponseEventForDiagnostics } from "./runtimeDiagnostics.ts";

export type SubmittedToolResultKind = "completed" | "failed" | "denied";

export function logAssistantResponseEventEmitted(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  assistantResponseEvent: AssistantResponseEvent,
): AssistantResponseEvent {
  logEngineDiagnosticEvent(diagnosticLogger, "assistant_response_event.emitted", {
    eventType: assistantResponseEvent.type,
    ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
  });
  return assistantResponseEvent;
}

export async function submitProviderToolResultWithDiagnostics(input: {
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  toolResultText: string;
  toolResultKind: SubmittedToolResultKind;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<void> {
  logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.tool_result_submitted", {
    toolCallId: input.toolCallId,
    toolResultKind: input.toolResultKind,
    toolResultTextLength: input.toolResultText.length,
  });
  await input.providerConversationTurn.submitToolResult({
    toolCallId: input.toolCallId,
    toolResultText: input.toolResultText,
  });
}
