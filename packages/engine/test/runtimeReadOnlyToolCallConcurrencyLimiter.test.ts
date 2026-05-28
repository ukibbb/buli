import { expect, test } from "bun:test";
import { availableParallelism } from "node:os";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import {
  DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT,
  MAXIMUM_DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT,
  MINIMUM_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT,
  RuntimeReadOnlyToolCallConcurrencyLimiter,
} from "../src/runtimeReadOnlyToolCallConcurrencyLimiter.ts";

class DeferredCompletion {
  readonly promise: Promise<void>;
  private resolvePromise: (() => void) | undefined;

  constructor() {
    this.promise = new Promise<void>((resolvePromise) => {
      this.resolvePromise = resolvePromise;
    });
  }

  complete(): void {
    this.resolvePromise?.();
  }
}

test("RuntimeReadOnlyToolCallConcurrencyLimiter defaults to a hardware-adaptive bounded concurrency", () => {
  expect(DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT).toBe(
    Math.max(
      MINIMUM_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT,
      Math.min(MAXIMUM_DEFAULT_READ_ONLY_TOOL_CALL_CONCURRENCY_LIMIT, availableParallelism() * 4),
    ),
  );
});

test("RuntimeReadOnlyToolCallConcurrencyLimiter queues operations beyond the configured limit", async () => {
  const readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter({
    maximumConcurrentReadOnlyToolCalls: 2,
  });
  const firstTwoOperationsStarted = new DeferredCompletion();
  const releaseOperations = new DeferredCompletion();
  const startedOperationNumbers: number[] = [];
  let activeOperationCount = 0;
  let maximumActiveOperationCount = 0;

  const operationResultsPromise = Promise.all([1, 2, 3, 4, 5].map((operationNumber) =>
    readOnlyToolCallConcurrencyLimiter.run(async () => {
      startedOperationNumbers.push(operationNumber);
      activeOperationCount += 1;
      maximumActiveOperationCount = Math.max(maximumActiveOperationCount, activeOperationCount);
      if (startedOperationNumbers.length === 2) {
        firstTwoOperationsStarted.complete();
      }

      await releaseOperations.promise;
      activeOperationCount -= 1;
      return operationNumber;
    })
  ));

  await waitForPromiseWithTimeout({
    promise: firstTwoOperationsStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter did not start the first two operations."),
  });
  expect(startedOperationNumbers).toEqual([1, 2]);

  releaseOperations.complete();
  expect(await operationResultsPromise).toEqual([1, 2, 3, 4, 5]);
  expect(startedOperationNumbers).toEqual([1, 2, 3, 4, 5]);
  expect(maximumActiveOperationCount).toBe(2);
});

