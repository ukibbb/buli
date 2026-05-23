import { expect, test } from "bun:test";
import { fetchWithTimeout } from "../src/fetchWithTimeout.ts";

function createAbortablePendingFetchImpl(input: {
  receivedAbortSignals: AbortSignal[];
}): typeof fetch {
  const fetchImpl: typeof fetch = Object.assign(
    async (_resource: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (init?.signal) {
        input.receivedAbortSignals.push(init.signal);
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortReason = readAbortSignalReason(init.signal);
          reject(abortReason instanceof Error ? abortReason : new Error("request aborted"));
        }, { once: true });
      });
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  return fetchImpl;
}

function readAbortSignalReason(abortSignal: AbortSignal | null | undefined): unknown {
  return abortSignal ? (abortSignal as { readonly reason?: unknown }).reason : undefined;
}

test("fetchWithTimeout returns the fetch response before the timeout", async () => {
  const requests: Array<{ url: string; method: string | null }> = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (resource: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requests.push({
        url: String(resource),
        method: init?.method ?? null,
      });
      return new Response("ok");
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  const response = await fetchWithTimeout({
    resource: "https://example.test/token",
    requestInit: { method: "POST" },
    fetchImpl,
    timeoutMilliseconds: 1_000,
    timeoutErrorMessage: "request timed out",
  });

  expect(await response.text()).toBe("ok");
  expect(requests).toEqual([{ url: "https://example.test/token", method: "POST" }]);
});

test("fetchWithTimeout aborts the request signal when the timeout expires", async () => {
  const receivedAbortSignals: AbortSignal[] = [];

  await expect(fetchWithTimeout({
    resource: "https://example.test/hanging",
    fetchImpl: createAbortablePendingFetchImpl({ receivedAbortSignals }),
    timeoutMilliseconds: 1,
    timeoutErrorMessage: "request timed out",
  })).rejects.toThrow("request timed out");

  expect(receivedAbortSignals).toHaveLength(1);
  const receivedAbortSignal = receivedAbortSignals[0];
  if (!receivedAbortSignal) {
    throw new Error("fetchWithTimeout did not pass an abort signal to fetch");
  }
  expect(receivedAbortSignal.aborted).toBe(true);
  const abortReason = readAbortSignalReason(receivedAbortSignal);
  expect(abortReason).toBeInstanceOf(Error);
  if (abortReason instanceof Error) {
    expect(abortReason.name).toBe("TimeoutError");
  }
});

test("fetchWithTimeout aborts when the caller abort signal fires", async () => {
  const callerAbortController = new AbortController();
  const receivedAbortSignals: AbortSignal[] = [];
  const requestPromise = fetchWithTimeout({
    resource: "https://example.test/hanging",
    fetchImpl: createAbortablePendingFetchImpl({ receivedAbortSignals }),
    abortSignal: callerAbortController.signal,
    timeoutMilliseconds: 1_000,
    timeoutErrorMessage: "request timed out",
  });

  callerAbortController.abort(new DOMException("caller stopped", "AbortError"));

  await expect(requestPromise).rejects.toThrow("caller stopped");
  expect(receivedAbortSignals).toHaveLength(1);
  const receivedAbortSignal = receivedAbortSignals[0];
  if (!receivedAbortSignal) {
    throw new Error("fetchWithTimeout did not pass an abort signal to fetch");
  }
  expect(receivedAbortSignal.aborted).toBe(true);
});
