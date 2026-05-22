import { expect, test } from "bun:test";
import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "../src/auth/store.ts";
import { OpenAiProvider } from "../src/provider/client.ts";
import { deriveOpenAiModelListEndpoint, parseAvailableAssistantModelsFromOpenAiResponse } from "../src/provider/models.ts";

type QueuedModelListFetchOutcome =
  | { outcomeKind: "response"; response: Response }
  | { outcomeKind: "rejection"; error: unknown };

function createModelListSuccessResponse(): Response {
  return new Response(
    JSON.stringify({
      models: [
        {
          slug: "gpt-5.4",
          display_name: "GPT-5.4",
          visibility: "list",
          supported_in_api: true,
          default_reasoning_level: "high",
          supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }],
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function createModelListErrorResponse(input: {
  status: number;
  message: string;
  headers?: Record<string, string>;
}): Response {
  return new Response(JSON.stringify({ error: { message: input.message } }), {
    status: input.status,
    headers: {
      "content-type": "application/json",
      ...(input.headers ?? {}),
    },
  });
}

function createModelListFetchImplWithQueuedOutcomes(input: {
  queuedOutcomes: QueuedModelListFetchOutcome[];
  requests: Array<{ url: string; headers: Headers }>;
}): typeof fetch {
  const fetchImpl: typeof fetch = Object.assign(
    async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      input.requests.push({
        url: String(url),
        headers: new Headers(init?.headers),
      });
      const queuedOutcome = input.queuedOutcomes.shift();
      if (!queuedOutcome) {
        throw new Error("No queued OpenAI model-list fetch outcome remained");
      }

      if (queuedOutcome.outcomeKind === "rejection") {
        throw queuedOutcome.error;
      }

      return queuedOutcome.response;
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  return fetchImpl;
}

async function createFreshOpenAiAuthStore(testDirectoryPrefix: string): Promise<OpenAiAuthStore> {
  const dir = await mkdtemp(join(tmpdir(), testDirectoryPrefix));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
    accountId: "acct_123",
  });
  return store;
}

test("deriveOpenAiModelListEndpoint swaps the responses path for models", () => {
  expect(deriveOpenAiModelListEndpoint("https://chatgpt.com/backend-api/codex/responses")).toBe(
    "https://chatgpt.com/backend-api/codex/models?client_version=0.128.0",
  );
  expect(deriveOpenAiModelListEndpoint("http://127.0.0.1:3000/api/codex/responses?foo=bar")).toBe(
    "http://127.0.0.1:3000/api/codex/models?foo=bar&client_version=0.128.0",
  );
});

test("deriveOpenAiModelListEndpoint preserves an explicit client_version query parameter", () => {
  expect(
    deriveOpenAiModelListEndpoint(
      "https://chatgpt.com/backend-api/codex/responses?client_version=0.200.0&foo=bar",
    ),
  ).toBe("https://chatgpt.com/backend-api/codex/models?client_version=0.200.0&foo=bar");
});

test("parseAvailableAssistantModelsFromOpenAiResponse keeps visible api models and maps reasoning metadata", () => {
  expect(
    parseAvailableAssistantModelsFromOpenAiResponse({
      models: [
        {
          slug: "gpt-5.4",
          display_name: "GPT-5.4",
          visibility: "list",
          supported_in_api: true,
          default_reasoning_level: "medium",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
        },
        {
          slug: "hidden-model",
          display_name: "Hidden model",
          visibility: "hide",
          supported_in_api: true,
          supported_reasoning_levels: [],
        },
        {
          slug: "ui-only-model",
          display_name: "UI only",
          visibility: "list",
          supported_in_api: false,
          supported_reasoning_levels: [],
        },
        {
          slug: "gpt-4.1-mini",
          visibility: "list",
          supported_in_api: true,
          supported_reasoning_levels: [],
        },
      ],
    }),
  ).toEqual([
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["low", "high"],
    },
    {
      id: "gpt-4.1-mini",
      displayName: "gpt-4.1-mini",
      supportedReasoningEfforts: [],
    },
  ]);
});

test("OpenAiProvider.listAvailableAssistantModels sends auth headers and maps the models response", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-models-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
    accountId: "acct_123",
  });

  const requests: Array<{ url: string; headers: Headers }> = [];
  const server = createServer((request, response) => {
    requests.push({
      url: request.url ?? "",
      headers: new Headers(request.headers as Record<string, string>),
    });

    response.writeHead(200, {
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify({
        models: [
          {
            slug: "gpt-5.4",
            display_name: "GPT-5.4",
            visibility: "list",
            supported_in_api: true,
            default_reasoning_level: "high",
            supported_reasoning_levels: [{ effort: "medium" }, { effort: "high" }],
          },
        ],
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("models test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({
      endpoint: `http://127.0.0.1:${address.port}/backend-api/codex/responses`,
      store,
    });

    await expect(provider.listAvailableAssistantModels()).resolves.toEqual([
      {
        id: "gpt-5.4",
        displayName: "GPT-5.4",
        defaultReasoningEffort: "high",
        supportedReasoningEfforts: ["medium", "high"],
      },
    ]);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("/backend-api/codex/models?client_version=0.128.0");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer access-token");
    expect(requests[0]?.headers.get("chatgpt-account-id")).toBe("acct_123");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("OpenAiProvider.listAvailableAssistantModels retries transient model-list responses", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const provider = new OpenAiProvider({
    endpoint: "https://example.test/backend-api/codex/responses",
    store: await createFreshOpenAiAuthStore("buli-openai-models-retry-"),
    fetchImpl: createModelListFetchImplWithQueuedOutcomes({
      queuedOutcomes: [
        {
          outcomeKind: "response",
          response: createModelListErrorResponse({
            status: 429,
            message: "slow down",
            headers: { "retry-after-ms": "0", "openai-request-id": "req_model_retry_1" },
          }),
        },
        {
          outcomeKind: "response",
          response: createModelListErrorResponse({
            status: 503,
            message: "temporary outage",
            headers: { "retry-after": "0", "openai-request-id": "req_model_retry_2" },
          }),
        },
        { outcomeKind: "response", response: createModelListSuccessResponse() },
      ],
      requests,
    }),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(provider.listAvailableAssistantModels()).resolves.toEqual([
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["medium", "high"],
    },
  ]);

  expect(requests).toHaveLength(3);
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    "/backend-api/codex/models",
    "/backend-api/codex/models",
    "/backend-api/codex/models",
  ]);
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer access-token");
  expect(diagnosticEvents.filter((diagnosticEvent) => diagnosticEvent.eventName === "model_list.retry_scheduled"))
    .toHaveLength(2);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "model_list.retry_succeeded")?.fields)
    .toMatchObject({
      modelListRequestAttemptIndex: 3,
      retryAttemptCount: 2,
      status: 200,
    });
});

test("OpenAiProvider.listAvailableAssistantModels retries transient model-list transport failures", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const provider = new OpenAiProvider({
    endpoint: "https://example.test/backend-api/codex/responses",
    store: await createFreshOpenAiAuthStore("buli-openai-models-transport-retry-"),
    fetchImpl: createModelListFetchImplWithQueuedOutcomes({
      queuedOutcomes: [
        { outcomeKind: "rejection", error: new TypeError("fetch failed with secret-token") },
        { outcomeKind: "response", response: createModelListSuccessResponse() },
      ],
      requests,
    }),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(provider.listAvailableAssistantModels()).resolves.toEqual([
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["medium", "high"],
    },
  ]);

  expect(requests).toHaveLength(2);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "model_list.transport_retry_scheduled")?.fields)
    .toMatchObject({
      modelListRequestAttemptIndex: 1,
      maxModelListHttpRetryCount: 2,
      transportErrorName: "TypeError",
    });
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "model_list.transport_retry_succeeded")?.fields)
    .toMatchObject({
      modelListRequestAttemptIndex: 2,
      transportRetryAttemptCount: 1,
      status: 200,
    });
  expect(JSON.stringify(diagnosticEvents)).not.toContain("secret-token");
});

