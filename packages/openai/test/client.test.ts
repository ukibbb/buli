import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAiAuthStore } from "../src/auth/store.ts";
import { OpenAiProvider } from "../src/provider/client.ts";

class CountingOpenAiAuthStore extends OpenAiAuthStore {
  loadOpenAiCallCount = 0;

  override async loadOpenAi() {
    this.loadOpenAiCallCount += 1;
    return super.loadOpenAi();
  }
}

function createModelListSuccessResponse(): Response {
  return new Response(JSON.stringify({
    models: [
      {
        slug: "gpt-5.4",
        display_name: "GPT-5.4",
        visibility: "list",
        supported_in_api: true,
      },
    ],
  }), { headers: { "content-type": "application/json" } });
}

test("OpenAiProvider applies default hard turn limits", () => {
  const provider = new OpenAiProvider({ endpoint: "https://example.test/v1/responses" });

  const providerTurn = provider.startConversationTurn({
    systemPromptText: "You are buli.",
    conversationSessionEntries: [
      {
        entryKind: "user_prompt",
        promptText: "Inspect the project",
        modelFacingPromptText: "Inspect the project",
      },
    ],
    selectedModelId: "gpt-5.4",
  });

  expect(providerTurn.maxResponseStepsPerTurn).toBe(256);
  expect(providerTurn.maxToolCallsPerTurn).toBe(512);
  expect(providerTurn.rateLimitCoordinator).toBe(provider.rateLimitCoordinator);
  expect(provider.rateLimitCoordinator.maximumConcurrentResponseStepStreams).toBe(8);
});

test("OpenAiProvider applies configured response-step stream concurrency", () => {
  const provider = new OpenAiProvider({
    endpoint: "https://example.test/v1/responses",
    maximumConcurrentResponseStepStreams: 12,
  });

  expect(provider.rateLimitCoordinator.maximumConcurrentResponseStepStreams).toBe(12);
});

test("OpenAiProvider reuses fresh auth across provider requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "buli-openai-provider-auth-cache-"));
  const store = new CountingOpenAiAuthStore({ filePath: join(dir, "auth.json") });
  const queuedResponses = [createModelListSuccessResponse(), createModelListSuccessResponse()];
  const fetchImpl: typeof fetch = Object.assign(
    async () => {
      const queuedResponse = queuedResponses.shift();
      if (!queuedResponse) {
        throw new Error("No queued OpenAI provider response remained");
      }

      return queuedResponse;
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  );

  await store.saveOpenAi({
    provider: "openai",
    method: "oauth",
    accessToken: "fresh-access",
    refreshToken: "fresh-refresh",
    expiresAt: Date.now() + 60 * 60 * 1000,
    accountId: "acct_123",
  });
  const provider = new OpenAiProvider({
    endpoint: "https://example.test/v1/responses",
    store,
    fetchImpl,
  });

  await provider.listAvailableAssistantModels();
  await provider.listAvailableAssistantModels();

  expect(store.loadOpenAiCallCount).toBe(1);
});
