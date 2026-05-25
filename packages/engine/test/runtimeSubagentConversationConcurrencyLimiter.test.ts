import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import {
  DEFAULT_SUBAGENT_CONVERSATION_CONCURRENCY_LIMIT,
  RuntimeSubagentConversationConcurrencyLimiter,
} from "../src/runtimeSubagentConversationConcurrencyLimiter.ts";

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

test("RuntimeSubagentConversationConcurrencyLimiter defaults to eight concurrent conversations", async () => {
  const subagentConversationConcurrencyLimiter = new RuntimeSubagentConversationConcurrencyLimiter();
  const firstEightConversationsStarted = new DeferredCompletion();
  const releaseConversations = new DeferredCompletion();
  const startedConversationNumbers: number[] = [];
  let activeConversationCount = 0;
  let maximumActiveConversationCount = 0;

  const conversationResultPromise = Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map((conversationNumber) =>
    collectSubagentConversationEvents(subagentConversationConcurrencyLimiter.stream(async function* () {
      startedConversationNumbers.push(conversationNumber);
      activeConversationCount += 1;
      maximumActiveConversationCount = Math.max(maximumActiveConversationCount, activeConversationCount);
      if (startedConversationNumbers.length === DEFAULT_SUBAGENT_CONVERSATION_CONCURRENCY_LIMIT) {
        firstEightConversationsStarted.complete();
      }

      await releaseConversations.promise;
      activeConversationCount -= 1;
      yield conversationNumber;
    }))
  ));

  await waitForPromiseWithTimeout({
    promise: firstEightConversationsStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter did not start the first eight subagent conversations."),
  });
  expect(startedConversationNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

  releaseConversations.complete();
  expect(await conversationResultPromise).toEqual([[1], [2], [3], [4], [5], [6], [7], [8], [9]]);
  expect(startedConversationNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(maximumActiveConversationCount).toBe(8);
});

test("RuntimeSubagentConversationConcurrencyLimiter emits slot pressure diagnostics", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const subagentConversationConcurrencyLimiter = new RuntimeSubagentConversationConcurrencyLimiter({
    maximumConcurrentSubagentConversations: 1,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const firstConversationStarted = new DeferredCompletion();
  const releaseFirstConversation = new DeferredCompletion();

  const firstConversationPromise = collectSubagentConversationEvents(
    subagentConversationConcurrencyLimiter.stream(async function* () {
      firstConversationStarted.complete();
      await releaseFirstConversation.promise;
      yield 1;
    }, { toolCallId: "call-task-1", toolName: "task", subagentName: "explore" }),
  );
  await waitForPromiseWithTimeout({
    promise: firstConversationStarted.promise,
    timeoutMilliseconds: 500,
    createTimeoutError: () => new Error("Limiter did not start the first subagent conversation."),
  });

  const secondConversationPromise = collectSubagentConversationEvents(
    subagentConversationConcurrencyLimiter.stream(async function* () {
      yield 2;
    }, { toolCallId: "call-task-2", toolName: "task", subagentName: "explore" }),
  );
  expect(diagnosticEvents.map((diagnosticEvent) => diagnosticEvent.eventName)).toEqual([
    "subagent_conversation_limiter.slot_acquired",
    "subagent_conversation_limiter.slot_wait_started",
  ]);

  releaseFirstConversation.complete();
  expect(await Promise.all([firstConversationPromise, secondConversationPromise])).toEqual([[1], [2]]);
  expect(diagnosticEvents.map((diagnosticEvent) => diagnosticEvent.eventName)).toEqual([
    "subagent_conversation_limiter.slot_acquired",
    "subagent_conversation_limiter.slot_wait_started",
    "subagent_conversation_limiter.slot_released",
    "subagent_conversation_limiter.slot_acquired",
    "subagent_conversation_limiter.slot_released",
  ]);
  expect(diagnosticEvents[1]?.fields).toMatchObject({
    toolCallId: "call-task-2",
    toolName: "task",
    subagentName: "explore",
    activeSubagentConversationCount: 1,
    pendingSubagentConversationCount: 1,
    maximumConcurrentSubagentConversations: 1,
  });
  const queuedAcquireEvent = diagnosticEvents.find((diagnosticEvent) =>
    diagnosticEvent.eventName === "subagent_conversation_limiter.slot_acquired" && diagnosticEvent.fields?.["toolCallId"] === "call-task-2"
  );
  expect(queuedAcquireEvent?.fields).toMatchObject({
    activeSubagentConversationCount: 1,
    pendingSubagentConversationCount: 0,
    maximumConcurrentSubagentConversations: 1,
  });
  const waitDurationMs = queuedAcquireEvent?.fields?.["waitDurationMs"];
  if (typeof waitDurationMs !== "number") {
    throw new Error("Queued acquire diagnostic did not include a wait duration.");
  }
  expect(waitDurationMs).toBeGreaterThanOrEqual(0);
});

async function collectSubagentConversationEvents(
  subagentConversationEvents: AsyncIterable<number>,
): Promise<number[]> {
  const collectedEvents: number[] = [];
  for await (const subagentConversationEvent of subagentConversationEvents) {
    collectedEvents.push(subagentConversationEvent);
  }

  return collectedEvents;
}

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
