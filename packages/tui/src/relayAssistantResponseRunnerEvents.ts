import { randomUUID } from "node:crypto";
import {
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
} from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";
import {
  summarizeAssistantResponseEventForDiagnostics,
  summarizeAssistantResponseEventsForDiagnostics,
} from "./assistantResponseEventDiagnostics.ts";
import { logTuiDiagnosticEvent } from "./diagnostics/logTuiDiagnosticEvent.ts";

const ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS = 16;

function isTerminalAssistantResponseEvent(assistantResponseEvent: AssistantResponseEvent): boolean {
  return (
    assistantResponseEvent.type === "assistant_message_completed" ||
    assistantResponseEvent.type === "assistant_message_incomplete" ||
    assistantResponseEvent.type === "assistant_message_failed" ||
    assistantResponseEvent.type === "assistant_message_interrupted"
  );
}

function resolveAssistantResponseEventMessageId(assistantResponseEvent: AssistantResponseEvent): string | undefined {
  if (assistantResponseEvent.type === "assistant_pending_tool_approval_requested") {
    return undefined;
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_cleared") {
    return undefined;
  }

  return assistantResponseEvent.messageId;
}

export async function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvents: (assistantResponseEvents: readonly AssistantResponseEvent[]) => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<void> {
  logTuiDiagnosticEvent(input.diagnosticLogger, "relay.turn_start_requested", {
    selectedModelId: input.conversationTurnRequest.selectedModelId,
    selectedReasoningEffort: input.conversationTurnRequest.selectedReasoningEffort ?? null,
    userPromptLength: input.conversationTurnRequest.userPromptText.length,
  });
  let queuedAssistantResponseEvents: AssistantResponseEvent[] = [];
  let scheduledFlushTimeout: ReturnType<typeof setTimeout> | undefined;
  let lastFlushAtMs = 0;
  let currentAssistantResponseMessageId: string | undefined;
  let hasSeenTerminalAssistantResponseEvent = false;
  let activeConversationTurn: ActiveConversationTurn | undefined;
  let assistantResponseEventDeliveryError: unknown;

  function recordAssistantResponseEventDeliveryError(error: unknown): void {
    assistantResponseEventDeliveryError ??= error;
  }

  function flushQueuedAssistantResponseEvents(): void {
    if (queuedAssistantResponseEvents.length === 0) {
      scheduledFlushTimeout = undefined;
      return;
    }

    const assistantResponseEventsToFlush = queuedAssistantResponseEvents;
    queuedAssistantResponseEvents = [];
    scheduledFlushTimeout = undefined;
    const flushedAtMs = Date.now();
    logTuiDiagnosticEvent(input.diagnosticLogger, "relay.event_batch_flushed", {
      ...summarizeAssistantResponseEventsForDiagnostics(assistantResponseEventsToFlush),
      elapsedSinceLastFlushMs: lastFlushAtMs === 0 ? null : flushedAtMs - lastFlushAtMs,
    });
    lastFlushAtMs = flushedAtMs;
    try {
      input.onAssistantResponseEvents(assistantResponseEventsToFlush);
    } catch (error) {
      recordAssistantResponseEventDeliveryError(error);
      throw error;
    }
  }

  function scheduleAssistantResponseEventFlush(): void {
    const elapsedSinceLastFlushAtMs = Date.now() - lastFlushAtMs;
    if (elapsedSinceLastFlushAtMs >= ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS) {
      flushQueuedAssistantResponseEvents();
      return;
    }

    if (scheduledFlushTimeout) {
      return;
    }

    scheduledFlushTimeout = setTimeout(() => {
      try {
        flushQueuedAssistantResponseEvents();
      } catch (error) {
        recordAssistantResponseEventDeliveryError(error);
        activeConversationTurn?.interrupt();
      }
    }, ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS);
  }

  function queueAssistantResponseEvent(assistantResponseEvent: AssistantResponseEvent): void {
    const assistantResponseEventMessageId = resolveAssistantResponseEventMessageId(assistantResponseEvent);
    if (assistantResponseEvent.type === "assistant_turn_started") {
      currentAssistantResponseMessageId = assistantResponseEvent.messageId;
    } else if (!currentAssistantResponseMessageId && assistantResponseEventMessageId) {
      currentAssistantResponseMessageId = assistantResponseEventMessageId;
    }
    if (isTerminalAssistantResponseEvent(assistantResponseEvent)) {
      hasSeenTerminalAssistantResponseEvent = true;
    }

    queuedAssistantResponseEvents.push(assistantResponseEvent);
    logTuiDiagnosticEvent(input.diagnosticLogger, "relay.event_queued", {
      eventType: assistantResponseEvent.type,
      queueLength: queuedAssistantResponseEvents.length,
      ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
    });
    scheduleAssistantResponseEventFlush();
  }

  function queueSyntheticFailedAssistantTurn(errorText: string): void {
    if (hasSeenTerminalAssistantResponseEvent) {
      return;
    }

    const failedAssistantMessageId = currentAssistantResponseMessageId ?? `relay-failed-${randomUUID()}`;
    if (!currentAssistantResponseMessageId) {
      queueAssistantResponseEvent({
        type: "assistant_turn_started",
        messageId: failedAssistantMessageId,
        startedAtMs: Date.now(),
      });
    }
    queueAssistantResponseEvent({
      type: "assistant_message_failed",
      messageId: failedAssistantMessageId,
      errorText,
    });
  }

  try {
    activeConversationTurn = input.assistantConversationRunner.startConversationTurn(input.conversationTurnRequest);
    input.onConversationTurnStarted(activeConversationTurn);
    logTuiDiagnosticEvent(input.diagnosticLogger, "relay.turn_started", {
      selectedModelId: input.conversationTurnRequest.selectedModelId,
    });

    for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
      queueAssistantResponseEvent(assistantResponseEvent);
    }

    if (!hasSeenTerminalAssistantResponseEvent && assistantResponseEventDeliveryError === undefined) {
      logTuiDiagnosticEvent(input.diagnosticLogger, "relay.non_terminal_stream_finished", {
        selectedModelId: input.conversationTurnRequest.selectedModelId,
        hasAssistantMessageId: currentAssistantResponseMessageId !== undefined,
      });
      queueSyntheticFailedAssistantTurn("Assistant turn ended without a terminal event.");
    }
  } catch (error) {
    if (assistantResponseEventDeliveryError !== undefined) {
      logTuiDiagnosticEvent(input.diagnosticLogger, "relay.event_delivery_error", {
        errorText: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const errorText = error instanceof Error ? error.message : String(error);
    logTuiDiagnosticEvent(input.diagnosticLogger, "relay.runner_error", {
      errorText,
    });
    queueSyntheticFailedAssistantTurn(errorText);
  } finally {
    if (scheduledFlushTimeout) {
      clearTimeout(scheduledFlushTimeout);
    }
    if (assistantResponseEventDeliveryError === undefined) {
      try {
        flushQueuedAssistantResponseEvents();
      } catch (error) {
        recordAssistantResponseEventDeliveryError(error);
      }
    } else {
      queuedAssistantResponseEvents = [];
    }
    try {
      input.onConversationTurnFinished();
      logTuiDiagnosticEvent(input.diagnosticLogger, "relay.turn_finished", {
        selectedModelId: input.conversationTurnRequest.selectedModelId,
      });
    } finally {
      activeConversationTurn = undefined;
    }
    if (assistantResponseEventDeliveryError !== undefined) {
      throw assistantResponseEventDeliveryError;
    }
  }
}
