import { expect, test } from "bun:test";
import {
  PROVIDER_PROTOCOL_VERSION,
  type ProviderProtocolHostFrame,
  type ProviderProtocolProviderFrame,
  type ProviderProtocolRequestId,
  type ProviderProtocolTurnId,
  type ProviderStreamEvent,
} from "@buli/contracts";
import {
  ProviderProtocolConversationTurnProvider,
  ProviderProtocolRemoteProviderError,
  type ProviderProtocolClientTransport,
} from "../src/index.ts";

const completedUsage = {
  input: 10,
  output: 4,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

class RecordingProviderProtocolClientTransport implements ProviderProtocolClientTransport {
  readonly sentHostFrames: ProviderProtocolHostFrame[] = [];
  private readonly providerFrameQueue = new ProviderProtocolTestAsyncQueue<ProviderProtocolProviderFrame>();

  receiveProviderFrames(): AsyncIterable<ProviderProtocolProviderFrame> {
    return this.providerFrameQueue;
  }

  async sendHostFrame(frame: ProviderProtocolHostFrame): Promise<void> {
    this.sentHostFrames.push(frame);
  }

  sendProviderFrame(frame: ProviderProtocolProviderFrame): void {
    this.providerFrameQueue.enqueue(frame);
  }
}

class ProviderProtocolTestAsyncQueue<QueuedValue> implements AsyncIterable<QueuedValue> {
  private readonly queuedValues: QueuedValue[] = [];
  private pendingNext: ((result: IteratorResult<QueuedValue>) => void) | undefined;

  enqueue(value: QueuedValue): void {
    if (this.pendingNext) {
      const resolvePendingNext = this.pendingNext;
      this.pendingNext = undefined;
      resolvePendingNext({ done: false, value });
      return;
    }

    this.queuedValues.push(value);
  }

  [Symbol.asyncIterator](): AsyncIterator<QueuedValue> {
    return { next: () => this.next() };
  }

  private next(): Promise<IteratorResult<QueuedValue>> {
    const queuedValue = this.queuedValues.shift();
    if (queuedValue !== undefined) {
      return Promise.resolve({ done: false, value: queuedValue });
    }

    return new Promise<IteratorResult<QueuedValue>>((resolveNext) => {
      this.pendingNext = resolveNext;
    });
  }
}

async function collectProviderEvents(providerEvents: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const collectedProviderEvents: ProviderStreamEvent[] = [];
  for await (const providerEvent of providerEvents) {
    collectedProviderEvents.push(providerEvent);
  }

  return collectedProviderEvents;
}

function createSequentialRequestIdFactory(requestIds: readonly ProviderProtocolRequestId[]): () => ProviderProtocolRequestId {
  let nextRequestIdIndex = 0;
  return () => {
    const requestId = requestIds[nextRequestIdIndex];
    if (!requestId) {
      throw new Error("No provider protocol request id remained for test.");
    }

    nextRequestIdIndex += 1;
    return requestId;
  };
}

async function waitForSentHostFrameCount(input: {
  transport: RecordingProviderProtocolClientTransport;
  expectedFrameCount: number;
}): Promise<void> {
  for (let attemptIndex = 0; attemptIndex < 100; attemptIndex += 1) {
    if (input.transport.sentHostFrames.length >= input.expectedFrameCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error(`Timed out waiting for ${input.expectedFrameCount} host frames.`);
}

function createProviderProtocolAcknowledgementFrame(input: {
  requestId: ProviderProtocolRequestId;
  turnId: ProviderProtocolTurnId;
  acknowledgedFrameKind: ProviderProtocolHostFrame["frameKind"];
}): ProviderProtocolProviderFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: input.requestId,
    turnId: input.turnId,
    acknowledgedFrameKind: input.acknowledgedFrameKind,
  };
}

test("ProviderProtocolConversationTurnProvider sends start frames and streams ordered provider events", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1"]),
    createTurnId: () => "turn-1",
  });

  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [{ entryKind: "user_prompt", promptText: "Say hi", modelFacingPromptText: "Say hi" }],
    selectedModelId: "gpt-5.5",
    selectedReasoningEffort: "medium",
    availableToolNames: ["read"],
  });

  expect(transport.sentHostFrames[0]).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_start_turn",
    requestId: "req-start-1",
    turnId: "turn-1",
    turnRequest: {
      systemPromptText: "You are Buli.",
      conversationSessionEntries: [{ entryKind: "user_prompt", promptText: "Say hi", modelFacingPromptText: "Say hi" }],
      selectedModelId: "gpt-5.5",
      selectedReasoningEffort: "medium",
      availableToolNames: ["read"],
    },
  });

  const collectedProviderEventsPromise = collectProviderEvents(providerTurn.streamProviderEvents());
  transport.sendProviderFrame(createProviderProtocolAcknowledgementFrame({
    requestId: "req-start-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_start_turn",
  }));
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: "turn-1",
    sequenceNumber: 1,
    providerStreamEvent: { type: "text_chunk", text: "Hello" },
  });
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: "turn-1",
    sequenceNumber: 2,
    providerStreamEvent: { type: "completed", usage: completedUsage },
  });
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_turn_closed",
    turnId: "turn-1",
    closedReason: "completed",
    finalSequenceNumber: 2,
    providerTurnReplay: { provider: "openai", inputItems: [] },
  });

  expect(await collectedProviderEventsPromise).toEqual([
    { type: "text_chunk", text: "Hello" },
    { type: "completed", usage: completedUsage },
  ]);
  expect(providerTurn.getProviderTurnReplay()).toEqual({ provider: "openai", inputItems: [] });
});

