import { expect, test } from "bun:test";
import { ContextWindowOverflowError } from "@buli/contracts";
import {
  createOpenAiHttpRequestError,
  extractHumanReadableOpenAiErrorMessage,
  extractStructuredOpenAiErrorMessage,
  getOpenAiRequestId,
  isRetryableOpenAiHttpResponseStatus,
  isRetryableOpenAiTransportError,
  readOpenAiRateLimitHeaders,
  readOpenAiRetryAfterMilliseconds,
  sanitizeOpenAiErrorMessage,
  summarizeOpenAiRateLimitHeadersForDiagnostics,
  summarizeOpenAiTransportErrorForDiagnostics,
} from "../src/provider/httpResponseDiagnostics.ts";

test("getOpenAiRequestId reads known OpenAI request id headers", () => {
  expect(getOpenAiRequestId(new Headers({ "x-request-id": "req_x" }))).toBe("req_x");
  expect(getOpenAiRequestId(new Headers({ "request-id": "req_plain" }))).toBe("req_plain");
  expect(getOpenAiRequestId(new Headers({ "openai-request-id": "req_openai" }))).toBe("req_openai");
  expect(getOpenAiRequestId(new Headers())).toBeUndefined();
});

test("isRetryableOpenAiHttpResponseStatus identifies transient provider statuses", () => {
  expect(isRetryableOpenAiHttpResponseStatus(429)).toBe(true);
  expect(isRetryableOpenAiHttpResponseStatus(500)).toBe(true);
  expect(isRetryableOpenAiHttpResponseStatus(502)).toBe(true);
  expect(isRetryableOpenAiHttpResponseStatus(503)).toBe(true);
  expect(isRetryableOpenAiHttpResponseStatus(504)).toBe(true);
  expect(isRetryableOpenAiHttpResponseStatus(529)).toBe(true);
  expect(isRetryableOpenAiHttpResponseStatus(400)).toBe(false);
  expect(isRetryableOpenAiHttpResponseStatus(401)).toBe(false);
});

test("readOpenAiRetryAfterMilliseconds reads retry headers", () => {
  expect(readOpenAiRetryAfterMilliseconds(new Headers({ "retry-after-ms": "250.2" }))).toBe(251);
  expect(readOpenAiRetryAfterMilliseconds(new Headers({ "retry-after": "2" }))).toBe(2000);
  expect(readOpenAiRetryAfterMilliseconds(new Headers({ "retry-after-ms": "bad", "retry-after": "1" }))).toBe(1000);
  expect(readOpenAiRetryAfterMilliseconds(new Headers())).toBeUndefined();
});

test("readOpenAiRateLimitHeaders reads numeric limits and reset durations", () => {
  const rateLimitHeaders = new Headers({
    "x-ratelimit-limit-requests": "500",
    "x-ratelimit-remaining-requests": "0",
    "x-ratelimit-reset-requests": "1m30s",
    "x-ratelimit-limit-tokens": "100000",
    "x-ratelimit-remaining-tokens": "2500",
    "x-ratelimit-reset-tokens": "250ms",
  });

  expect(readOpenAiRateLimitHeaders(rateLimitHeaders)).toEqual({
    requestLimit: 500,
    requestsRemaining: 0,
    requestsResetAfterMilliseconds: 90_000,
    tokenLimit: 100_000,
    tokensRemaining: 2_500,
    tokensResetAfterMilliseconds: 250,
  });
});

test("readOpenAiRateLimitHeaders ignores malformed rate-limit values", () => {
  expect(readOpenAiRateLimitHeaders(new Headers({
    "x-ratelimit-limit-requests": "bad",
    "x-ratelimit-reset-requests": "next Tuesday",
  }))).toBeUndefined();
  expect(readOpenAiRateLimitHeaders(new Headers({ "x-ratelimit-reset-requests": "2" }))).toEqual({
    requestsResetAfterMilliseconds: 2000,
  });
});

