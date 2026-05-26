import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ProviderRateLimitPendingEvent,
  ProviderRetryPendingReason,
} from "@buli/contracts";
import { writeOpenAiDebugLog } from "./debugLog.ts";
import { logOpenAiDiagnosticEvent } from "./diagnostics.ts";
import {
  getOpenAiRequestId,
  isRetryableOpenAiHttpResponseStatus,
  isRetryableOpenAiTransportError,
  readOpenAiRateLimitHeaders,
  readOpenAiRetryAfterMilliseconds,
  type OpenAiHttpResponseHeaders,
  summarizeOpenAiRateLimitHeadersForDiagnostics,
  summarizeOpenAiTransportErrorForDiagnostics,
} from "./httpResponseDiagnostics.ts";

const DEFAULT_OPENAI_HTTP_RETRY_COUNT = 2;
const DEFAULT_OPENAI_HTTP_RETRY_DELAY_MILLISECONDS = 500;

export type OpenAiHttpRetryPolicy = Readonly<{
  maximumRetryCount?: number | undefined;
  fallbackRetryDelayMilliseconds?: number | undefined;
  maximumRetryElapsedMilliseconds?: number | undefined;
}>;

type NormalizedOpenAiHttpRetryPolicy = Readonly<{
  maximumRetryCount: number;
  fallbackRetryDelayMilliseconds: number;
  maximumRetryElapsedMilliseconds: number | undefined;
}>;

type OpenAiHttpRetryExhaustionReason = "maximum_retry_count_reached" | "maximum_retry_elapsed_time_reached";

type OpenAiHttpRetryDecision =
  | Readonly<{ canRetry: true }>
  | Readonly<{ canRetry: false; retryExhaustionReason: OpenAiHttpRetryExhaustionReason }>;

export type OpenAiHttpRetryResult = Readonly<{
  response: Response;
  requestAttemptIndex: number;
}>;

export type OpenAiHttpResponseHeaderObservation = Readonly<{
  headers: OpenAiHttpResponseHeaders;
  status: number;
  wasSuccessfulHttpResponse: boolean;
  requestAttemptIndex: number;
  retryAfterMilliseconds?: number | undefined;
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
  retryPolicy?: OpenAiHttpRetryPolicy | undefined;
  shouldYieldRetryPendingEvents?: boolean | undefined;
  onResponseHeadersReceived?: ((responseHeaderObservation: OpenAiHttpResponseHeaderObservation) => void) | undefined;
}>;

