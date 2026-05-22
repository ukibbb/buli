import { redactSensitiveText, type BuliDiagnosticLogFields } from "@buli/contracts";
import { z } from "zod";

const OpenAiErrorResponseBodySchema = z
  .object({
    error: z
      .object({
        message: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export type OpenAiHttpRequestOperation = "models" | "stream";

const MAX_HUMAN_READABLE_ERROR_MESSAGE_LENGTH = 500;

export type OpenAiHttpResponseHeaders = {
  get(name: string): string | null;
};

export type OpenAiHttpErrorResponse = {
  status: number;
  headers: OpenAiHttpResponseHeaders;
  text(): Promise<string>;
};

const RETRYABLE_OPENAI_HTTP_RESPONSE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

export function getOpenAiRequestId(headers: OpenAiHttpResponseHeaders): string | undefined {
  return headers.get("x-request-id") ?? headers.get("request-id") ?? headers.get("openai-request-id") ?? undefined;
}

export function isRetryableOpenAiHttpResponseStatus(status: number): boolean {
  return RETRYABLE_OPENAI_HTTP_RESPONSE_STATUSES.has(status);
}

export function isRetryableOpenAiTransportError(error: unknown): boolean {
  const transportErrorName = readOpenAiTransportErrorName(error);
  if (transportErrorName === "AbortError") {
    return false;
  }

  return error instanceof TypeError || transportErrorName === "NetworkError" || transportErrorName === "TimeoutError";
}

export function summarizeOpenAiTransportErrorForDiagnostics(error: unknown): BuliDiagnosticLogFields {
  const transportErrorMessageLength = readOpenAiTransportErrorMessageLength(error);
  return {
    transportErrorName: readOpenAiTransportErrorName(error),
    ...(transportErrorMessageLength !== undefined ? { transportErrorMessageLength } : {}),
  };
}

export function readOpenAiRetryAfterMilliseconds(headers: OpenAiHttpResponseHeaders): number | undefined {
  const retryAfterMillisecondsHeader = headers.get("retry-after-ms");
  if (retryAfterMillisecondsHeader) {
    const retryAfterMilliseconds = Number(retryAfterMillisecondsHeader);
    if (Number.isFinite(retryAfterMilliseconds)) {
      return Math.max(0, Math.ceil(retryAfterMilliseconds));
    }
  }

  const retryAfterHeader = headers.get("retry-after");
  if (!retryAfterHeader) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, Math.ceil(retryAfterSeconds * 1000));
  }

  const retryAfterDateMilliseconds = Date.parse(retryAfterHeader) - Date.now();
  if (Number.isFinite(retryAfterDateMilliseconds)) {
    return Math.max(0, Math.ceil(retryAfterDateMilliseconds));
  }

  return undefined;
}

export async function createOpenAiHttpRequestError(
  response: OpenAiHttpErrorResponse,
  operation: OpenAiHttpRequestOperation,
): Promise<Error> {
  const responseBodyText = (await response.text()).trim();
  const requestId = getOpenAiRequestId(response.headers);

  const errorMessageParts = [`OpenAI ${operation} request failed: ${response.status}`];
  const humanReadableErrorMessage = extractHumanReadableOpenAiErrorMessage(responseBodyText);
  if (humanReadableErrorMessage) {
    errorMessageParts.push(humanReadableErrorMessage);
  }
  if (requestId) {
    errorMessageParts.push(`request_id=${requestId}`);
  }

  return new Error(errorMessageParts.join(" | "));
}

export function extractHumanReadableOpenAiErrorMessage(responseBodyText: string): string | undefined {
  const trimmedResponseBodyText = responseBodyText.trim();
  if (trimmedResponseBodyText.length === 0) {
    return undefined;
  }

  return sanitizeOpenAiErrorMessage(
    extractStructuredOpenAiErrorMessage(trimmedResponseBodyText)?.trim() ?? trimmedResponseBodyText,
  );
}

export function extractStructuredOpenAiErrorMessage(responseBodyText: string): string | undefined {
  const parsedErrorResponseBody = OpenAiErrorResponseBodySchema.safeParse(parseJsonResponseBody(responseBodyText));
  if (parsedErrorResponseBody.success) {
    return parsedErrorResponseBody.data.error.message;
  }

  return undefined;
}

function parseJsonResponseBody(responseBodyText: string): unknown {
  try {
    return JSON.parse(responseBodyText) as unknown;
  } catch {
    return undefined;
  }
}

export function sanitizeOpenAiErrorMessage(errorMessage: string): string {
  return redactSensitiveText(errorMessage, { maxLength: MAX_HUMAN_READABLE_ERROR_MESSAGE_LENGTH });
}

function readOpenAiTransportErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }

  if (typeof error === "object" && error !== null) {
    const errorName = (error as { readonly name?: unknown }).name;
    if (typeof errorName === "string" && errorName.length > 0) {
      return errorName;
    }
  }

  return typeof error;
}

function readOpenAiTransportErrorMessageLength(error: unknown): number | undefined {
  if (error instanceof Error) {
    return error.message.length;
  }

  if (typeof error === "string") {
    return error.length;
  }

  if (typeof error === "object" && error !== null) {
    const errorMessage = (error as { readonly message?: unknown }).message;
    if (typeof errorMessage === "string") {
      return errorMessage.length;
    }
  }

  return undefined;
}
