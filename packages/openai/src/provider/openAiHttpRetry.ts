import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ProviderRateLimitPendingEvent,
} from "@buli/contracts";
import { writeOpenAiDebugLog } from "./debugLog.ts";
import { logOpenAiDiagnosticEvent } from "./diagnostics.ts";
import {
  getOpenAiRequestId,
  isRetryableOpenAiHttpResponseStatus,
  isRetryableOpenAiTransportError,
  readOpenAiRetryAfterMilliseconds,
  summarizeOpenAiTransportErrorForDiagnostics,
} from "./httpResponseDiagnostics.ts";

const DEFAULT_OPENAI_HTTP_RETRY_COUNT = 2;
const DEFAULT_OPENAI_HTTP_RETRY_DELAY_MILLISECONDS = 500;

export type OpenAiHttpRetryResult = Readonly<{
  response: Response;
  requestAttemptIndex: number;
}>;

export type OpenAiHttpRetryInput = Readonly<{
  fetchResponse: () => Promise<Response>;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  diagnosticEventPrefix: string;
  diagnosticFields?: BuliDiagnosticLogFields | undefined;
  requestAttemptDiagnosticFieldName: string;
  maximumRetryCountDiagnosticFieldName: string;
  debugLogTitlePrefix: string;
  abortSignal?: AbortSignal | undefined;
  operationStartedAtMs?: number | undefined;
  shouldYieldRetryPendingEvents?: boolean | undefined;
}>;

export async function* requestOpenAiHttpResponseWithRetries(
  input: OpenAiHttpRetryInput,
): AsyncGenerator<ProviderRateLimitPendingEvent, OpenAiHttpRetryResult> {
  const operationStartedAtMs = input.operationStartedAtMs ?? Date.now();
  let requestAttemptIndex = 0;
  let transportRetryAttemptCount = 0;

  while (true) {
    requestAttemptIndex += 1;
    const requestAttemptStartedAtMs = Date.now();
    let currentResponse: Response;
    try {
      currentResponse = await input.fetchResponse();
    } catch (transportError) {
      const transportErrorDiagnosticFields = summarizeOpenAiTransportErrorForDiagnostics(transportError);
      const canRetryTransportError =
        isRetryableOpenAiTransportError(transportError) && requestAttemptIndex <= DEFAULT_OPENAI_HTTP_RETRY_COUNT;
      if (!canRetryTransportError) {
        if (isRetryableOpenAiTransportError(transportError)) {
          logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.transport_retry_exhausted`, {
            ...input.diagnosticFields,
            ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
            ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input),
            ...transportErrorDiagnosticFields,
          });
        }
        logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.request_transport_failed`, {
          ...input.diagnosticFields,
          ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
          ...transportErrorDiagnosticFields,
        });
        throw transportError;
      }

      transportRetryAttemptCount += 1;
      const retryDelayMilliseconds = DEFAULT_OPENAI_HTTP_RETRY_DELAY_MILLISECONDS;
      const retryScheduledDiagnosticFields = {
        ...input.diagnosticFields,
        ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
        ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input),
        retryDelayMilliseconds,
        remainingRetryCount: DEFAULT_OPENAI_HTTP_RETRY_COUNT - requestAttemptIndex,
        ...transportErrorDiagnosticFields,
      };
      logOpenAiDiagnosticEvent(
        input.diagnosticLogger,
        `${input.diagnosticEventPrefix}.transport_retry_scheduled`,
        retryScheduledDiagnosticFields,
      );
      await writeOpenAiDebugLog(`${input.debugLogTitlePrefix} transport retry scheduled`, retryScheduledDiagnosticFields);
      const retryPendingEvent = createOpenAiTransportRetryPendingEvent({ retryDelayMilliseconds });
      if (input.shouldYieldRetryPendingEvents) {
        yield retryPendingEvent;
      }
      await waitForOpenAiHttpRetryDelay({
        retryDelayMilliseconds,
        abortSignal: input.abortSignal,
      });
      continue;
    }

    logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.response_received`, {
      ...input.diagnosticFields,
      ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
      status: currentResponse.status,
      requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
      contentType: currentResponse.headers.get("content-type") ?? null,
      durationMs: Date.now() - requestAttemptStartedAtMs,
    });

    if (currentResponse.ok) {
      if (transportRetryAttemptCount > 0) {
        logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.transport_retry_succeeded`, {
          ...input.diagnosticFields,
          ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
          transportRetryAttemptCount,
          status: currentResponse.status,
          requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
          durationMs: Date.now() - operationStartedAtMs,
        });
      }
      if (requestAttemptIndex > 1) {
        logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.retry_succeeded`, {
          ...input.diagnosticFields,
          ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
          retryAttemptCount: requestAttemptIndex - 1,
          status: currentResponse.status,
          requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
          durationMs: Date.now() - operationStartedAtMs,
        });
      }

      return { response: currentResponse, requestAttemptIndex };
    }

    const canRetryResponse =
      isRetryableOpenAiHttpResponseStatus(currentResponse.status) && requestAttemptIndex <= DEFAULT_OPENAI_HTTP_RETRY_COUNT;
    if (!canRetryResponse) {
      if (isRetryableOpenAiHttpResponseStatus(currentResponse.status)) {
        logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.retry_exhausted`, {
          ...input.diagnosticFields,
          ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
          ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input),
          status: currentResponse.status,
          requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
        });
      }

      return { response: currentResponse, requestAttemptIndex };
    }

    const retryDelayMilliseconds =
      readOpenAiRetryAfterMilliseconds(currentResponse.headers) ?? DEFAULT_OPENAI_HTTP_RETRY_DELAY_MILLISECONDS;
    const retryScheduledDiagnosticFields = {
      ...input.diagnosticFields,
      ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
      ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input),
      status: currentResponse.status,
      requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
      retryDelayMilliseconds,
      remainingRetryCount: DEFAULT_OPENAI_HTTP_RETRY_COUNT - requestAttemptIndex,
    };
    logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.retry_scheduled`, retryScheduledDiagnosticFields);
    await writeOpenAiDebugLog(`${input.debugLogTitlePrefix} retry scheduled`, retryScheduledDiagnosticFields);
    const retryPendingEvent = createOpenAiHttpRetryPendingEvent({
      status: currentResponse.status,
      retryDelayMilliseconds,
    });
    await cancelRetryableOpenAiHttpResponseBody(currentResponse);
    if (input.shouldYieldRetryPendingEvents) {
      yield retryPendingEvent;
    }
    await waitForOpenAiHttpRetryDelay({
      retryDelayMilliseconds,
      abortSignal: input.abortSignal,
    });
  }
}

async function cancelRetryableOpenAiHttpResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Retrying should not be blocked by cleanup failure on an already-closed body.
  }
}

function createOpenAiHttpRetryAttemptDiagnosticFields(
  input: Pick<OpenAiHttpRetryInput, "requestAttemptDiagnosticFieldName">,
  requestAttemptIndex: number,
): BuliDiagnosticLogFields {
  return {
    [input.requestAttemptDiagnosticFieldName]: requestAttemptIndex,
  };
}

function createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(
  input: Pick<OpenAiHttpRetryInput, "maximumRetryCountDiagnosticFieldName">,
): BuliDiagnosticLogFields {
  return {
    [input.maximumRetryCountDiagnosticFieldName]: DEFAULT_OPENAI_HTTP_RETRY_COUNT,
  };
}

function createOpenAiHttpRetryPendingEvent(input: {
  status: number;
  retryDelayMilliseconds: number;
}): ProviderRateLimitPendingEvent {
  const retryAfterSeconds = convertRetryDelayMillisecondsToProviderRetryAfterSeconds(input.retryDelayMilliseconds);
  const retryAfterDescription = `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;
  return {
    type: "rate_limit_pending",
    retryAfterSeconds,
    limitExplanation: input.status === 429
      ? `OpenAI request was rate limited. Retrying after ${retryAfterDescription}.`
      : `OpenAI request failed with transient HTTP ${input.status}. Retrying after ${retryAfterDescription}.`,
  };
}