test("ProviderProtocolConversationTurnProvider requests available models over the provider protocol", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-models-1"]),
  });

  const availableModelsPromise = provider.listAvailableAssistantModels();
  await waitForSentHostFrameCount({ transport, expectedFrameCount: 1 });

  expect(transport.sentHostFrames[0]).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_list_models",
    requestId: "req-models-1",
  });

  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: "req-models-1",
    acknowledgedFrameKind: "host_list_models",
  });
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_available_models",
    requestId: "req-models-1",
    availableModels: [
      {
        id: "fixture-model",
        displayName: "Fixture model",
        supportedReasoningEfforts: ["medium"],
      },
    ],
  });

  expect(await availableModelsPromise).toEqual([
    {
      id: "fixture-model",
      displayName: "Fixture model",
      supportedReasoningEfforts: ["medium"],
    },
  ]);
});

test("ProviderProtocolConversationTurnProvider submits tool results after provider acknowledgements", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1", "req-tool-result-1"]),
    createTurnId: () => "turn-1",
  });
  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
  });
  transport.sendProviderFrame(createProviderProtocolAcknowledgementFrame({
    requestId: "req-start-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_start_turn",
  }));

  const submissionPromise = providerTurn.submitToolResult({
    toolCallId: "call-read-1",
    toolResultText: "README contents",
  });
  await waitForSentHostFrameCount({ transport, expectedFrameCount: 2 });

  expect(transport.sentHostFrames[1]).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_submit_tool_result",
    requestId: "req-tool-result-1",
    turnId: "turn-1",
    toolCallId: "call-read-1",
    toolResultText: "README contents",
  });

  transport.sendProviderFrame(createProviderProtocolAcknowledgementFrame({
    requestId: "req-tool-result-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_submit_tool_result",
  }));
  await submissionPromise;
});

test("ProviderProtocolConversationTurnProvider sends cancel frames when the abort signal fires", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const abortController = new AbortController();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1", "req-cancel-1"]),
    createTurnId: () => "turn-1",
  });

  provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
    abortSignal: abortController.signal,
  });
  abortController.abort();
  await waitForSentHostFrameCount({ transport, expectedFrameCount: 2 });

  expect(transport.sentHostFrames[1]).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_cancel_turn",
    requestId: "req-cancel-1",
    turnId: "turn-1",
    cancellationReason: "user_interrupted",
  });
});

test("ProviderProtocolConversationTurnProvider throws structured provider errors from streams", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1"]),
    createTurnId: () => "turn-1",
  });
  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
  });
  const collectedProviderEventsPromise = collectProviderEvents(providerTurn.streamProviderEvents());
  transport.sendProviderFrame(createProviderProtocolAcknowledgementFrame({
    requestId: "req-start-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_start_turn",
  }));
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_error",
    turnId: "turn-1",
    error: {
      errorCode: "provider_turn_stream_failed",
      errorMessage: "OpenAI stream failed",
      providerName: "openai",
    },
  });

  let thrownError: unknown;
  try {
    await collectedProviderEventsPromise;
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(ProviderProtocolRemoteProviderError);
  expect(thrownError).toMatchObject({
    providerProtocolError: {
      errorCode: "provider_turn_stream_failed",
      errorMessage: "OpenAI stream failed",
      providerName: "openai",
    },
  });
});

test("ProviderProtocolConversationTurnProvider rejects acknowledgements for a different turn", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1"]),
    createTurnId: () => "turn-1",
  });
  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
  });

  const collectedProviderEventsPromise = collectProviderEvents(providerTurn.streamProviderEvents());
  transport.sendProviderFrame(createProviderProtocolAcknowledgementFrame({
    requestId: "req-start-1",
    turnId: "other-turn",
    acknowledgedFrameKind: "host_start_turn",
  }));

  await expect(collectedProviderEventsPromise).rejects.toThrow(
    "Provider protocol acknowledged turn other-turn for turn-1 request req-start-1.",
  );
});

test("ProviderProtocolConversationTurnProvider rejects missing request acknowledgements", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1"]),
    createTurnId: () => "turn-1",
    requestAcknowledgementTimeoutMilliseconds: 1,
  });
  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
  });

  await expect(collectProviderEvents(providerTurn.streamProviderEvents())).rejects.toThrow(
    "Provider protocol host did not acknowledge host_start_turn request req-start-1 within 1ms.",
  );
  expect(transport.sentHostFrames).toHaveLength(1);
});

test("ProviderProtocolConversationTurnProvider rejects mismatched terminal sequence numbers", async () => {
  const transport = new RecordingProviderProtocolClientTransport();
  const provider = new ProviderProtocolConversationTurnProvider({
    transport,
    createRequestId: createSequentialRequestIdFactory(["req-start-1"]),
    createTurnId: () => "turn-1",
  });
  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are Buli.",
    conversationSessionEntries: [],
    selectedModelId: "gpt-5.5",
  });
  const collectedProviderEventsPromise = collectProviderEvents(providerTurn.streamProviderEvents());
  transport.sendProviderFrame(createProviderProtocolAcknowledgementFrame({
    requestId: "req-start-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_start_turn",
  }));
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_event",
    turnId: "turn-1",
    sequenceNumber: 1,
    providerStreamEvent: { type: "text_chunk", text: "Hello" },
  });
  transport.sendProviderFrame({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_turn_closed",
    turnId: "turn-1",
    closedReason: "completed",
    finalSequenceNumber: 2,
  });

  await expect(collectedProviderEventsPromise).rejects.toThrow(
    "Provider protocol turn turn-1 closed at sequence 2, expected 1.",
  );
});
