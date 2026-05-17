import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import { mergeAssistantResponseEventStreams } from "../src/runtimeAssistantResponseEventStreamMerge.ts";

class DeferredValue<T> {
  readonly promise: Promise<T>;
  private resolvePromise: ((value: T) => void) | undefined;
  private rejectPromise: ((error: unknown) => void) | undefined;

  constructor() {
    this.promise = new Promise<T>((resolvePromise, rejectPromise) => {
      this.resolvePromise = resolvePromise;
      this.rejectPromise = rejectPromise;
    });
  }

  resolve(value: T): void {
    if (!this.resolvePromise) {
      throw new Error("Deferred value has no resolve callback.");
    }

    this.resolvePromise(value);
  }

  reject(error: unknown): void {
    if (!this.rejectPromise) {
      throw new Error("Deferred value has no reject callback.");
    }

    this.rejectPromise(error);
  }
}

class ControlledAssistantResponseEventStream implements AsyncGenerator<AssistantResponseEvent, void, unknown> {
  private readonly queuedIteratorResults: Array<Promise<IteratorResult<AssistantResponseEvent, void>>>;
  nextCallCount = 0;
  returnCallCount = 0;

  constructor(queuedIteratorResults: readonly Promise<IteratorResult<AssistantResponseEvent, void>>[]) {
    this.queuedIteratorResults = [...queuedIteratorResults];
  }

  next(..._args: [] | [unknown]): Promise<IteratorResult<AssistantResponseEvent, void>> {
    this.nextCallCount += 1;
    return this.queuedIteratorResults.shift() ?? Promise.resolve(createDoneIteratorResult());
  }

  return(_value?: void | PromiseLike<void>): Promise<IteratorResult<AssistantResponseEvent, void>> {
    this.returnCallCount += 1;
    return Promise.resolve(createDoneIteratorResult());
  }

  throw(error?: unknown): Promise<IteratorResult<AssistantResponseEvent, void>> {
    return Promise.reject(error);
  }

