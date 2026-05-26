import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { requestOpenAiHttpResponseWithRetries } from "../src/provider/openAiHttpRetry.ts";

test("requestOpenAiHttpResponseWithRetries starts retry wait before yielding pending event", async () => {
  let requestCount = 0;
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after-ms": "120" },
        });
      }

      return new Response("ok", { status: 200 });
    },
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
    shouldYieldRetryPendingEvents: true,
  })[Symbol.asyncIterator]();

  const retryIteratorStartedAtMs = Date.now();
  const pendingRetryResult = await retryIterator.next();

  if (pendingRetryResult.done) {
    throw new Error("expected retry pending event");
  }

  expect(pendingRetryResult.value).toMatchObject({
    type: "rate_limit_pending",
    retryAfterSeconds: 1,
    retryReason: "rate_limit",
    limitExplanation: "OpenAI request was rate limited. Retrying after 1 second.",
  });
  expect(pendingRetryResult.value.retryWaitStartedAtMs).toBeGreaterThanOrEqual(retryIteratorStartedAtMs);

  await new Promise((resolve) => setTimeout(resolve, 160));

  const retryResumeStartedAtMs = Date.now();
  const completedRetryResult = await retryIterator.next();
  const retryResumeDurationMs = Date.now() - retryResumeStartedAtMs;

  if (!completedRetryResult.done) {
    throw new Error("expected completed retry result");
  }

  expect(completedRetryResult.value.response.status).toBe(200);
  expect(requestCount).toBe(2);
  expect(retryResumeDurationMs).toBeLessThan(90);
});

test("requestOpenAiHttpResponseWithRetries adds rate-limit headers to diagnostics", async () => {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () =>
      new Response("ok", {
        status: 200,
        headers: {
          "x-ratelimit-limit-requests": "50",
          "x-ratelimit-remaining-requests": "49",
          "x-ratelimit-reset-requests": "1s",
        },
      }),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
  })[Symbol.asyncIterator]();

  const retryResult = await retryIterator.next();

  expect(retryResult.done).toBe(true);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "test_response.response_received")?.fields)
    .toMatchObject({
      rateLimitRequestLimit: 50,
      rateLimitRequestsRemaining: 49,
      rateLimitRequestsResetAfterMilliseconds: 1000,
    });
});

test("requestOpenAiHttpResponseWithRetries reports headers for retryable and successful responses", async () => {
  let requestCount = 0;
  const observedResponseHeaders: Array<{
    status: number;
    wasSuccessfulHttpResponse: boolean;
    requestAttemptIndex: number;
    requestsRemaining: string | null;
  }> = [];
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response("slow down", {
          status: 429,
          headers: {
            "retry-after-ms": "0",
            "x-ratelimit-remaining-requests": "0",
            "x-ratelimit-reset-requests": "0ms",
          },
        });
      }

      return new Response("ok", {
        status: 200,
        headers: { "x-ratelimit-remaining-requests": "9" },
      });
    },
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
    onResponseHeadersReceived: (responseHeaderObservation) => {
      observedResponseHeaders.push({
        status: responseHeaderObservation.status,
        wasSuccessfulHttpResponse: responseHeaderObservation.wasSuccessfulHttpResponse,
        requestAttemptIndex: responseHeaderObservation.requestAttemptIndex,
        requestsRemaining: responseHeaderObservation.headers.get("x-ratelimit-remaining-requests"),
      });
    },
  })[Symbol.asyncIterator]();

  const retryResult = await retryIterator.next();

  expect(retryResult.done).toBe(true);
  expect(requestCount).toBe(2);
  expect(observedResponseHeaders).toEqual([
    {
      status: 429,
      wasSuccessfulHttpResponse: false,
      requestAttemptIndex: 1,
      requestsRemaining: "0",
    },
    {
      status: 200,
      wasSuccessfulHttpResponse: true,
      requestAttemptIndex: 2,
      requestsRemaining: "9",
    },
  ]);
});

