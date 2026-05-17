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

export function getOpenAiRequestId(headers: OpenAiHttpResponseHeaders): string | undefined {
  return headers.get("x-request-id") ?? headers.get("request-id") ?? headers.get("openai-request-id") ?? undefined;
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

  return redactAndLimitOpenAiErrorMessage(
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

function redactAndLimitOpenAiErrorMessage(errorMessage: string): string {
  const redactedErrorMessage = errorMessage
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]")
    .replace(/(access[_-]?token[=:]\s*)[^\s&]+/gi, "$1[REDACTED]")
    .replace(/(refresh[_-]?token[=:]\s*)[^\s&]+/gi, "$1[REDACTED]");

  if (redactedErrorMessage.length <= MAX_HUMAN_READABLE_ERROR_MESSAGE_LENGTH) {
    return redactedErrorMessage;
  }

  const omittedCharacterCount = redactedErrorMessage.length - MAX_HUMAN_READABLE_ERROR_MESSAGE_LENGTH;
  return `${redactedErrorMessage.slice(0, MAX_HUMAN_READABLE_ERROR_MESSAGE_LENGTH)}... (${omittedCharacterCount} chars omitted)`;
}
