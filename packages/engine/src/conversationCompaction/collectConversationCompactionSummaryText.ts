import type {
  BuliDiagnosticLogger,
  ProviderStreamEvent,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "../provider.ts";
import {
  logEngineDiagnosticEvent,
  summarizeProviderStreamEventForDiagnostics,
} from "../runtimeDiagnostics.ts";

export async function collectConversationCompactionSummaryText(input: {
  providerConversationTurn: ProviderConversationTurn;
  diagnosticLogger: BuliDiagnosticLogger | undefined;
  onCompactionSummaryTextUpdated?: ((summaryText: string) => void) | undefined;
}): Promise<string> {
  let summaryText = "";

  for await (const providerStreamEvent of input.providerConversationTurn.streamProviderEvents()) {
    logEngineDiagnosticEvent(input.diagnosticLogger, "conversation_compaction.provider_event_received", {
      eventType: providerStreamEvent.type,
      ...summarizeProviderStreamEventForDiagnostics(providerStreamEvent),
    });

    if (providerStreamEvent.type === "text_chunk") {
      summaryText += providerStreamEvent.text;
      input.onCompactionSummaryTextUpdated?.(summaryText);
      continue;
    }

    if (providerStreamEvent.type === "completed") {
      const trimmedSummaryText = summaryText.trim();
      if (trimmedSummaryText.length === 0) {
        throw new Error("Conversation compaction produced an empty summary.");
      }

      return trimmedSummaryText;
    }

    throwIfProviderEventCannotAppearDuringCompaction(providerStreamEvent);
  }

  throw new Error("Conversation compaction provider stream ended before completion.");
}

function throwIfProviderEventCannotAppearDuringCompaction(providerStreamEvent: ProviderStreamEvent): void {
  if (
    providerStreamEvent.type === "reasoning_summary_started" ||
    providerStreamEvent.type === "reasoning_summary_text_chunk" ||
    providerStreamEvent.type === "reasoning_summary_completed" ||
    providerStreamEvent.type === "rate_limit_pending"
  ) {
    return;
  }

  if (providerStreamEvent.type === "incomplete") {
    throw new Error(`Conversation compaction ended incomplete: ${providerStreamEvent.incompleteReason}`);
  }

  if (providerStreamEvent.type === "tool_call_requested") {
    throw new Error(`Conversation compaction unexpectedly requested tool ${providerStreamEvent.toolCallRequest.toolName}.`);
  }

  if (providerStreamEvent.type === "tool_calls_requested") {
    throw new Error(`Conversation compaction unexpectedly requested ${providerStreamEvent.requestedToolCalls.length} tools.`);
  }

  throw new Error("Conversation compaction unexpectedly produced a plan proposal.");
}
