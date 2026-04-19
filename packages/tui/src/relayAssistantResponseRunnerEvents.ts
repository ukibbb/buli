import type { AssistantResponseEvent } from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";

const ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS = 16;

export async function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvents: (assistantResponseEvents: readonly AssistantResponseEvent[]) => void;
}): Promise<void> {
  const activeConversationTurn = input.assistantConversationRunner.startConversationTurn(input.conversationTurnRequest);
  input.onConversationTurnStarted(activeConversationTurn);

  let queuedAssistantResponseEvents: AssistantResponseEvent[] = [];
  let scheduledFlushTimeout: ReturnType<typeof setTimeout> | undefined;
  let lastFlushAtMs = 0;

  function flushQueuedAssistantResponseEvents(): void {
    if (queuedAssistantResponseEvents.length === 0) {
      scheduledFlushTimeout = undefined;
      return;
    }

    const assistantResponseEventsToFlush = queuedAssistantResponseEvents;
    queuedAssistantResponseEvents = [];
    scheduledFlushTimeout = undefined;
    lastFlushAtMs = Date.now();
    input.onAssistantResponseEvents(assistantResponseEventsToFlush);
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

    scheduledFlushTimeout = setTimeout(flushQueuedAssistantResponseEvents, ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS);
  }

  function queueAssistantResponseEvent(assistantResponseEvent: AssistantResponseEvent): void {
    queuedAssistantResponseEvents.push(assistantResponseEvent);
    scheduleAssistantResponseEventFlush();
  }

  try {
    for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
      queueAssistantResponseEvent(assistantResponseEvent);
    }
  } catch (error) {
    const failedAssistantMessageId = "relay-failed";
    queueAssistantResponseEvent({
      type: "assistant_turn_started",
      messageId: failedAssistantMessageId,
      startedAtMs: Date.now(),
    });
    queueAssistantResponseEvent({
      type: "assistant_message_failed",
      messageId: failedAssistantMessageId,
      errorText: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (scheduledFlushTimeout) {
      clearTimeout(scheduledFlushTimeout);
    }
    flushQueuedAssistantResponseEvents();
    input.onConversationTurnFinished();
  }
}
