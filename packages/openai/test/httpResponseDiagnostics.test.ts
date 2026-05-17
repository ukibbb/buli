import { expect, test } from "bun:test";
import {
  createOpenAiHttpRequestError,
  extractHumanReadableOpenAiErrorMessage,
  extractStructuredOpenAiErrorMessage,
  getOpenAiRequestId,
} from "../src/provider/httpResponseDiagnostics.ts";

test("getOpenAiRequestId reads known OpenAI request id headers", () => {
  expect(getOpenAiRequestId(new Headers({ "x-request-id": "req_x" }))).toBe("req_x");
  expect(getOpenAiRequestId(new Headers({ "request-id": "req_plain" }))).toBe("req_plain");
  expect(getOpenAiRequestId(new Headers({ "openai-request-id": "req_openai" }))).toBe("req_openai");
  expect(getOpenAiRequestId(new Headers())).toBeUndefined();
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

test("createOpenAiHttpRequestError includes status, message, and request id", async () => {
  const response = new Response(JSON.stringify({ error: { message: "missing client_version" } }), {
    status: 400,
    headers: { "openai-request-id": "req_models_123" },
  });

  await expect(createOpenAiHttpRequestError(response, "models")).resolves.toEqual(
    new Error("OpenAI models request failed: 400 | missing client_version | request_id=req_models_123"),
  );
});
