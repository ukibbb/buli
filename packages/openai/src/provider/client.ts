import type { AvailableAssistantModel, ModelContextItem, ReasoningEffort } from "@buli/contracts";
import { OPENAI_CODEX_API_ENDPOINT } from "../auth/constants.ts";
import { refreshStoredAuth } from "../auth/refresh.ts";
import type { OpenAiAuthInfo } from "../auth/schema.ts";
import { OpenAiAuthStore } from "../auth/store.ts";
import { deriveOpenAiModelListEndpoint, parseAvailableAssistantModelsFromOpenAiResponse } from "./models.ts";
import { OpenAiProviderConversationTurn } from "./turnSession.ts";

export type OpenAiConversationTurnRequest = {
  systemPromptText: string;
  modelContextItems: readonly ModelContextItem[];
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

async function createHttpError(response: Response, operation: "models" | "stream"): Promise<Error> {
  const body = (await response.text()).trim();
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("openai-request-id");

  const parts = [`OpenAI ${operation} request failed: ${response.status}`];
  if (body) {
    parts.push(body);
  }
  if (requestId) {
    parts.push(`request_id=${requestId}`);
  }

  return new Error(parts.join(" | "));
}

async function loadOpenAiAuth(input: { store: OpenAiAuthStore; fetchImpl: typeof fetch }): Promise<OpenAiAuthInfo> {
  const auth = await refreshStoredAuth(input);

  if (!auth) {
    throw new Error("OpenAI auth not found. Run `buli login`.");
  }

  return auth;
}

function createRequestHeaders(auth: OpenAiAuthInfo, accept: string): Headers {
  const headers = new Headers({
    authorization: `Bearer ${auth.accessToken}`,
    Accept: accept,
    originator: "buli",
    "User-Agent": "buli/dev",
  });

  if (auth.accountId) {
    headers.set("ChatGPT-Account-Id", auth.accountId);
  }

  return headers;
}

export class OpenAiProvider {
  readonly endpoint: string;
  readonly store: OpenAiAuthStore;
  readonly fetchImpl: typeof fetch;

  constructor(input: {
    endpoint?: string;
    store?: OpenAiAuthStore;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.endpoint = input.endpoint ?? OPENAI_CODEX_API_ENDPOINT;
    this.store = input.store ?? new OpenAiAuthStore();
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async listAvailableAssistantModels(): Promise<AvailableAssistantModel[]> {
    const auth = await loadOpenAiAuth({
      store: this.store,
      fetchImpl: this.fetchImpl,
    });

    const response = await this.fetchImpl(deriveOpenAiModelListEndpoint(this.endpoint), {
      method: "GET",
      headers: createRequestHeaders(auth, "application/json"),
    });

    if (!response.ok) {
      throw await createHttpError(response, "models");
    }

    return parseAvailableAssistantModelsFromOpenAiResponse(await response.json());
  }

  startConversationTurn(input: OpenAiConversationTurnRequest): OpenAiProviderConversationTurn {
    return new OpenAiProviderConversationTurn({
      endpoint: this.endpoint,
      fetchImpl: this.fetchImpl,
      loadRequestHeaders: async () => {
        const auth = await loadOpenAiAuth({
          store: this.store,
          fetchImpl: this.fetchImpl,
        });

        const headers = createRequestHeaders(auth, "text/event-stream");
        headers.set("Content-Type", "application/json");
        return headers;
      },
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      systemPromptText: input.systemPromptText,
      modelContextItems: input.modelContextItems,
      onStepRequestFailed: async (response) => createHttpError(response, "stream"),
    });
  }
}
