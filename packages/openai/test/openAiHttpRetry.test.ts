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
