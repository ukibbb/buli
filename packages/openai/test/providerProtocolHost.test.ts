import { expect, test } from "bun:test";
import {
  PROVIDER_PROTOCOL_VERSION,
  type ProviderProtocolHostFrame,
  type ProviderProtocolProviderFrame,
  type ProviderStreamEvent,
  type ProviderTurnReplay,
} from "@buli/contracts";
import {
  runOpenAiProviderProtocolHost,
  type OpenAiProviderProtocolHostConversationTurn,
  type OpenAiProviderProtocolHostConversationTurnProvider,
  type OpenAiProviderProtocolHostTurnRequest,
} from "../src/index.ts";

const completedUsage = {
  input: 10,
  output: 4,
  reasoning: 0,
  cache: { read: 0, write: 0 },
};

class ScriptedOpenAiProtocolProvider implements OpenAiProviderProtocolHostConversationTurnProvider {
  readonly startedTurnRequests: OpenAiProviderProtocolHostTurnRequest[] = [];
  private readonly queuedProviderTurns: OpenAiProviderProtocolHostConversationTurn[];

  constructor(providerTurns: readonly OpenAiProviderProtocolHostConversationTurn[]) {
    this.queuedProviderTurns = [...providerTurns];
  }

  startConversationTurn(input: OpenAiProviderProtocolHostTurnRequest): OpenAiProviderProtocolHostConversationTurn {
    this.startedTurnRequests.push(input);
    const providerTurn = this.queuedProviderTurns.shift();
    if (!providerTurn) {
      throw new Error("No scripted provider turn remained.");
    }

    return providerTurn;
  }
}

class ScriptedOpenAiProtocolTurn implements OpenAiProviderProtocolHostConversationTurn {
  readonly beforeToolResultEvents: readonly ProviderStreamEvent[];
  readonly afterToolResultEvents: readonly ProviderStreamEvent[];
  readonly providerTurnReplay: ProviderTurnReplay | undefined;
  readonly submittedToolResults: Array<{ toolCallId: string; toolResultText: string }> = [];
  private resolveToolResultSubmission: (() => void) | undefined;
  private hasReceivedToolResultSubmission = false;

  constructor(input: {
    beforeToolResultEvents: readonly ProviderStreamEvent[];
    afterToolResultEvents?: readonly ProviderStreamEvent[] | undefined;
    providerTurnReplay?: ProviderTurnReplay | undefined;
  }) {
    this.beforeToolResultEvents = input.beforeToolResultEvents;
    this.afterToolResultEvents = input.afterToolResultEvents ?? [];
    this.providerTurnReplay = input.providerTurnReplay;
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    for (const providerStreamEvent of this.beforeToolResultEvents) {
      yield providerStreamEvent;
    }

    if (this.afterToolResultEvents.length === 0) {
      return;
    }

    if (!this.hasReceivedToolResultSubmission) {
      await new Promise<void>((resolveToolResultSubmission) => {
        this.resolveToolResultSubmission = resolveToolResultSubmission;
      });
    }

    for (const providerStreamEvent of this.afterToolResultEvents) {
      yield providerStreamEvent;
    }
  }

  async submitToolResult(input: { toolCallId: string; toolResultText: string }): Promise<void> {
    this.submittedToolResults.push(input);
    this.hasReceivedToolResultSubmission = true;
    this.resolveToolResultSubmission?.();
  }

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return this.providerTurnReplay;
  }
}

class AbortTrackingOpenAiProtocolTurn implements OpenAiProviderProtocolHostConversationTurn {
  readonly abortSignal: AbortSignal;

  constructor(abortSignal: AbortSignal) {
    this.abortSignal = abortSignal;
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    await new Promise<void>((_resolve, reject) => {
      const rejectAsAborted = (): void => reject(new Error("provider aborted"));
      this.abortSignal.addEventListener("abort", rejectAsAborted, { once: true });
      if (this.abortSignal.aborted) {
        rejectAsAborted();
      }
    });
  }

  async submitToolResult(): Promise<void> {}

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class ThrowingOpenAiProtocolTurn implements OpenAiProviderProtocolHostConversationTurn {
  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    throw new Error("scripted provider stream failed");
  }

  async submitToolResult(): Promise<void> {}

  getProviderTurnReplay(): ProviderTurnReplay | undefined {
    return undefined;
  }
}

