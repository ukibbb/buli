import type {
  AssistantSegmentConversationSessionEntry,
  AssistantResponseEvent,
  BuliDiagnosticLogger,
  ProviderRequestedToolCall,
  ProviderStreamEvent,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import {
  streamAssistantResponseEventsForRequestedToolCalls,
  type RuntimeToolCallExecutionContext,
} from "./runtimeToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import {
  RuntimeProviderStreamEventTranslator,
  type RuntimeProviderStreamEventTranslation,
  type RuntimeProviderStreamToolCallRequestedTranslation,
  type RuntimeProviderStreamToolCallsRequestedTranslation,
} from "./runtimeProviderStreamEventTranslator.ts";
import {
  logEngineDiagnosticEvent,
  summarizeProviderStreamEventForDiagnostics,
} from "./runtimeDiagnostics.ts";

export type RuntimeProviderStreamProcessingOutcome =
  | { outcomeKind: "terminal_assistant_response" }
  | { outcomeKind: "provider_stream_ended" };

type RuntimeProviderStreamProcessorInput = {
  providerConversationTurn: ProviderConversationTurn;
  providerStreamEventTranslator: RuntimeProviderStreamEventTranslator;
  conversationTurnSessionRecorder: RuntimeConversationTurnSessionRecorder;
  createRequestedToolCallsExecutionContext: () => RuntimeToolCallExecutionContext;
  throwIfConversationTurnInterrupted: () => void;
  logAssistantResponseEventEmitted: (assistantResponseEvent: AssistantResponseEvent) => AssistantResponseEvent;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

type RuntimeProviderStreamToolCallTranslation =
  | RuntimeProviderStreamToolCallRequestedTranslation
  | RuntimeProviderStreamToolCallsRequestedTranslation;

type PendingProviderRequestedToolCallBatch = {
  requestedToolCalls: ProviderRequestedToolCall[];
  assistantResponseEventsBeforeToolCall: AssistantResponseEvent[];
  assistantSegmentSessionEntriesBeforeToolCall: AssistantSegmentConversationSessionEntry[];
};

type ProviderStreamEventReadState = {
  providerStreamEventIterator: AsyncIterator<ProviderStreamEvent>;
  pendingProviderStreamEventReadPromise?: Promise<IteratorResult<ProviderStreamEvent>> | undefined;
};

type RuntimeTranslatedProviderStreamEvent = {
  providerStreamEventTranslation: RuntimeProviderStreamEventTranslation;
};

const ADJACENT_TOOL_CALL_BUFFER_WINDOW_MILLISECONDS = 0;
const TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED = Symbol("tool_call_batch_buffer_window_elapsed");

export async function* streamAssistantResponseEventsFromProviderStream(
  input: RuntimeProviderStreamProcessorInput,
): AsyncGenerator<AssistantResponseEvent, RuntimeProviderStreamProcessingOutcome> {
  const providerStreamEventReadState: ProviderStreamEventReadState = {
    providerStreamEventIterator: input.providerConversationTurn.streamProviderEvents()[Symbol.asyncIterator](),
  };
  let didReachProviderStreamEnd = false;

  try {
    while (true) {
      const translatedProviderStreamEvent = await readNextTranslatedProviderStreamEvent({
        input,
        providerStreamEventReadState,
      });
      if (!translatedProviderStreamEvent) {
        didReachProviderStreamEnd = true;
        return { outcomeKind: "provider_stream_ended" };
      }

      let providerStreamEventTranslation = translatedProviderStreamEvent.providerStreamEventTranslation;
      while (true) {
        if (isRuntimeProviderStreamToolCallTranslation(providerStreamEventTranslation)) {
          const pendingToolCallBatch = createPendingToolCallBatch(providerStreamEventTranslation);
          while (true) {
            const adjacentTranslatedProviderStreamEvent = await readNextTranslatedProviderStreamEventWithinToolCallBatchWindow({
              input,
              providerStreamEventReadState,
            });
            if (adjacentTranslatedProviderStreamEvent === TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED) {
              break;
            }
            if (!adjacentTranslatedProviderStreamEvent) {
              yield* streamAssistantResponseEventsForPendingToolCallBatch({ input, pendingToolCallBatch });
              didReachProviderStreamEnd = true;
              return { outcomeKind: "provider_stream_ended" };
            }
            if (!isRuntimeProviderStreamToolCallTranslation(adjacentTranslatedProviderStreamEvent.providerStreamEventTranslation)) {
              yield* streamAssistantResponseEventsForPendingToolCallBatch({ input, pendingToolCallBatch });
              providerStreamEventTranslation = adjacentTranslatedProviderStreamEvent.providerStreamEventTranslation;
              break;
            }

            appendToolCallTranslationToPendingToolCallBatch({
              pendingToolCallBatch,
              providerStreamEventTranslation: adjacentTranslatedProviderStreamEvent.providerStreamEventTranslation,
            });
          }

          if (isRuntimeProviderStreamToolCallTranslation(providerStreamEventTranslation)) {
            yield* streamAssistantResponseEventsForPendingToolCallBatch({ input, pendingToolCallBatch });
            break;
          }
          continue;
        }

        if (providerStreamEventTranslation.translationKind === "assistant_response_events") {
          for (const assistantResponseEvent of providerStreamEventTranslation.assistantResponseEvents) {
            yield input.logAssistantResponseEventEmitted(assistantResponseEvent);
          }
          for (const assistantSegmentSessionEntry of providerStreamEventTranslation.assistantSegmentSessionEntries ?? []) {
            input.conversationTurnSessionRecorder.appendAssistantSegmentSessionEntry(assistantSegmentSessionEntry);
          }
          break;
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
    }
  } finally {
    if (!didReachProviderStreamEnd) {
      closeProviderStreamEventIterator(providerStreamEventReadState);
    }
  }
}

function closeProviderStreamEventIterator(providerStreamEventReadState: ProviderStreamEventReadState): void {
  providerStreamEventReadState.pendingProviderStreamEventReadPromise = undefined;
  providerStreamEventReadState.providerStreamEventIterator.return?.().catch(() => {});
}

async function readNextTranslatedProviderStreamEvent(input: {
  input: RuntimeProviderStreamProcessorInput;
  providerStreamEventReadState: ProviderStreamEventReadState;
}): Promise<RuntimeTranslatedProviderStreamEvent | undefined> {
  const providerStreamIteratorResult = await consumeNextProviderStreamIteratorResult(input.providerStreamEventReadState);
  return translateProviderStreamIteratorResult({
    input: input.input,
    providerStreamIteratorResult,
  });
}

async function readNextTranslatedProviderStreamEventWithinToolCallBatchWindow(input: {
  input: RuntimeProviderStreamProcessorInput;
  providerStreamEventReadState: ProviderStreamEventReadState;
}): Promise<RuntimeTranslatedProviderStreamEvent | undefined | typeof TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED> {
  const pendingProviderStreamEventReadPromise = startNextProviderStreamIteratorResultRead(input.providerStreamEventReadState);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const toolCallBatchBufferWindowElapsedPromise = new Promise<typeof TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED), ADJACENT_TOOL_CALL_BUFFER_WINDOW_MILLISECONDS);
  });

  const providerStreamIteratorResult = await Promise.race([
    pendingProviderStreamEventReadPromise,
    toolCallBatchBufferWindowElapsedPromise,
  ]);
  if (timeoutHandle !== undefined) {
    clearTimeout(timeoutHandle);
  }
  if (providerStreamIteratorResult === TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED) {
    return TOOL_CALL_BATCH_BUFFER_WINDOW_ELAPSED;
  }

  input.providerStreamEventReadState.pendingProviderStreamEventReadPromise = undefined;
  return translateProviderStreamIteratorResult({
    input: input.input,
    providerStreamIteratorResult,
  });
}

