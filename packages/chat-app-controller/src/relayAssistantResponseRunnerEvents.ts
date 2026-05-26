import { randomUUID } from "node:crypto";
import type { AssistantResponseEvent, BuliDiagnosticLogger } from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";
import { logChatAppControllerDiagnosticEvent } from "./logChatAppControllerDiagnosticEvent.ts";

const STREAMING_ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS = 48;

type TerminalAssistantResponseEvent = Extract<AssistantResponseEvent, {
  type: "assistant_message_completed" | "assistant_message_incomplete" | "assistant_message_failed" | "assistant_message_interrupted";
}>;

export type AssistantResponseRelayResult = {
  terminalAssistantResponseEvent: TerminalAssistantResponseEvent | undefined;
};

function isTerminalAssistantResponseEvent(assistantResponseEvent: AssistantResponseEvent): boolean {
  return (
    assistantResponseEvent.type === "assistant_message_completed" ||
    assistantResponseEvent.type === "assistant_message_incomplete" ||
    assistantResponseEvent.type === "assistant_message_failed" ||
    assistantResponseEvent.type === "assistant_message_interrupted"
  );
}

function isBatchableStreamingAssistantResponseEvent(assistantResponseEvent: AssistantResponseEvent): boolean {
  return (
    assistantResponseEvent.type === "assistant_message_part_updated" &&
    (
      (assistantResponseEvent.part.partKind === "assistant_text" && assistantResponseEvent.part.partStatus === "streaming") ||
      (assistantResponseEvent.part.partKind === "assistant_reasoning" && assistantResponseEvent.part.partStatus === "streaming")
    )
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
}): Promise<AssistantResponseRelayResult> {
  const conversationTurnId = input.conversationTurnRequest.conversationTurnId ?? randomUUID();
  const conversationTurnRequest: ConversationTurnRequest = {
    ...input.conversationTurnRequest,
    conversationTurnId,
  };
  let queuedAssistantResponseEvents: AssistantResponseEvent[] = [];
  let scheduledFlushTimeout: ReturnType<typeof setTimeout> | undefined;
  let lastFlushAtMs = 0;
  let currentAssistantResponseMessageId: string | undefined;
  let hasSeenTerminalAssistantResponseEvent = false;
  let terminalAssistantResponseEvent: TerminalAssistantResponseEvent | undefined;
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
    lastFlushAtMs = flushedAtMs;
    const assistantResponseEventDeliveryStartedAtMs = Date.now();
    try {
      input.onAssistantResponseEvents(assistantResponseEventsToFlush);
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "assistant_response_event_batch.flushed", {
        conversationTurnId,
        assistantResponseEventCount: assistantResponseEventsToFlush.length,
        durationMs: Date.now() - assistantResponseEventDeliveryStartedAtMs,
      });
    } catch (error) {
      recordAssistantResponseEventDeliveryError(error);
      throw error;
    }
  }

  function scheduleAssistantResponseEventFlush(batchWindowMilliseconds: number): void {
    const elapsedSinceLastFlushAtMs = Date.now() - lastFlushAtMs;
    if (elapsedSinceLastFlushAtMs >= batchWindowMilliseconds) {
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
    }, batchWindowMilliseconds - elapsedSinceLastFlushAtMs);
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
      terminalAssistantResponseEvent = assistantResponseEvent as TerminalAssistantResponseEvent;
    }

    queuedAssistantResponseEvents.push(assistantResponseEvent);
    if (!isBatchableStreamingAssistantResponseEvent(assistantResponseEvent)) {
      flushQueuedAssistantResponseEvents();
      return;
    }

    scheduleAssistantResponseEventFlush(STREAMING_ASSISTANT_RESPONSE_EVENT_BATCH_WINDOW_MS);
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
    logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "conversation_turn.relay_started", {
      conversationTurnId,
      selectedModelId: conversationTurnRequest.selectedModelId,
      selectedReasoningEffort: conversationTurnRequest.selectedReasoningEffort ?? null,
      userPromptLength: conversationTurnRequest.userPromptText.length,
      userPromptImageAttachmentCount: conversationTurnRequest.userPromptImageAttachments?.length ?? 0,
    });
    activeConversationTurn = input.assistantConversationRunner.startConversationTurn(conversationTurnRequest);
    input.onConversationTurnStarted(activeConversationTurn);

    for await (const assistantResponseEvent of activeConversationTurn.streamAssistantResponseEvents()) {
      queueAssistantResponseEvent(assistantResponseEvent);
    }

    if (!hasSeenTerminalAssistantResponseEvent && assistantResponseEventDeliveryError === undefined) {
      queueSyntheticFailedAssistantTurn("Assistant turn ended without a terminal event.");
    }
  } catch (error) {
    if (assistantResponseEventDeliveryError !== undefined) {
      throw assistantResponseEventDeliveryError;
    }
    const errorText = error instanceof Error ? error.message : String(error);
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
    } finally {
      activeConversationTurn = undefined;
    }
    if (assistantResponseEventDeliveryError !== undefined) {
      throw assistantResponseEventDeliveryError;
    }
  }

  return { terminalAssistantResponseEvent };
}
