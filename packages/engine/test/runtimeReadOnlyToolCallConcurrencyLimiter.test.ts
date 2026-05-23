import { expect, test } from "bun:test";
import { RuntimeReadOnlyToolCallConcurrencyLimiter } from "../src/runtimeReadOnlyToolCallConcurrencyLimiter.ts";

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