function startNextProviderStreamIteratorResultRead(
  providerStreamEventReadState: ProviderStreamEventReadState,
): Promise<IteratorResult<ProviderStreamEvent>> {
  if (!providerStreamEventReadState.pendingProviderStreamEventReadPromise) {
    const pendingProviderStreamEventReadPromise = providerStreamEventReadState.providerStreamEventIterator.next();
    pendingProviderStreamEventReadPromise.catch(() => {});
    providerStreamEventReadState.pendingProviderStreamEventReadPromise = pendingProviderStreamEventReadPromise;
  }

  return providerStreamEventReadState.pendingProviderStreamEventReadPromise;
}

async function consumeNextProviderStreamIteratorResult(
  providerStreamEventReadState: ProviderStreamEventReadState,
): Promise<IteratorResult<ProviderStreamEvent>> {
  const providerStreamIteratorResult = await startNextProviderStreamIteratorResultRead(providerStreamEventReadState);
  providerStreamEventReadState.pendingProviderStreamEventReadPromise = undefined;
  return providerStreamIteratorResult;
}

function translateProviderStreamIteratorResult(input: {
  input: RuntimeProviderStreamProcessorInput;
  providerStreamIteratorResult: IteratorResult<ProviderStreamEvent>;
}): RuntimeTranslatedProviderStreamEvent | undefined {
  if (input.providerStreamIteratorResult.done) {
    return undefined;
  }

  const providerStreamEvent = input.providerStreamIteratorResult.value;
  input.input.throwIfConversationTurnInterrupted();
  logEngineDiagnosticEvent(input.input.diagnosticLogger, "provider_stream.event_received", {
    eventType: providerStreamEvent.type,
    ...summarizeProviderStreamEventForDiagnostics(providerStreamEvent),
  });

  return {
    providerStreamEventTranslation: input.input.providerStreamEventTranslator.translateProviderStreamEvent({
      providerStreamEvent,
      providerTurnReplay: providerStreamEvent.type === "completed" || providerStreamEvent.type === "incomplete"
        ? input.input.providerConversationTurn.getProviderTurnReplay()
        : undefined,
    }),
  };
}