test("summarizeOpenAiRateLimitHeadersForDiagnostics avoids raw header values", () => {
  const diagnostics = summarizeOpenAiRateLimitHeadersForDiagnostics(new Headers({
    "x-ratelimit-limit-requests": "12",
    "x-ratelimit-remaining-requests": "3",
    "x-ratelimit-reset-requests": "2s",
  }));

  expect(diagnostics).toEqual({
    rateLimitRequestLimit: 12,
    rateLimitRequestsRemaining: 3,
    rateLimitRequestsResetAfterMilliseconds: 2000,
  });
  expect(JSON.stringify(diagnostics)).not.toContain("2s");
});

test("OpenAI transport diagnostics classify retryable errors without raw messages", () => {
  const retryableTransportError = new TypeError("fetch failed with secret-token");

  expect(isRetryableOpenAiTransportError(retryableTransportError)).toBe(true);
  expect(isRetryableOpenAiTransportError(new DOMException("request aborted", "AbortError"))).toBe(false);
  expect(isRetryableOpenAiTransportError(new Error("test programming error"))).toBe(false);
  expect(summarizeOpenAiTransportErrorForDiagnostics(retryableTransportError)).toEqual({
    transportErrorName: "TypeError",
    transportErrorMessageLength: "fetch failed with secret-token".length,
  });
  expect(JSON.stringify(summarizeOpenAiTransportErrorForDiagnostics(retryableTransportError))).not.toContain("secret-token");
});

test("extractStructuredOpenAiErrorMessage reads JSON error messages", () => {
  expect(extractStructuredOpenAiErrorMessage(JSON.stringify({ error: { message: "missing client_version" } }))).toBe(
    "missing client_version",
  );
  expect(extractStructuredOpenAiErrorMessage("plain text failure")).toBeUndefined();
});

test("extractHumanReadableOpenAiErrorMessage prefers JSON messages and falls back to text", () => {
  expect(extractHumanReadableOpenAiErrorMessage(JSON.stringify({ error: { message: " bad request " } }))).toBe(
    "bad request",
  );
  expect(extractHumanReadableOpenAiErrorMessage(" input must be a message array ")).toBe("input must be a message array");
  expect(extractHumanReadableOpenAiErrorMessage("   ")).toBeUndefined();
});

test("extractHumanReadableOpenAiErrorMessage redacts and caps plaintext fallback", () => {
  const longFailureText = `proxy echoed Bearer secret-token and access_token=abc123 ${"x".repeat(600)}`;
  const extractedMessage = extractHumanReadableOpenAiErrorMessage(longFailureText);

  expect(extractedMessage).toContain("Bearer [REDACTED]");
  expect(extractedMessage).toContain("access_token=[REDACTED]");
  expect(extractedMessage).toContain("chars omitted");
  expect(extractedMessage).not.toContain("secret-token");
  expect(extractedMessage).not.toContain("abc123");
});

test("sanitizeOpenAiErrorMessage redacts and caps structured provider messages", () => {
  const sanitizedMessage = sanitizeOpenAiErrorMessage(
    `provider echoed Bearer secret-token refresh_token=refresh123 sk-testsecret ${"x".repeat(600)}`,
  );

  expect(sanitizedMessage).toContain("Bearer [REDACTED]");
  expect(sanitizedMessage).toContain("refresh_token=[REDACTED]");
  expect(sanitizedMessage).toContain("[REDACTED]");
  expect(sanitizedMessage).toContain("chars omitted");
  expect(sanitizedMessage).not.toContain("secret-token");
  expect(sanitizedMessage).not.toContain("refresh123");
  expect(sanitizedMessage).not.toContain("sk-testsecret");
});

test("createOpenAiHttpRequestError includes status, message, and request id", async () => {
  const response = new Response(JSON.stringify({ error: { message: "missing client_version" } }), {
    status: 400,
    headers: { "openai-request-id": "req_models_123" },
  });

  await expect(createOpenAiHttpRequestError(response, "models")).resolves.toEqual(
    new Error("OpenAI models request failed: 400 | missing client_version | request_id=req_models_123"),
  );
});

test("createOpenAiHttpRequestError classifies context window overflow", async () => {
  const response = new Response(
    JSON.stringify({
      error: {
        code: "context_length_exceeded",
        message: "Your input exceeds the context window of this model.",
      },
    }),
    { status: 400 },
  );

  await expect(createOpenAiHttpRequestError(response, "stream")).resolves.toBeInstanceOf(ContextWindowOverflowError);
});