test("OpenAiProvider.listAvailableAssistantModels fails after exhausting transient model-list retries", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const provider = new OpenAiProvider({
    endpoint: "https://example.test/backend-api/codex/responses",
    store: await createFreshOpenAiAuthStore("buli-openai-models-retry-exhausted-"),
    fetchImpl: createModelListFetchImplWithQueuedOutcomes({
      queuedOutcomes: [
        { outcomeKind: "response", response: createModelListErrorResponse({ status: 429, message: "retry 1", headers: { "retry-after-ms": "0" } }) },
        { outcomeKind: "response", response: createModelListErrorResponse({ status: 429, message: "retry 2", headers: { "retry-after-ms": "0" } }) },
        { outcomeKind: "response", response: createModelListErrorResponse({ status: 429, message: "retry 3", headers: { "retry-after-ms": "0" } }) },
      ],
      requests,
    }),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(provider.listAvailableAssistantModels()).rejects.toThrow("OpenAI models request failed: 429 | retry 3");

  expect(requests).toHaveLength(3);
  expect(diagnosticEvents.find((diagnosticEvent) => diagnosticEvent.eventName === "model_list.retry_exhausted")?.fields)
    .toMatchObject({
      modelListRequestAttemptIndex: 3,
      maxModelListHttpRetryCount: 2,
      status: 429,
    });
});

test("OpenAiProvider.listAvailableAssistantModels does not retry aborted model-list fetches", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const provider = new OpenAiProvider({
    endpoint: "https://example.test/backend-api/codex/responses",
    store: await createFreshOpenAiAuthStore("buli-openai-models-abort-"),
    fetchImpl: createModelListFetchImplWithQueuedOutcomes({
      queuedOutcomes: [
        { outcomeKind: "rejection", error: new DOMException("request aborted", "AbortError") },
        { outcomeKind: "response", response: createModelListSuccessResponse() },
      ],
      requests,
    }),
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await expect(provider.listAvailableAssistantModels()).rejects.toThrow("request aborted");

  expect(requests).toHaveLength(1);
  expect(diagnosticEvents.some((diagnosticEvent) => diagnosticEvent.eventName === "model_list.transport_retry_scheduled"))
    .toBe(false);
});

test("OpenAiProvider.listAvailableAssistantModels surfaces the backend error message from JSON responses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-models-error-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 600_000,
  });

  const server = createServer((_request, response) => {
    response.writeHead(400, {
      "Content-Type": "application/json",
      "x-request-id": "req_models_123",
    });
    response.end(
      JSON.stringify({
        error: {
          message: "missing client_version",
          type: "invalid_request_error",
        },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("models error test server address unavailable");
  }

  try {
    const provider = new OpenAiProvider({
      endpoint: `http://127.0.0.1:${address.port}/backend-api/codex/responses`,
      store,
    });

    await expect(provider.listAvailableAssistantModels()).rejects.toThrow(
      "OpenAI models request failed: 400 | missing client_version | request_id=req_models_123",
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
