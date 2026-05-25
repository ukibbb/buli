import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { OpenAiRateLimitCoordinator } from "../src/provider/openAiRateLimitCoordinator.ts";

test("OpenAiRateLimitCoordinator queues response-step streams beyond the configured limit", async () => {
  const coordinator = new OpenAiRateLimitCoordinator({ maximumConcurrentResponseStepStreams: 1 });
  const firstSlot = await coordinator.acquireResponseStepStreamSlot();
  let didAcquireSecondSlot = false;

  const secondSlotPromise = coordinator.acquireResponseStepStreamSlot().then((slot) => {
    didAcquireSecondSlot = true;
    return slot;
  });
  await Promise.resolve();

  expect(didAcquireSecondSlot).toBe(false);
  firstSlot.release();

  const secondSlot = await secondSlotPromise;
  expect(didAcquireSecondSlot).toBe(true);
  secondSlot.release();
});

test("OpenAiRateLimitCoordinator observes request cooldown headers", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const coordinator = new OpenAiRateLimitCoordinator({
    maximumConcurrentResponseStepStreams: 1,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  coordinator.observeResponseHeaders(new Headers({
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "1ms",
  }));
  const slot = await coordinator.acquireResponseStepStreamSlot();
  slot.release();

  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.request_cooldown_observed",
    fields: expect.objectContaining({
      rateLimitRequestsRemaining: 0,
      rateLimitRequestsResetAfterMilliseconds: 1,
    }),
  }));
});

test("OpenAiRateLimitCoordinator reduces stream concurrency after exhausted request limit headers", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const coordinator = new OpenAiRateLimitCoordinator({
    maximumConcurrentResponseStepStreams: 4,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  coordinator.observeResponseHeaders(new Headers({
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "0ms",
  }));

  const firstSlot = await coordinator.acquireResponseStepStreamSlot();
  const secondSlot = await coordinator.acquireResponseStepStreamSlot();
  let didAcquireThirdSlot = false;
  const thirdSlotPromise = coordinator.acquireResponseStepStreamSlot().then((slot) => {
    didAcquireThirdSlot = true;
    return slot;
  });
  await Promise.resolve();

  expect(didAcquireThirdSlot).toBe(false);
  firstSlot.release();

  const thirdSlot = await thirdSlotPromise;
  expect(didAcquireThirdSlot).toBe(true);
  secondSlot.release();
  thirdSlot.release();
  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.adaptive_stream_limit_reduced",
    fields: expect.objectContaining({
      previousConcurrentResponseStepStreamLimit: 4,
      currentConcurrentResponseStepStreamLimit: 2,
      maxConcurrentResponseStepStreams: 4,
      rateLimitRequestsRemaining: 0,
    }),
  }));
});

test("OpenAiRateLimitCoordinator reduces stream concurrency after exhausted token limit headers", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const coordinator = new OpenAiRateLimitCoordinator({
    maximumConcurrentResponseStepStreams: 4,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  coordinator.observeResponseHeaders(new Headers({
    "x-ratelimit-remaining-requests": "3",
    "x-ratelimit-remaining-tokens": "0",
    "x-ratelimit-reset-tokens": "0ms",
  }));

  const firstSlot = await coordinator.acquireResponseStepStreamSlot();
  const secondSlot = await coordinator.acquireResponseStepStreamSlot();
  let didAcquireThirdSlot = false;
  const thirdSlotPromise = coordinator.acquireResponseStepStreamSlot().then((slot) => {
    didAcquireThirdSlot = true;
    return slot;
  });
  await Promise.resolve();

  expect(didAcquireThirdSlot).toBe(false);
  firstSlot.release();

  const thirdSlot = await thirdSlotPromise;
  expect(didAcquireThirdSlot).toBe(true);
  secondSlot.release();
  thirdSlot.release();
  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.adaptive_stream_limit_reduced",
    fields: expect.objectContaining({
      previousConcurrentResponseStepStreamLimit: 4,
      currentConcurrentResponseStepStreamLimit: 2,
      maxConcurrentResponseStepStreams: 4,
      rateLimitTokensRemaining: 0,
    }),
  }));
});

test("OpenAiRateLimitCoordinator observes Retry-After cooldown without rate-limit headers", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const coordinator = new OpenAiRateLimitCoordinator({
    maximumConcurrentResponseStepStreams: 2,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  coordinator.observeResponseHeaders(new Headers(), {
    status: 429,
    retryAfterMilliseconds: 1,
  });
  const slot = await coordinator.acquireResponseStepStreamSlot();
  slot.release();

  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.retry_after_cooldown_observed",
    fields: expect.objectContaining({
      retryAfterMilliseconds: 1,
    }),
  }));
  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.adaptive_stream_limit_reduced",
    fields: expect.objectContaining({
      previousConcurrentResponseStepStreamLimit: 2,
      currentConcurrentResponseStepStreamLimit: 1,
      maxConcurrentResponseStepStreams: 2,
    }),
  }));
});

test("OpenAiRateLimitCoordinator increases stream concurrency after successful non-exhausted response headers", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const coordinator = new OpenAiRateLimitCoordinator({
    maximumConcurrentResponseStepStreams: 4,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  coordinator.observeResponseHeaders(new Headers({
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "0ms",
  }));
  coordinator.observeResponseHeaders(new Headers({
    "x-ratelimit-remaining-requests": "5",
  }), { wasSuccessfulHttpResponse: true });

  const firstSlot = await coordinator.acquireResponseStepStreamSlot();
  const secondSlot = await coordinator.acquireResponseStepStreamSlot();
  const thirdSlot = await coordinator.acquireResponseStepStreamSlot();
  let didAcquireFourthSlot = false;
  const fourthSlotPromise = coordinator.acquireResponseStepStreamSlot().then((slot) => {
    didAcquireFourthSlot = true;
    return slot;
  });
  await Promise.resolve();

  expect(didAcquireFourthSlot).toBe(false);
  firstSlot.release();

  const fourthSlot = await fourthSlotPromise;
  expect(didAcquireFourthSlot).toBe(true);
  secondSlot.release();
  thirdSlot.release();
  fourthSlot.release();
  expect(diagnosticEvents).toContainEqual(expect.objectContaining({
    subsystem: "openai",
    eventName: "rate_limit_coordinator.adaptive_stream_limit_increased",
    fields: expect.objectContaining({
      previousConcurrentResponseStepStreamLimit: 2,
      currentConcurrentResponseStepStreamLimit: 3,
      maxConcurrentResponseStepStreams: 4,
      rateLimitRequestsRemaining: 5,
    }),
  }));
});

test("OpenAiRateLimitCoordinator stops waiting when aborted", async () => {
  const coordinator = new OpenAiRateLimitCoordinator({ maximumConcurrentResponseStepStreams: 1 });
  const firstSlot = await coordinator.acquireResponseStepStreamSlot();
  const abortController = new AbortController();
  const secondSlotPromise = coordinator.acquireResponseStepStreamSlot({ abortSignal: abortController.signal });

  abortController.abort();

  await expect(secondSlotPromise).rejects.toThrow("interrupted while waiting for an OpenAI response stream slot");
  firstSlot.release();
});
