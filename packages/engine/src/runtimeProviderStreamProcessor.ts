import type {
  AssistantResponseEvent,
  BuliDiagnosticLogger,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import {
  streamAssistantResponseEventsForRequestedToolCalls,
  type RuntimeToolCallExecutionContext,
} from "./runtimeToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeProviderStreamEventTranslator } from "./runtimeProviderStreamEventTranslator.ts";
import {
  logEngineDiagnosticEvent,
  summarizeProviderStreamEventForDiagnostics,
} from "./runtimeDiagnostics.ts";

export type RuntimeProviderStreamProcessingOutcome =
  | { outcomeKind: "terminal_assistant_response" }
  | { outcomeKind: "provider_stream_ended" };

export async function* streamAssistantResponseEventsFromProviderStream(input: {
  providerConversationTurn: ProviderConversationTurn;
  providerStreamEventTranslator: RuntimeProviderStreamEventTranslator;
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  createRequestedToolCallsExecutionContext: () => RuntimeToolCallExecutionContext;
  throwIfConversationTurnInterrupted: () => void;
  logAssistantResponseEventEmitted: (assistantResponseEvent: AssistantResponseEvent) => AssistantResponseEvent;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<AssistantResponseEvent, RuntimeProviderStreamProcessingOutcome> {
  for await (const providerStreamEvent of input.providerConversationTurn.streamProviderEvents()) {
    input.throwIfConversationTurnInterrupted();
    logEngineDiagnosticEvent(input.diagnosticLogger, "provider_stream.event_received", {
      eventType: providerStreamEvent.type,
      ...summarizeProviderStreamEventForDiagnostics(providerStreamEvent),
    });

    const providerStreamEventTranslation = input.providerStreamEventTranslator.translateProviderStreamEvent({
      providerStreamEvent,
      providerTurnReplay: providerStreamEvent.type === "completed" || providerStreamEvent.type === "incomplete"
        ? input.providerConversationTurn.getProviderTurnReplay()
        : undefined,
    });

    if (providerStreamEventTranslation.translationKind === "assistant_response_events") {
      for (const assistantResponseEvent of providerStreamEventTranslation.assistantResponseEvents) {
        yield input.logAssistantResponseEventEmitted(assistantResponseEvent);
      }
      for (const assistantSegmentSessionEntry of providerStreamEventTranslation.assistantSegmentSessionEntries ?? []) {
        input.conversationTurnSessionRecorder.appendAssistantSegmentSessionEntry(assistantSegmentSessionEntry);
      }
      continue;
    }

    if (
      providerStreamEventTranslation.translationKind === "tool_call_requested" ||
      providerStreamEventTranslation.translationKind === "tool_calls_requested"
    ) {
      for (const assistantResponseEvent of providerStreamEventTranslation.assistantResponseEventsBeforeToolCall ?? []) {
        yield input.logAssistantResponseEventEmitted(assistantResponseEvent);
      }
      for (const assistantSegmentSessionEntry of providerStreamEventTranslation.assistantSegmentSessionEntriesBeforeToolCall ?? []) {
        input.conversationTurnSessionRecorder.appendAssistantSegmentSessionEntry(assistantSegmentSessionEntry);
      }
      yield* streamAssistantResponseEventsForRequestedToolCalls({
        ...input.createRequestedToolCallsExecutionContext(),
        requestedToolCalls: providerStreamEventTranslation.translationKind === "tool_call_requested"
          ? [{
              toolCallId: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallId,
              toolCallRequest: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallRequest,
            }]
          : providerStreamEventTranslation.providerToolCallsRequestedEvent.requestedToolCalls,
      });
      continue;
    }

    for (const assistantResponseEvent of providerStreamEventTranslation.assistantResponseEventsBeforeTerminalSessionEntry) {
      yield input.logAssistantResponseEventEmitted(assistantResponseEvent);
    }
    for (const assistantSegmentSessionEntry of providerStreamEventTranslation.assistantSegmentSessionEntriesBeforeTerminalSessionEntry ?? []) {
      input.conversationTurnSessionRecorder.appendAssistantSegmentSessionEntry(assistantSegmentSessionEntry);
    }
    input.conversationTurnSessionRecorder.appendTerminalAssistantMessageSessionEntry(
      providerStreamEventTranslation.terminalAssistantMessageSessionEntry,
    );
    yield input.logAssistantResponseEventEmitted(providerStreamEventTranslation.terminalAssistantResponseEvent);
    return { outcomeKind: "terminal_assistant_response" };
  }

  return { outcomeKind: "provider_stream_ended" };
}
