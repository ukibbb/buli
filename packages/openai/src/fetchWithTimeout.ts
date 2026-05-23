export const DEFAULT_OPENAI_FETCH_TIMEOUT_MILLISECONDS = 10_000;

export type FetchWithTimeoutInput = Readonly<{
  resource: Parameters<typeof fetch>[0];
  requestInit?: Parameters<typeof fetch>[1] | undefined;
  fetchImpl?: typeof fetch | undefined;
  abortSignal?: AbortSignal | undefined;
  timeoutMilliseconds?: number | undefined;
  timeoutErrorMessage: string;
}>;

export async function fetchWithTimeout(input: FetchWithTimeoutInput): Promise<Response> {
  const timeoutMilliseconds = input.timeoutMilliseconds ?? DEFAULT_OPENAI_FETCH_TIMEOUT_MILLISECONDS;
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    throw new Error("Fetch timeout must be a positive finite number of milliseconds");
  }

  const requestAbortController = new AbortController();
  const upstreamAbortSignals = collectUpstreamAbortSignals(input);
  for (const upstreamAbortSignal of upstreamAbortSignals) {
    if (upstreamAbortSignal.aborted) {
      throw createFetchAbortErrorFromSignal(upstreamAbortSignal);
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const removeAbortListeners: Array<() => void> = [];
  const cancellationPromise = new Promise<never>((_resolve, reject) => {
    for (const upstreamAbortSignal of upstreamAbortSignals) {
      const abortListener = (): void => {
        const abortError = createFetchAbortErrorFromSignal(upstreamAbortSignal);
        reject(abortError);
        abortFetchRequest(requestAbortController, abortError);
      };

      upstreamAbortSignal.addEventListener("abort", abortListener, { once: true });
      removeAbortListeners.push(() => upstreamAbortSignal.removeEventListener("abort", abortListener));
    }

    timeoutHandle = setTimeout(() => {
      const timeoutError = createFetchTimeoutError(input.timeoutErrorMessage);
      reject(timeoutError);
      abortFetchRequest(requestAbortController, timeoutError);
    }, timeoutMilliseconds);
  });

  try {
    const fetchResponsePromise = (input.fetchImpl ?? fetch)(input.resource, {
      ...input.requestInit,
      signal: requestAbortController.signal,
    });

    return await Promise.race([fetchResponsePromise, cancellationPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    for (const removeAbortListener of removeAbortListeners) {
      removeAbortListener();
    }
  }
}

export function createFetchTimeoutError(message: string): Error {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

function collectUpstreamAbortSignals(input: FetchWithTimeoutInput): AbortSignal[] {
  const upstreamAbortSignals: AbortSignal[] = [];
  if (input.abortSignal) {
    upstreamAbortSignals.push(input.abortSignal);
  }
  if (input.requestInit?.signal) {
    upstreamAbortSignals.push(input.requestInit.signal);
  }

  return upstreamAbortSignals;
}

function abortFetchRequest(requestAbortController: AbortController, error: Error): void {
  if (!requestAbortController.signal.aborted) {
    requestAbortController.abort(error);
  }
}

function createFetchAbortErrorFromSignal(abortSignal: AbortSignal): Error {
  const abortReason = readAbortSignalReason(abortSignal);
  if (abortReason instanceof Error) {
    return abortReason;
  }

  const abortError = new Error(typeof abortReason === "string" ? abortReason : "OpenAI fetch aborted");
  abortError.name = "AbortError";
  return abortError;
}

function readAbortSignalReason(abortSignal: AbortSignal): unknown {
  return (abortSignal as { readonly reason?: unknown }).reason;
}