class OpenAiProviderProtocolHostTestRuntime {
  readonly hostFrameQueue = new CloseableProtocolFrameQueue<ProviderProtocolHostFrame>();
  readonly sentProviderFrames: ProviderProtocolProviderFrame[] = [];
  readonly hostPromise: Promise<void>;

  constructor(provider: OpenAiProviderProtocolHostConversationTurnProvider) {
    this.hostPromise = runOpenAiProviderProtocolHost({
      provider,
      transport: {
        hostFrames: this.hostFrameQueue,
        sendProviderFrame: async (frame) => {
          this.sentProviderFrames.push(frame);
        },
      },
    });
  }

  async stop(): Promise<void> {
    this.hostFrameQueue.close();
    await this.hostPromise;
  }
}

class CloseableProtocolFrameQueue<QueuedValue> implements AsyncIterable<QueuedValue> {
  private readonly queuedValues: QueuedValue[] = [];
  private pendingNext: ((result: IteratorResult<QueuedValue>) => void) | undefined;
  private isClosed = false;

  enqueue(value: QueuedValue): void {
    if (this.isClosed) {
      throw new Error("Cannot enqueue into a closed protocol frame queue.");
    }

    if (this.pendingNext) {
      const resolvePendingNext = this.pendingNext;
      this.pendingNext = undefined;
      resolvePendingNext({ done: false, value });
      return;
    }

    this.queuedValues.push(value);
  }

