import type { AvailableAssistantModel, ConversationSessionEntry, ModelContextItem, ReasoningEffort } from "@buli/contracts";
import { z } from "zod";
import { OPENAI_CODEX_API_ENDPOINT } from "../auth/constants.ts";
import { refreshStoredAuth } from "../auth/refresh.ts";
import type { OpenAiAuthInfo } from "../auth/schema.ts";
import { OpenAiAuthStore } from "../auth/store.ts";
import { deriveOpenAiModelListEndpoint, parseAvailableAssistantModelsFromOpenAiResponse } from "./models.ts";
import { OpenAiProviderConversationTurn } from "./turnSession.ts";

const OpenAiErrorResponseBodySchema = z
  .object({
    error: z
      .object({
        message: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export type OpenAiConversationTurnRequest = {
  systemPromptText: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
  modelContextItems: readonly ModelContextItem[];
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

async function createHttpError(response: Response, operation: "models" | "stream"): Promise<Error> {
  const responseBodyText = (await response.text()).trim();
  const requestId =
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("openai-request-id");

  const parts = [`OpenAI ${operation} request failed: ${response.status}`];
  const humanReadableErrorMessage = extractHumanReadableOpenAiErrorMessage(responseBodyText);
  if (humanReadableErrorMessage) {
    parts.push(humanReadableErrorMessage);
  }
  if (requestId) {
    parts.push(`request_id=${requestId}`);
  }

  return new Error(parts.join(" | "));
}

function extractHumanReadableOpenAiErrorMessage(responseBodyText: string): string | undefined {
  if (responseBodyText.length === 0) {
    return undefined;
  }

  const parsedErrorResponseBody = OpenAiErrorResponseBodySchema.safeParse(parseJsonResponseBody(responseBodyText));
  if (parsedErrorResponseBody.success) {
    return parsedErrorResponseBody.data.error.message.trim();
  }

  return responseBodyText;
}

function parseJsonResponseBody(responseBodyText: string): unknown {
  try {
    return JSON.parse(responseBodyText) as unknown;
  } catch {
    return responseBodyText;
  }
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
      conversationSessionEntries: input.conversationSessionEntries,
      onStepRequestFailed: async (response) => createHttpError(response, "stream"),
    });
  }
}