  [Symbol.asyncIterator](): AsyncGenerator<AssistantResponseEvent, void, unknown> {
    return this;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

function createAssistantTurnStartedEvent(messageId: string, startedAtMs: number): AssistantResponseEvent {
  return {
    type: "assistant_turn_started",
    messageId,
    startedAtMs,
  };
}

function createYieldIteratorResult(
  assistantResponseEvent: AssistantResponseEvent,
): IteratorResult<AssistantResponseEvent, void> {
  return {
    done: false,
    value: assistantResponseEvent,
  };
}

function createDoneIteratorResult(): IteratorResult<AssistantResponseEvent, void> {
  return {
    done: true,
    value: undefined,
  };
}

function createResolvedYieldIteratorResult(
  assistantResponseEvent: AssistantResponseEvent,
): Promise<IteratorResult<AssistantResponseEvent, void>> {
  return Promise.resolve(createYieldIteratorResult(assistantResponseEvent));
}

function createResolvedDoneIteratorResult(): Promise<IteratorResult<AssistantResponseEvent, void>> {
  return Promise.resolve(createDoneIteratorResult());
}

function resolveValueAfterDelay<T>(value: T, delayMs: number): Promise<T> {
  return new Promise((resolveValue) => setTimeout(() => resolveValue(value), delayMs));
}

test("mergeAssistantResponseEventStreams races initial events instead of waiting for every stream", async () => {
  const stream0InitialResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream1InitialResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream0RemainingResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream1RemainingResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream0InitialEvent = createAssistantTurnStartedEvent("stream-0-initial", 1_000);
  const stream1InitialEvent = createAssistantTurnStartedEvent("stream-1-initial", 1_001);
  const stream0RemainingEvent = createAssistantTurnStartedEvent("stream-0-remaining", 1_002);
  const stream1RemainingEvent = createAssistantTurnStartedEvent("stream-1-remaining", 1_003);
  const stream0 = new ControlledAssistantResponseEventStream([
    stream0InitialResult.promise,
    stream0RemainingResult.promise,
    createResolvedDoneIteratorResult(),
  ]);
  const stream1 = new ControlledAssistantResponseEventStream([
    stream1InitialResult.promise,
    stream1RemainingResult.promise,
    createResolvedDoneIteratorResult(),
  ]);
  const mergedAssistantResponseEventStream = mergeAssistantResponseEventStreams({
    assistantResponseEventStreams: [stream0, stream1],
    throwIfConversationTurnInterrupted: () => {},
  });

  const firstMergedEventResult = mergedAssistantResponseEventStream.next();
  stream1InitialResult.resolve(createYieldIteratorResult(stream1InitialEvent));

  expect(await Promise.race([firstMergedEventResult, resolveValueAfterDelay("timed out", 10)])).toEqual(
    createYieldIteratorResult(stream1InitialEvent),
  );

  const secondMergedEventResult = mergedAssistantResponseEventStream.next();
  stream0InitialResult.resolve(createYieldIteratorResult(stream0InitialEvent));

  expect(await secondMergedEventResult).toEqual(createYieldIteratorResult(stream0InitialEvent));

  const thirdMergedEventResult = mergedAssistantResponseEventStream.next();
  stream1RemainingResult.resolve(createYieldIteratorResult(stream1RemainingEvent));
  expect(await thirdMergedEventResult).toEqual(createYieldIteratorResult(stream1RemainingEvent));

  const fourthMergedEventResult = mergedAssistantResponseEventStream.next();
  stream0RemainingResult.resolve(createYieldIteratorResult(stream0RemainingEvent));
  expect(await fourthMergedEventResult).toEqual(createYieldIteratorResult(stream0RemainingEvent));
  expect(await mergedAssistantResponseEventStream.next()).toEqual(createDoneIteratorResult());
  expect(stream0.nextCallCount).toBe(3);
  expect(stream1.nextCallCount).toBe(3);
});

test("mergeAssistantResponseEventStreams closes sibling iterators when one stream throws", async () => {
  const stream0FailureResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream1PendingResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream0 = new ControlledAssistantResponseEventStream([
    createResolvedYieldIteratorResult(createAssistantTurnStartedEvent("stream-0-initial", 1_000)),
    stream0FailureResult.promise,
  ]);
  const stream1 = new ControlledAssistantResponseEventStream([
    createResolvedYieldIteratorResult(createAssistantTurnStartedEvent("stream-1-initial", 1_001)),
    stream1PendingResult.promise,
  ]);
  const mergedAssistantResponseEventStream = mergeAssistantResponseEventStreams({
    assistantResponseEventStreams: [stream0, stream1],
    throwIfConversationTurnInterrupted: () => {},
  });

  expect(await mergedAssistantResponseEventStream.next()).toEqual(
    createYieldIteratorResult(createAssistantTurnStartedEvent("stream-0-initial", 1_000)),
  );
  expect(await mergedAssistantResponseEventStream.next()).toEqual(
    createYieldIteratorResult(createAssistantTurnStartedEvent("stream-1-initial", 1_001)),
  );

  const failedMergedEventResult = mergedAssistantResponseEventStream.next();
  stream0FailureResult.reject(new Error("stream failed"));

  await expect(failedMergedEventResult).rejects.toThrow("stream failed");
  expect(stream0.returnCallCount).toBe(1);
  expect(stream1.returnCallCount).toBe(1);
});

test("mergeAssistantResponseEventStreams closes child iterators when the merged stream is closed early", async () => {
  const stream0RemainingResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream1RemainingResult = new DeferredValue<IteratorResult<AssistantResponseEvent, void>>();
  const stream0 = new ControlledAssistantResponseEventStream([
    createResolvedYieldIteratorResult(createAssistantTurnStartedEvent("stream-0-initial", 1_000)),
    stream0RemainingResult.promise,
  ]);
  const stream1 = new ControlledAssistantResponseEventStream([
    createResolvedYieldIteratorResult(createAssistantTurnStartedEvent("stream-1-initial", 1_001)),
    stream1RemainingResult.promise,
  ]);
  const mergedAssistantResponseEventStream = mergeAssistantResponseEventStreams({
    assistantResponseEventStreams: [stream0, stream1],
    throwIfConversationTurnInterrupted: () => {},
  });

  expect(await mergedAssistantResponseEventStream.next()).toEqual(
    createYieldIteratorResult(createAssistantTurnStartedEvent("stream-0-initial", 1_000)),
  );
  await mergedAssistantResponseEventStream.return(undefined);

  expect(stream0.returnCallCount).toBe(1);
  expect(stream1.returnCallCount).toBe(1);
});

test("mergeAssistantResponseEventStreams checks interruption between emitted events", async () => {
  const stream0 = new ControlledAssistantResponseEventStream([
    createResolvedYieldIteratorResult(createAssistantTurnStartedEvent("stream-0-initial", 1_000)),
  ]);
  const stream1 = new ControlledAssistantResponseEventStream([
    createResolvedYieldIteratorResult(createAssistantTurnStartedEvent("stream-1-initial", 1_001)),
  ]);
  let interruptionCheckCount = 0;
  const mergedAssistantResponseEventStream = mergeAssistantResponseEventStreams({
    assistantResponseEventStreams: [stream0, stream1],
    throwIfConversationTurnInterrupted: () => {
      interruptionCheckCount += 1;
      if (interruptionCheckCount === 2) {
        throw new Error("turn interrupted");
      }
    },
  });

  expect(await mergedAssistantResponseEventStream.next()).toEqual(
    createYieldIteratorResult(createAssistantTurnStartedEvent("stream-0-initial", 1_000)),
  );
  await expect(mergedAssistantResponseEventStream.next()).rejects.toThrow("turn interrupted");
  expect(interruptionCheckCount).toBe(2);
  expect(stream0.returnCallCount).toBe(1);
  expect(stream1.returnCallCount).toBe(1);
});