export async function* requestOpenAiHttpResponseWithRetries(
  input: OpenAiHttpRetryInput,
): AsyncGenerator<ProviderRateLimitPendingEvent, OpenAiHttpRetryResult> {
  const operationStartedAtMs = input.operationStartedAtMs ?? Date.now();
  const retryPolicy = normalizeOpenAiHttpRetryPolicy(input.retryPolicy);
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
      const retryDelayMilliseconds = retryPolicy.fallbackRetryDelayMilliseconds;
      const transportRetryDecision = decideOpenAiHttpRetryAttempt({
        operationStartedAtMs,
        requestAttemptIndex,
        retryDelayMilliseconds,
        retryPolicy,
      });
      const canRetryTransportError = isRetryableOpenAiTransportError(transportError) && transportRetryDecision.canRetry;
      if (!canRetryTransportError) {
        if (isRetryableOpenAiTransportError(transportError)) {
          logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.transport_retry_exhausted`, {
            ...input.diagnosticFields,
            ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
            ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input, retryPolicy),
            ...createOpenAiHttpRetryElapsedBudgetDiagnosticFields(retryPolicy),
            ...(transportRetryDecision.canRetry ? {} : { retryExhaustionReason: transportRetryDecision.retryExhaustionReason }),
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
      const retryWaitStartedAtMs = Date.now();
      const retryScheduledDiagnosticFields = {
        ...input.diagnosticFields,
        ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
        ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input, retryPolicy),
        ...createOpenAiHttpRetryElapsedBudgetDiagnosticFields(retryPolicy),
        retryDelayMilliseconds,
        retryWaitStartedAtMs,
        remainingRetryCount: retryPolicy.maximumRetryCount - requestAttemptIndex,
        ...transportErrorDiagnosticFields,
      };
      logOpenAiDiagnosticEvent(
        input.diagnosticLogger,
        `${input.diagnosticEventPrefix}.transport_retry_scheduled`,
        retryScheduledDiagnosticFields,
      );
      const retryDelayPromise = waitForOpenAiHttpRetryDelay({
        retryDelayMilliseconds,
        abortSignal: input.abortSignal,
      });
      keepRetryDelayRejectionHandledWhileYielding(retryDelayPromise);
      await writeOpenAiDebugLog(`${input.debugLogTitlePrefix} transport retry scheduled`, retryScheduledDiagnosticFields);
      const retryPendingEvent = createOpenAiTransportRetryPendingEvent({
        retryDelayMilliseconds,
        retryWaitStartedAtMs,
      });
      if (input.shouldYieldRetryPendingEvents) {
        yield retryPendingEvent;
      }
      await retryDelayPromise;
      logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.transport_retry_wait_finished`, {
        ...input.diagnosticFields,
        ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
        retryDelayMilliseconds,
        durationMs: Date.now() - retryWaitStartedAtMs,
      });
      continue;
    }

    const retryAfterMilliseconds = readOpenAiRetryAfterMilliseconds(currentResponse.headers);
    logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.response_received`, {
      ...input.diagnosticFields,
      ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
      status: currentResponse.status,
      requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
      contentType: currentResponse.headers.get("content-type") ?? null,
      durationMs: Date.now() - requestAttemptStartedAtMs,
      ...(retryAfterMilliseconds !== undefined ? { retryAfterMilliseconds } : {}),
      ...summarizeOpenAiRateLimitHeadersForDiagnostics(currentResponse.headers),
    });
    input.onResponseHeadersReceived?.({
      headers: currentResponse.headers,
      status: currentResponse.status,
      wasSuccessfulHttpResponse: currentResponse.ok,
      requestAttemptIndex,
      retryAfterMilliseconds,
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
          ...summarizeOpenAiRateLimitHeadersForDiagnostics(currentResponse.headers),
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
          ...summarizeOpenAiRateLimitHeadersForDiagnostics(currentResponse.headers),
        });
      }

      return { response: currentResponse, requestAttemptIndex };
    }

    const retryDelayMilliseconds = retryAfterMilliseconds ??
      readOpenAiExhaustedRateLimitResetMilliseconds(currentResponse.headers) ??
      retryPolicy.fallbackRetryDelayMilliseconds;
    const responseRetryDecision = decideOpenAiHttpRetryAttempt({
      operationStartedAtMs,
      requestAttemptIndex,
      retryDelayMilliseconds,
      retryPolicy,
    });
    const canRetryResponse = isRetryableOpenAiHttpResponseStatus(currentResponse.status) && responseRetryDecision.canRetry;
    if (!canRetryResponse) {
      if (isRetryableOpenAiHttpResponseStatus(currentResponse.status)) {
        logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.retry_exhausted`, {
          ...input.diagnosticFields,
          ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
          ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input, retryPolicy),
          ...createOpenAiHttpRetryElapsedBudgetDiagnosticFields(retryPolicy),
          ...(responseRetryDecision.canRetry ? {} : { retryExhaustionReason: responseRetryDecision.retryExhaustionReason }),
          status: currentResponse.status,
          requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
          ...summarizeOpenAiRateLimitHeadersForDiagnostics(currentResponse.headers),
        });
      }

      return { response: currentResponse, requestAttemptIndex };
    }

    const retryWaitStartedAtMs = Date.now();
    const retryScheduledDiagnosticFields = {
      ...input.diagnosticFields,
      ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
      ...createOpenAiHttpRetryMaximumRetryCountDiagnosticFields(input, retryPolicy),
      ...createOpenAiHttpRetryElapsedBudgetDiagnosticFields(retryPolicy),
      status: currentResponse.status,
      requestId: getOpenAiRequestId(currentResponse.headers) ?? null,
      retryDelayMilliseconds,
      retryWaitStartedAtMs,
      remainingRetryCount: retryPolicy.maximumRetryCount - requestAttemptIndex,
      ...summarizeOpenAiRateLimitHeadersForDiagnostics(currentResponse.headers),
    };
    logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.retry_scheduled`, retryScheduledDiagnosticFields);
    const retryDelayPromise = waitForOpenAiHttpRetryDelay({
      retryDelayMilliseconds,
      abortSignal: input.abortSignal,
    });
    keepRetryDelayRejectionHandledWhileYielding(retryDelayPromise);
    await writeOpenAiDebugLog(`${input.debugLogTitlePrefix} retry scheduled`, retryScheduledDiagnosticFields);
    const retryPendingEvent = createOpenAiHttpRetryPendingEvent({
      status: currentResponse.status,
      retryDelayMilliseconds,
      retryWaitStartedAtMs,
    });
    await cancelRetryableOpenAiHttpResponseBody(currentResponse);
    if (input.shouldYieldRetryPendingEvents) {
      yield retryPendingEvent;
    }
    await retryDelayPromise;
    logOpenAiDiagnosticEvent(input.diagnosticLogger, `${input.diagnosticEventPrefix}.retry_wait_finished`, {
      ...input.diagnosticFields,
      ...createOpenAiHttpRetryAttemptDiagnosticFields(input, requestAttemptIndex),
      status: currentResponse.status,
      retryDelayMilliseconds,
      durationMs: Date.now() - retryWaitStartedAtMs,
    });
  }
}

function keepRetryDelayRejectionHandledWhileYielding(retryDelayPromise: Promise<void>): void {
  // Async generators pause at yield. Keep abort rejections handled until the generator resumes and awaits the same promise.
  void retryDelayPromise.catch(() => {});
}

async function cancelRetryableOpenAiHttpResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Retrying should not be blocked by cleanup failure on an already-closed body.
  }
}

function normalizeOpenAiHttpRetryPolicy(retryPolicy: OpenAiHttpRetryPolicy | undefined): NormalizedOpenAiHttpRetryPolicy {
  return {
    maximumRetryCount: normalizeNonNegativeInteger(
      retryPolicy?.maximumRetryCount,
      DEFAULT_OPENAI_HTTP_RETRY_COUNT,
    ),
    fallbackRetryDelayMilliseconds: normalizeNonNegativeInteger(
      retryPolicy?.fallbackRetryDelayMilliseconds,
      DEFAULT_OPENAI_HTTP_RETRY_DELAY_MILLISECONDS,
    ),
    maximumRetryElapsedMilliseconds: normalizeOptionalPositiveInteger(retryPolicy?.maximumRetryElapsedMilliseconds),
  };
}

function normalizeNonNegativeInteger(value: number | undefined, defaultValue: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeOptionalPositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.floor(value);
}

function decideOpenAiHttpRetryAttempt(input: {
  operationStartedAtMs: number;
  requestAttemptIndex: number;
  retryDelayMilliseconds: number;
  retryPolicy: NormalizedOpenAiHttpRetryPolicy;
}): OpenAiHttpRetryDecision {
  if (input.requestAttemptIndex > input.retryPolicy.maximumRetryCount) {
    return { canRetry: false, retryExhaustionReason: "maximum_retry_count_reached" };
  }

  const maximumRetryElapsedMilliseconds = input.retryPolicy.maximumRetryElapsedMilliseconds;
  if (maximumRetryElapsedMilliseconds === undefined) {
    return { canRetry: true };
  }

  const retryElapsedMilliseconds = Math.max(0, Date.now() - input.operationStartedAtMs);
  if (retryElapsedMilliseconds >= maximumRetryElapsedMilliseconds) {
    return { canRetry: false, retryExhaustionReason: "maximum_retry_elapsed_time_reached" };
  }
  if (retryElapsedMilliseconds + input.retryDelayMilliseconds > maximumRetryElapsedMilliseconds) {
    return { canRetry: false, retryExhaustionReason: "maximum_retry_elapsed_time_reached" };
  }

  return { canRetry: true };
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
  retryPolicy: Pick<NormalizedOpenAiHttpRetryPolicy, "maximumRetryCount">,
): BuliDiagnosticLogFields {
  return {
    [input.maximumRetryCountDiagnosticFieldName]: retryPolicy.maximumRetryCount,
  };
}

function createOpenAiHttpRetryElapsedBudgetDiagnosticFields(
  retryPolicy: Pick<NormalizedOpenAiHttpRetryPolicy, "maximumRetryElapsedMilliseconds">,
): BuliDiagnosticLogFields {
  if (retryPolicy.maximumRetryElapsedMilliseconds === undefined) {
    return {};
  }

  return { maximumRetryElapsedMilliseconds: retryPolicy.maximumRetryElapsedMilliseconds };
}

function readOpenAiExhaustedRateLimitResetMilliseconds(headers: OpenAiHttpResponseHeaders): number | undefined {
  const rateLimitHeaders = readOpenAiRateLimitHeaders(headers);
  if (!rateLimitHeaders) {
    return undefined;
  }

  const exhaustedRateLimitResetDurations: number[] = [];
  if (rateLimitHeaders.requestsRemaining === 0 && rateLimitHeaders.requestsResetAfterMilliseconds !== undefined) {
    exhaustedRateLimitResetDurations.push(rateLimitHeaders.requestsResetAfterMilliseconds);
  }
  if (rateLimitHeaders.tokensRemaining === 0 && rateLimitHeaders.tokensResetAfterMilliseconds !== undefined) {
    exhaustedRateLimitResetDurations.push(rateLimitHeaders.tokensResetAfterMilliseconds);
  }

  return exhaustedRateLimitResetDurations.length === 0 ? undefined : Math.max(...exhaustedRateLimitResetDurations);
}

function createOpenAiHttpRetryPendingEvent(input: {
  status: number;
  retryDelayMilliseconds: number;
  retryWaitStartedAtMs: number;
}): ProviderRateLimitPendingEvent {
  const retryAfterSeconds = convertRetryDelayMillisecondsToProviderRetryAfterSeconds(input.retryDelayMilliseconds);
  const retryAfterDescription = `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;
  const retryReason: ProviderRetryPendingReason = input.status === 429 ? "rate_limit" : "transient_http_response";
  return {
    type: "rate_limit_pending",
    retryAfterSeconds,
    retryWaitStartedAtMs: input.retryWaitStartedAtMs,
    retryReason,
    limitExplanation: input.status === 429
      ? `OpenAI request was rate limited. Retrying after ${retryAfterDescription}.`
      : `OpenAI request failed with transient HTTP ${input.status}. Retrying after ${retryAfterDescription}.`,
  };
}

function createOpenAiTransportRetryPendingEvent(input: {
  retryDelayMilliseconds: number;
  retryWaitStartedAtMs: number;
}): ProviderRateLimitPendingEvent {
  const retryAfterSeconds = convertRetryDelayMillisecondsToProviderRetryAfterSeconds(input.retryDelayMilliseconds);
  const retryAfterDescription = `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;
  return {
    type: "rate_limit_pending",
    retryAfterSeconds,
    retryWaitStartedAtMs: input.retryWaitStartedAtMs,
    retryReason: "transport_error",
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
