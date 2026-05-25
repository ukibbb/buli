import { ContextWindowOverflowError, redactSensitiveText, type BuliDiagnosticLogFields } from "@buli/contracts";
import { z } from "zod";

const OpenAiErrorResponseBodySchema = z
  .object({
    error: z
      .object({
        message: z.string().min(1),
        code: z.string().min(1).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type OpenAiHttpRequestOperation = "models" | "stream";

const MAX_HUMAN_READABLE_ERROR_MESSAGE_LENGTH = 500;
const SAFE_OPENAI_TRANSPORT_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const OPENAI_CONTEXT_WINDOW_OVERFLOW_ERROR_CODES = new Set([
  "context_length_exceeded",
  "model_context_window_exceeded",
]);
const OPENAI_CONTEXT_WINDOW_OVERFLOW_MESSAGE_PATTERNS = [
  /exceeds the context window/i,
  /context[_ ]length[_ ]exceeded/i,
  /input length.*exceeds.*context length/i,
  /prompt too long/i,
];

export type OpenAiHttpResponseHeaders = {
  get(name: string): string | null;
};

export type OpenAiHttpErrorResponse = {
  status: number;
  headers: OpenAiHttpResponseHeaders;
  text(): Promise<string>;
};

export type OpenAiRateLimitHeaderSnapshot = Readonly<{
  requestLimit?: number | undefined;
  requestsRemaining?: number | undefined;
  requestsResetAfterMilliseconds?: number | undefined;
  tokenLimit?: number | undefined;
  tokensRemaining?: number | undefined;
  tokensResetAfterMilliseconds?: number | undefined;
}>;

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
  const transportErrorCode = readOpenAiTransportErrorCode(error);
  return {
    transportErrorName: readOpenAiTransportErrorName(error),
    ...(transportErrorMessageLength !== undefined ? { transportErrorMessageLength } : {}),
    ...(transportErrorCode !== undefined ? { transportErrorCode } : {}),
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

export function readOpenAiRateLimitHeaders(headers: OpenAiHttpResponseHeaders): OpenAiRateLimitHeaderSnapshot | undefined {
  const requestLimit = readOpenAiNonNegativeNumberHeader(headers, "x-ratelimit-limit-requests");
  const requestsRemaining = readOpenAiNonNegativeNumberHeader(headers, "x-ratelimit-remaining-requests");
  const requestsResetAfterMilliseconds = readOpenAiRateLimitResetAfterMilliseconds(headers.get("x-ratelimit-reset-requests"));
  const tokenLimit = readOpenAiNonNegativeNumberHeader(headers, "x-ratelimit-limit-tokens");
  const tokensRemaining = readOpenAiNonNegativeNumberHeader(headers, "x-ratelimit-remaining-tokens");
  const tokensResetAfterMilliseconds = readOpenAiRateLimitResetAfterMilliseconds(headers.get("x-ratelimit-reset-tokens"));
  const rateLimitHeaderSnapshot: OpenAiRateLimitHeaderSnapshot = {
    ...(requestLimit !== undefined ? { requestLimit } : {}),
    ...(requestsRemaining !== undefined ? { requestsRemaining } : {}),
    ...(requestsResetAfterMilliseconds !== undefined ? { requestsResetAfterMilliseconds } : {}),
    ...(tokenLimit !== undefined ? { tokenLimit } : {}),
    ...(tokensRemaining !== undefined ? { tokensRemaining } : {}),
    ...(tokensResetAfterMilliseconds !== undefined ? { tokensResetAfterMilliseconds } : {}),
  };

  return Object.keys(rateLimitHeaderSnapshot).length > 0 ? rateLimitHeaderSnapshot : undefined;
}

export function summarizeOpenAiRateLimitHeadersForDiagnostics(
  headers: OpenAiHttpResponseHeaders,
): BuliDiagnosticLogFields {
  const rateLimitHeaderSnapshot = readOpenAiRateLimitHeaders(headers);
  if (!rateLimitHeaderSnapshot) {
    return {};
  }

  return {
    ...(rateLimitHeaderSnapshot.requestLimit !== undefined
      ? { rateLimitRequestLimit: rateLimitHeaderSnapshot.requestLimit }
      : {}),
    ...(rateLimitHeaderSnapshot.requestsRemaining !== undefined
      ? { rateLimitRequestsRemaining: rateLimitHeaderSnapshot.requestsRemaining }
      : {}),
    ...(rateLimitHeaderSnapshot.requestsResetAfterMilliseconds !== undefined
      ? { rateLimitRequestsResetAfterMilliseconds: rateLimitHeaderSnapshot.requestsResetAfterMilliseconds }
      : {}),
    ...(rateLimitHeaderSnapshot.tokenLimit !== undefined
      ? { rateLimitTokenLimit: rateLimitHeaderSnapshot.tokenLimit }
      : {}),
    ...(rateLimitHeaderSnapshot.tokensRemaining !== undefined
      ? { rateLimitTokensRemaining: rateLimitHeaderSnapshot.tokensRemaining }
      : {}),
    ...(rateLimitHeaderSnapshot.tokensResetAfterMilliseconds !== undefined
      ? { rateLimitTokensResetAfterMilliseconds: rateLimitHeaderSnapshot.tokensResetAfterMilliseconds }
      : {}),
  };
}

export async function createOpenAiHttpRequestError(
  response: OpenAiHttpErrorResponse,
  operation: OpenAiHttpRequestOperation,
): Promise<Error> {
  const responseBodyText = (await response.text()).trim();
  const requestId = getOpenAiRequestId(response.headers);
  const structuredError = parseOpenAiErrorResponseBody(responseBodyText);

  const errorMessageParts = [`OpenAI ${operation} request failed: ${response.status}`];
  const humanReadableErrorMessage = extractHumanReadableOpenAiErrorMessage(responseBodyText);
  if (humanReadableErrorMessage) {
    errorMessageParts.push(humanReadableErrorMessage);
  }
  if (requestId) {
    errorMessageParts.push(`request_id=${requestId}`);
  }

  const errorMessage = errorMessageParts.join(" | ");
  if (
    isOpenAiContextWindowOverflowFailure({
      status: response.status,
      errorCode: structuredError?.error.code,
      errorMessage: humanReadableErrorMessage ?? responseBodyText,
    })
  ) {
    return new ContextWindowOverflowError(errorMessage);
  }

  return new Error(errorMessage);
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
  return parseOpenAiErrorResponseBody(responseBodyText)?.error.message;
}

export function isOpenAiContextWindowOverflowFailure(input: {
  status?: number | undefined;
  errorCode?: string | undefined;
  errorMessage: string;
}): boolean {
  if (input.status === 413) {
    return true;
  }

  if (input.errorCode && OPENAI_CONTEXT_WINDOW_OVERFLOW_ERROR_CODES.has(input.errorCode)) {
    return true;
  }

  return OPENAI_CONTEXT_WINDOW_OVERFLOW_MESSAGE_PATTERNS.some((pattern) => pattern.test(input.errorMessage));
}

function parseJsonResponseBody(responseBodyText: string): unknown {
  try {
    return JSON.parse(responseBodyText) as unknown;
  } catch {
    return undefined;
  }
}

function readOpenAiNonNegativeNumberHeader(
  headers: OpenAiHttpResponseHeaders,
  headerName: string,
): number | undefined {
  const headerValue = headers.get(headerName)?.trim();
  if (!headerValue) {
    return undefined;
  }

  const numericHeaderValue = Number(headerValue);
  if (!Number.isFinite(numericHeaderValue)) {
    return undefined;
  }

  return Math.max(0, Math.floor(numericHeaderValue));
}

function readOpenAiRateLimitResetAfterMilliseconds(headerValue: string | null): number | undefined {
  const trimmedHeaderValue = headerValue?.trim();
  if (!trimmedHeaderValue) {
    return undefined;
  }

  const numericResetAfterSeconds = Number(trimmedHeaderValue);
  if (Number.isFinite(numericResetAfterSeconds)) {
    return Math.max(0, Math.ceil(numericResetAfterSeconds * 1000));
  }

  const durationResetAfterMilliseconds = parseOpenAiRateLimitDurationMilliseconds(trimmedHeaderValue);
  if (durationResetAfterMilliseconds !== undefined) {
    return durationResetAfterMilliseconds;
  }

  return undefined;
}

function parseOpenAiRateLimitDurationMilliseconds(headerValue: string): number | undefined {
  const durationComponentPattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/gi;
  let totalMilliseconds = 0;
  let consumedHeaderText = headerValue;
  let didMatchDurationComponent = false;

  for (const durationComponentMatch of headerValue.matchAll(durationComponentPattern)) {
    const numericDurationText = durationComponentMatch[1];
    const durationUnit = durationComponentMatch[2]?.toLowerCase();
    if (!numericDurationText || !durationUnit) {
      continue;
    }

    const numericDuration = Number(numericDurationText);
    if (!Number.isFinite(numericDuration)) {
      return undefined;
    }

    didMatchDurationComponent = true;
    consumedHeaderText = consumedHeaderText.replace(durationComponentMatch[0], "");
    switch (durationUnit) {
      case "ms":
        totalMilliseconds += numericDuration;
        break;
      case "s":
        totalMilliseconds += numericDuration * 1000;
        break;
      case "m":
        totalMilliseconds += numericDuration * 60_000;
        break;
      case "h":
        totalMilliseconds += numericDuration * 3_600_000;
        break;
      default:
        return undefined;
    }
  }

  if (!didMatchDurationComponent || consumedHeaderText.trim().length > 0) {
    return undefined;
  }

  return Math.max(0, Math.ceil(totalMilliseconds));
}

function parseOpenAiErrorResponseBody(responseBodyText: string): z.infer<typeof OpenAiErrorResponseBodySchema> | undefined {
  const parsedErrorResponseBody = OpenAiErrorResponseBodySchema.safeParse(parseJsonResponseBody(responseBodyText));
  return parsedErrorResponseBody.success ? parsedErrorResponseBody.data : undefined;
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

function readOpenAiTransportErrorCode(error: unknown): string | undefined {
  return sanitizeOpenAiTransportErrorCode(readErrorLikeCode(error)) ??
    sanitizeOpenAiTransportErrorCode(readErrorLikeCode(readErrorLikeCause(error)));
}

function readErrorLikeCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const errorCode = (error as { readonly code?: unknown }).code;
  return typeof errorCode === "string" ? errorCode : undefined;
}

function readErrorLikeCause(error: unknown): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  return (error as { readonly cause?: unknown }).cause;
}

function sanitizeOpenAiTransportErrorCode(errorCode: string | undefined): string | undefined {
  const trimmedErrorCode = errorCode?.trim();
  if (!trimmedErrorCode || !SAFE_OPENAI_TRANSPORT_ERROR_CODE_PATTERN.test(trimmedErrorCode)) {
    return undefined;
  }

  return trimmedErrorCode;
}
