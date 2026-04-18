import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "../src/auth/store.ts";
import { OpenAiProvider } from "../src/provider/client.ts";
import { deriveOpenAiModelListEndpoint, parseAvailableAssistantModelsFromOpenAiResponse } from "../src/provider/models.ts";

test("deriveOpenAiModelListEndpoint swaps the responses path for models", () => {
  expect(deriveOpenAiModelListEndpoint("https://chatgpt.com/backend-api/codex/responses")).toBe(
    "https://chatgpt.com/backend-api/codex/models?client_version=0.115.0",
  );
  expect(deriveOpenAiModelListEndpoint("http://127.0.0.1:3000/api/codex/responses?foo=bar")).toBe(
    "http://127.0.0.1:3000/api/codex/models?foo=bar&client_version=0.115.0",
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
    expiresAt: Date.now() + 60_000,
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
    expect(requests[0]?.url).toBe("/backend-api/codex/models?client_version=0.115.0");
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

test("OpenAiProvider.listAvailableAssistantModels surfaces the backend error message from JSON responses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-models-error-"));
  const store = new OpenAiAuthStore({ filePath: join(dir, "auth.json") });
  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() + 60_000,
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