  close(): void {
    this.isClosed = true;
    if (!this.pendingNext) {
      return;
    }

    const resolvePendingNext = this.pendingNext;
    this.pendingNext = undefined;
    resolvePendingNext({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<QueuedValue> {
    return { next: () => this.next() };
  }

  private next(): Promise<IteratorResult<QueuedValue>> {
    const queuedValue = this.queuedValues.shift();
    if (queuedValue !== undefined) {
      return Promise.resolve({ done: false, value: queuedValue });
    }

    if (this.isClosed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise<IteratorResult<QueuedValue>>((resolveNext) => {
      this.pendingNext = resolveNext;
    });
  }
}

async function waitForProviderFrameCount(input: {
  runtime: OpenAiProviderProtocolHostTestRuntime;
  expectedFrameCount: number;
}): Promise<void> {
  for (let attemptIndex = 0; attemptIndex < 100; attemptIndex += 1) {
    if (input.runtime.sentProviderFrames.length >= input.expectedFrameCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error(`Timed out waiting for ${input.expectedFrameCount} provider frames.`);
}

function createHostStartTurnFrame(): ProviderProtocolHostFrame {
  return {
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_start_turn",
    requestId: "req-start-1",
    turnId: "turn-1",
    turnRequest: {
      systemPromptText: "You are Buli.",
      conversationSessionEntries: [],
      selectedModelId: "gpt-5.5",
    },
  };
}

test("runOpenAiProviderProtocolHost sends replay only on turn close", async () => {
  const providerTurn = new ScriptedOpenAiProtocolTurn({
    beforeToolResultEvents: [
      { type: "text_chunk", text: "Hello" },
      { type: "completed", usage: completedUsage },
    ],
    providerTurnReplay: { provider: "openai", inputItems: [] },
  });
  const runtime = new OpenAiProviderProtocolHostTestRuntime(new ScriptedOpenAiProtocolProvider([providerTurn]));

  runtime.hostFrameQueue.enqueue(createHostStartTurnFrame());
  await waitForProviderFrameCount({ runtime, expectedFrameCount: 4 });

  expect(runtime.sentProviderFrames).toEqual([
    {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_request_acknowledged",
      requestId: "req-start-1",
      turnId: "turn-1",
      acknowledgedFrameKind: "host_start_turn",
    },
    {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_event",
      turnId: "turn-1",
      sequenceNumber: 1,
      providerStreamEvent: { type: "text_chunk", text: "Hello" },
    },
    {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_event",
      turnId: "turn-1",
      sequenceNumber: 2,
      providerStreamEvent: { type: "completed", usage: completedUsage },
    },
    {
      protocol: PROVIDER_PROTOCOL_VERSION,
      frameKind: "provider_turn_closed",
      turnId: "turn-1",
      closedReason: "completed",
      finalSequenceNumber: 2,
      providerTurnReplay: { provider: "openai", inputItems: [] },
    },
  ]);
  await runtime.stop();
});

test("runOpenAiProviderProtocolHost forwards tool results and acknowledges submissions", async () => {
  const providerTurn = new ScriptedOpenAiProtocolTurn({
    beforeToolResultEvents: [
      {
        type: "tool_call_requested",
        toolCallId: "call-read-1",
        toolCallRequest: { toolName: "read", readTargetPath: "README.md" },
      },
    ],
    afterToolResultEvents: [
      { type: "text_chunk", text: "Done" },
      { type: "completed", usage: completedUsage },
    ],
  });
  const runtime = new OpenAiProviderProtocolHostTestRuntime(new ScriptedOpenAiProtocolProvider([providerTurn]));

  runtime.hostFrameQueue.enqueue(createHostStartTurnFrame());
  await waitForProviderFrameCount({ runtime, expectedFrameCount: 2 });
  runtime.hostFrameQueue.enqueue({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_submit_tool_result",
    requestId: "req-tool-result-1",
    turnId: "turn-1",
    toolCallId: "call-read-1",
    toolResultText: "README contents",
  });
  await waitForProviderFrameCount({ runtime, expectedFrameCount: 6 });

  expect(providerTurn.submittedToolResults).toEqual([
    { toolCallId: "call-read-1", toolResultText: "README contents" },
  ]);
  expect(runtime.sentProviderFrames[2]).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_request_acknowledged",
    requestId: "req-tool-result-1",
    turnId: "turn-1",
    acknowledgedFrameKind: "host_submit_tool_result",
  });
  expect(runtime.sentProviderFrames.map((frame) => frame.frameKind)).toEqual([
    "provider_request_acknowledged",
    "provider_event",
    "provider_request_acknowledged",
    "provider_event",
    "provider_event",
    "provider_turn_closed",
  ]);
  await runtime.stop();
});

test("runOpenAiProviderProtocolHost aborts provider turns after cancel frames", async () => {
  let abortTrackingProviderTurn: AbortTrackingOpenAiProtocolTurn | undefined;
  const provider = new ScriptedOpenAiProtocolProvider([]);
  const runtime = new OpenAiProviderProtocolHostTestRuntime({
    startConversationTurn(input) {
      provider.startedTurnRequests.push(input);
      if (!input.abortSignal) {
        throw new Error("Expected provider protocol host to pass an AbortSignal.");
      }

      abortTrackingProviderTurn = new AbortTrackingOpenAiProtocolTurn(input.abortSignal);
      return abortTrackingProviderTurn;
    },
  });

  runtime.hostFrameQueue.enqueue(createHostStartTurnFrame());
  await waitForProviderFrameCount({ runtime, expectedFrameCount: 1 });
  runtime.hostFrameQueue.enqueue({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "host_cancel_turn",
    requestId: "req-cancel-1",
    turnId: "turn-1",
    cancellationReason: "user_interrupted",
  });
  await waitForProviderFrameCount({ runtime, expectedFrameCount: 4 });

  expect(abortTrackingProviderTurn?.abortSignal.aborted).toBe(true);
  expect(runtime.sentProviderFrames.some((frame) =>
    frame.frameKind === "provider_request_acknowledged" && frame.acknowledgedFrameKind === "host_cancel_turn"
  )).toBe(true);
  expect(runtime.sentProviderFrames).toContainEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_turn_closed",
    turnId: "turn-1",
    closedReason: "cancelled",
  });
  await runtime.stop();
});

test("runOpenAiProviderProtocolHost maps provider stream failures to structured errors", async () => {
  const runtime = new OpenAiProviderProtocolHostTestRuntime(
    new ScriptedOpenAiProtocolProvider([new ThrowingOpenAiProtocolTurn()]),
  );

  runtime.hostFrameQueue.enqueue(createHostStartTurnFrame());
  await waitForProviderFrameCount({ runtime, expectedFrameCount: 3 });

  expect(runtime.sentProviderFrames[1]).toMatchObject({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_error",
    turnId: "turn-1",
    error: {
      errorCode: "provider_turn_stream_failed",
      errorMessage: "scripted provider stream failed",
      providerName: "openai",
    },
  });
  expect(runtime.sentProviderFrames[2]).toEqual({
    protocol: PROVIDER_PROTOCOL_VERSION,
    frameKind: "provider_turn_closed",
    turnId: "turn-1",
    closedReason: "failed",
  });
  await runtime.stop();
});