function isRuntimeProviderStreamToolCallTranslation(
  providerStreamEventTranslation: RuntimeProviderStreamEventTranslation,
): providerStreamEventTranslation is RuntimeProviderStreamToolCallTranslation {
  return (
    providerStreamEventTranslation.translationKind === "tool_call_requested" ||
    providerStreamEventTranslation.translationKind === "tool_calls_requested"
  );
}

function createPendingToolCallBatch(
  providerStreamEventTranslation: RuntimeProviderStreamToolCallTranslation,
): PendingProviderRequestedToolCallBatch {
  return {
    requestedToolCalls: listRequestedToolCallsFromProviderStreamToolCallTranslation(providerStreamEventTranslation),
    assistantResponseEventsBeforeToolCall: [...(providerStreamEventTranslation.assistantResponseEventsBeforeToolCall ?? [])],
    assistantSegmentSessionEntriesBeforeToolCall: [...(providerStreamEventTranslation.assistantSegmentSessionEntriesBeforeToolCall ?? [])],
  };
}

function appendToolCallTranslationToPendingToolCallBatch(input: {
  pendingToolCallBatch: PendingProviderRequestedToolCallBatch;
  providerStreamEventTranslation: RuntimeProviderStreamToolCallTranslation;
}): void {
  input.pendingToolCallBatch.requestedToolCalls.push(
    ...listRequestedToolCallsFromProviderStreamToolCallTranslation(input.providerStreamEventTranslation),
  );
  input.pendingToolCallBatch.assistantResponseEventsBeforeToolCall.push(
    ...(input.providerStreamEventTranslation.assistantResponseEventsBeforeToolCall ?? []),
  );
  input.pendingToolCallBatch.assistantSegmentSessionEntriesBeforeToolCall.push(
    ...(input.providerStreamEventTranslation.assistantSegmentSessionEntriesBeforeToolCall ?? []),
  );
}

function listRequestedToolCallsFromProviderStreamToolCallTranslation(
  providerStreamEventTranslation: RuntimeProviderStreamToolCallTranslation,
): ProviderRequestedToolCall[] {
  if (providerStreamEventTranslation.translationKind === "tool_calls_requested") {
    return [...providerStreamEventTranslation.providerToolCallsRequestedEvent.requestedToolCalls];
  }

  return [{
    toolCallId: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallId,
    toolCallRequest: providerStreamEventTranslation.providerToolCallRequestedEvent.toolCallRequest,
  }];
}

async function* streamAssistantResponseEventsForPendingToolCallBatch(input: {
  input: RuntimeProviderStreamProcessorInput;
  pendingToolCallBatch: PendingProviderRequestedToolCallBatch;
}): AsyncGenerator<AssistantResponseEvent> {
  for (const assistantResponseEvent of input.pendingToolCallBatch.assistantResponseEventsBeforeToolCall) {
    yield input.input.logAssistantResponseEventEmitted(assistantResponseEvent);
  }
  for (const assistantSegmentSessionEntry of input.pendingToolCallBatch.assistantSegmentSessionEntriesBeforeToolCall) {
    input.input.conversationTurnSessionRecorder.appendAssistantSegmentSessionEntry(assistantSegmentSessionEntry);
  }
  yield* streamAssistantResponseEventsForRequestedToolCalls({
    ...input.input.createRequestedToolCallsExecutionContext(),
    requestedToolCalls: input.pendingToolCallBatch.requestedToolCalls,
  });
}