function createOpenAiTransportRetryPendingEvent(input: {
  retryDelayMilliseconds: number;
}): ProviderRateLimitPendingEvent {
  const retryAfterSeconds = convertRetryDelayMillisecondsToProviderRetryAfterSeconds(input.retryDelayMilliseconds);
  const retryAfterDescription = `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;
  return {
    type: "rate_limit_pending",
    retryAfterSeconds,
    limitExplanation: `OpenAI request failed before receiving a response. Retrying after ${retryAfterDescription}.`,
  };
}

function convertRetryDelayMillisecondsToProviderRetryAfterSeconds(retryDelayMilliseconds: number): number {
  return Math.ceil(Math.max(0, retryDelayMilliseconds) / 1000);
}

function waitForOpenAiHttpRetryDelay(input: {
  retryDelayMilliseconds: number;
  abortSignal: AbortSignal | undefined;
}): Promise<void> {
  if (input.abortSignal?.aborted) {
    return Promise.reject(new Error("OpenAI provider turn interrupted while waiting to retry OpenAI request"));
  }

  if (input.retryDelayMilliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolveRetryDelay, rejectRetryDelay) => {
    const abortListener = (): void => {
      clearTimeout(retryDelayTimeout);
      input.abortSignal?.removeEventListener("abort", abortListener);
      rejectRetryDelay(new Error("OpenAI provider turn interrupted while waiting to retry OpenAI request"));
    };
    const retryDelayTimeout = setTimeout(() => {
      input.abortSignal?.removeEventListener("abort", abortListener);
      resolveRetryDelay();
    }, input.retryDelayMilliseconds);
    input.abortSignal?.addEventListener("abort", abortListener, { once: true });
    if (input.abortSignal?.aborted) {
      abortListener();
    }
  });
}
