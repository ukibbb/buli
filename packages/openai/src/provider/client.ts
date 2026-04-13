import type { AvailableAssistantModel, ProviderStreamEvent, ReasoningEffort } from "@buli/contracts";
import { OPENAI_CODEX_API_ENDPOINT } from "../auth/constants.ts";
import { refreshStoredAuth } from "../auth/refresh.ts";
import type { OpenAiAuthInfo } from "../auth/schema.ts";
import { OpenAiAuthStore } from "../auth/store.ts";
import { deriveOpenAiModelListEndpoint, parseAvailableAssistantModelsFromOpenAiResponse } from "./models.ts";
import { parseOpenAiStream } from "./stream.ts";

export type OpenAiAssistantResponseRequest = {
  promptText: string;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

const DEFAULT_INSTRUCTIONS = "You are buli, a local terminal coding assistant. Answer directly and concisely.";

function createResponsesInput(promptText: string) {
  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: promptText,
        },
      ],
    },
  ];
}

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

  async *streamAssistantResponse(input: OpenAiAssistantResponseRequest): AsyncGenerator<ProviderStreamEvent> {
    const auth = await loadOpenAiAuth({
      store: this.store,
      fetchImpl: this.fetchImpl,
    });

    const headers = createRequestHeaders(auth, "text/event-stream");
    headers.set("Content-Type", "application/json");

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.selectedModelId,
        instructions: DEFAULT_INSTRUCTIONS,
        store: false,
        // The Codex backend expects Responses-style message items, not a bare
        // prompt string. Keeping this conversion here isolates provider quirks
        // away from the engine and TUI layers.
        input: createResponsesInput(input.promptText),
        ...(input.selectedReasoningEffort ? { reasoning: { effort: input.selectedReasoningEffort } } : {}),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw await createHttpError(response, "stream");
    }

    yield* parseOpenAiStream(response);
  }
}