test("RuntimeReadOnlyToolCallConcurrencyLimiter emits slot pressure diagnostics", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter({
    maximumConcurrentReadOnlyToolCalls: 1,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const firstOperationStarted = new DeferredCompletion();
  const releaseFirstOperation = new DeferredCompletion();

  const firstOperationPromise = readOnlyToolCallConcurrencyLimiter.run(async () => {
    firstOperationStarted.complete();
    await releaseFirstOperation.promise;
    return "first";
  }, { toolCallId: "call-read", toolName: "read" });
  await waitForPromiseWithTimeout({
    promise: firstOperationStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter did not start the first operation."),
  });

  const secondOperationPromise = readOnlyToolCallConcurrencyLimiter.run(async () => "second", {
    toolCallId: "call-grep",
    toolName: "grep",
  });
  expect(diagnosticEvents.map((diagnosticEvent) => diagnosticEvent.eventName)).toEqual([
    "read_only_tool_call_limiter.slot_acquired",
    "read_only_tool_call_limiter.slot_wait_started",
  ]);

  releaseFirstOperation.complete();
  expect(await Promise.all([firstOperationPromise, secondOperationPromise])).toEqual(["first", "second"]);
  expect(diagnosticEvents.map((diagnosticEvent) => diagnosticEvent.eventName)).toEqual([
    "read_only_tool_call_limiter.slot_acquired",
    "read_only_tool_call_limiter.slot_wait_started",
    "read_only_tool_call_limiter.slot_released",
    "read_only_tool_call_limiter.slot_acquired",
    "read_only_tool_call_limiter.slot_released",
  ]);
  expect(diagnosticEvents[1]?.fields).toMatchObject({
    toolCallId: "call-grep",
    toolName: "grep",
    readOnlyToolCallConcurrencyCategory: "search",
    activeReadOnlyToolCallCount: 1,
    pendingReadOnlyToolCallCount: 1,
    maximumConcurrentReadOnlyToolCalls: 1,
    activeSearchToolCallCount: 0,
    pendingSearchToolCallCount: 1,
  });
  const queuedAcquireEvent = diagnosticEvents.find((diagnosticEvent) =>
    diagnosticEvent.eventName === "read_only_tool_call_limiter.slot_acquired" && diagnosticEvent.fields?.["toolCallId"] === "call-grep"
  );
  expect(queuedAcquireEvent?.fields).toMatchObject({
    readOnlyToolCallConcurrencyCategory: "search",
    activeReadOnlyToolCallCount: 1,
    pendingReadOnlyToolCallCount: 0,
    maximumConcurrentReadOnlyToolCalls: 1,
    activeSearchToolCallCount: 1,
    pendingSearchToolCallCount: 0,
  });
  const waitDurationMs = queuedAcquireEvent?.fields?.["waitDurationMs"];
  if (typeof waitDurationMs !== "number") {
    throw new Error("Queued acquire diagnostic did not include a wait duration.");
  }
  expect(waitDurationMs).toBeGreaterThanOrEqual(0);
});

test("RuntimeReadOnlyToolCallConcurrencyLimiter lets reads pass a saturated search category when total capacity remains", async () => {
  const readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter({
    maximumConcurrentReadOnlyToolCalls: 2,
    maximumConcurrentSearchToolCalls: 1,
    maximumConcurrentReadToolCalls: 2,
  });
  const firstSearchStarted = new DeferredCompletion();
  const readStarted = new DeferredCompletion();
  const releaseFirstSearch = new DeferredCompletion();
  const startedOperations: string[] = [];

  const firstSearchPromise = readOnlyToolCallConcurrencyLimiter.run(async () => {
    startedOperations.push("search-1");
    firstSearchStarted.complete();
    await releaseFirstSearch.promise;
    return "search-1";
  }, { toolName: "grep" });
  await waitForPromiseWithTimeout({
    promise: firstSearchStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter did not start the first search operation."),
  });

  const secondSearchPromise = readOnlyToolCallConcurrencyLimiter.run(async () => {
    startedOperations.push("search-2");
    return "search-2";
  }, { toolName: "grep" });
  const readPromise = readOnlyToolCallConcurrencyLimiter.run(async () => {
    startedOperations.push("read");
    readStarted.complete();
    return "read";
  }, { toolName: "read" });

  await waitForPromiseWithTimeout({
    promise: readStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter blocked a read behind a saturated search category."),
  });
  expect(startedOperations).toEqual(["search-1", "read"]);

  releaseFirstSearch.complete();
  expect(await Promise.all([firstSearchPromise, secondSearchPromise, readPromise])).toEqual(["search-1", "search-2", "read"]);
  expect(startedOperations).toEqual(["search-1", "read", "search-2"]);
});

test("RuntimeReadOnlyToolCallConcurrencyLimiter still enforces the total read-only limit", async () => {
  const readOnlyToolCallConcurrencyLimiter = new RuntimeReadOnlyToolCallConcurrencyLimiter({
    maximumConcurrentReadOnlyToolCalls: 1,
    maximumConcurrentReadToolCalls: 1,
    maximumConcurrentSearchToolCalls: 1,
  });
  const readStarted = new DeferredCompletion();
  const releaseRead = new DeferredCompletion();
  const startedOperations: string[] = [];

  const readPromise = readOnlyToolCallConcurrencyLimiter.run(async () => {
    startedOperations.push("read");
    readStarted.complete();
    await releaseRead.promise;
    return "read";
  }, { toolName: "read" });
  await waitForPromiseWithTimeout({
    promise: readStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter did not start the read operation."),
  });

  const searchPromise = readOnlyToolCallConcurrencyLimiter.run(async () => {
    startedOperations.push("search");
    return "search";
  }, { toolName: "grep" });
  await Promise.resolve();
  expect(startedOperations).toEqual(["read"]);

  releaseRead.complete();
  expect(await Promise.all([readPromise, searchPromise])).toEqual(["read", "search"]);
  expect(startedOperations).toEqual(["read", "search"]);
});

async function waitForPromiseWithTimeout(input: {
  promise: Promise<void>;
  timeoutMilliseconds: number;
  createTimeoutError: () => Error;
}): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const timeoutHandle = setTimeout(() => rejectPromise(input.createTimeoutError()), input.timeoutMilliseconds);
    input.promise.then(resolvePromise, rejectPromise).finally(() => clearTimeout(timeoutHandle));
  });
}
