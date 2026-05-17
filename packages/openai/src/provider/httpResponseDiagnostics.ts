import { redactSensitiveText } from "@buli/contracts";
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