test("requestOpenAiHttpResponseWithRetries can retry immediately when OpenAI sends no delay header", async () => {
  let requestCount = 0;
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () => {
      requestCount += 1;
      if (requestCount <= 2) {
        return new Response("temporary failure", { status: 503 });
      }

      return new Response("ok", { status: 200 });
    },
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
    retryPolicy: {
      maximumRetryCount: 2,
      fallbackRetryDelayMilliseconds: 0,
    },
  })[Symbol.asyncIterator]();

  const retryResult = await retryIterator.next();

  expect(retryResult.done).toBe(true);
  expect(requestCount).toBe(3);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "test_response.retry_scheduled"))
    .toHaveLength(2);
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "test_response.retry_scheduled").map(
    (diagnosticEvent) => diagnosticEvent.fields?.["retryDelayMilliseconds"],
  )).toEqual([0, 0]);
});

test("requestOpenAiHttpResponseWithRetries honors OpenAI retry headers before fallback delay", async () => {
  let requestCount = 0;
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after-ms": "0" },
        });
      }

      return new Response("ok", { status: 200 });
    },
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
    retryPolicy: {
      maximumRetryCount: 1,
      fallbackRetryDelayMilliseconds: 60_000,
    },
  })[Symbol.asyncIterator]();

  const retryResult = await retryIterator.next();

  expect(retryResult.done).toBe(true);
  expect(requestCount).toBe(2);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "test_response.retry_scheduled")?.fields)
    .toMatchObject({
      retryDelayMilliseconds: 0,
      maxRetryCount: 1,
    });
});

test("requestOpenAiHttpResponseWithRetries honors exhausted OpenAI rate-limit reset headers", async () => {
  let requestCount = 0;
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Response("slow down", {
          status: 429,
          headers: {
            "x-ratelimit-remaining-requests": "0",
            "x-ratelimit-reset-requests": "0ms",
          },
        });
      }

      return new Response("ok", { status: 200 });
    },
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
    retryPolicy: {
      maximumRetryCount: 1,
      fallbackRetryDelayMilliseconds: 60_000,
    },
  })[Symbol.asyncIterator]();

  const retryResult = await retryIterator.next();

  expect(retryResult.done).toBe(true);
  expect(requestCount).toBe(2);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "test_response.retry_scheduled")?.fields)
    .toMatchObject({
      retryDelayMilliseconds: 0,
      rateLimitRequestsRemaining: 0,
      rateLimitRequestsResetAfterMilliseconds: 0,
    });
});

test("requestOpenAiHttpResponseWithRetries stops before retry elapsed budget is exceeded", async () => {
  let requestCount = 0;
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const retryIterator = requestOpenAiHttpResponseWithRetries({
    fetchResponse: async () => {
      requestCount += 1;
      return new Response("temporary failure", { status: 503 });
    },
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    diagnosticEventPrefix: "test_response",
    requestAttemptDiagnosticFieldName: "requestAttemptIndex",
    maximumRetryCountDiagnosticFieldName: "maxRetryCount",
    debugLogTitlePrefix: "OpenAI test response",
    operationStartedAtMs: Date.now(),
    retryPolicy: {
      maximumRetryCount: 5,
      fallbackRetryDelayMilliseconds: 10,
      maximumRetryElapsedMilliseconds: 1,
    },
  })[Symbol.asyncIterator]();

  const retryResult = await retryIterator.next();

  expect(retryResult.done).toBe(true);
  if (!retryResult.done) {
    throw new Error("expected completed retry result");
  }
  expect(retryResult.value.response.status).toBe(503);
  expect(requestCount).toBe(1);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "test_response.retry_exhausted")?.fields)
    .toMatchObject({
      requestAttemptIndex: 1,
      maxRetryCount: 5,
      maximumRetryElapsedMilliseconds: 1,
      retryExhaustionReason: "maximum_retry_elapsed_time_reached",
      status: 503,
    });
});
