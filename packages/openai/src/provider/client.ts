import type {
  AvailableAssistantModel,
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ModelContextItem,
  ProviderAvailableToolName,
  ReasoningEffort,
} from "@buli/contracts";
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
  promptCacheKey?: string;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  abortSignal?: AbortSignal;
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
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;

  constructor(input: {
    endpoint?: string;
    store?: OpenAiAuthStore;
    fetchImpl?: typeof fetch;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    this.endpoint = input.endpoint ?? OPENAI_CODEX_API_ENDPOINT;
    this.store = input.store ?? new OpenAiAuthStore();
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.diagnosticLogger = input.diagnosticLogger;
  }

  async listAvailableAssistantModels(): Promise<AvailableAssistantModel[]> {
    const modelListRequestStartedAtMs = Date.now();
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "model_list.request_started", {
      endpointPath: new URL(deriveOpenAiModelListEndpoint(this.endpoint)).pathname,
    });
    const auth = await loadOpenAiAuth({
      store: this.store,
      fetchImpl: this.fetchImpl,
    });
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "auth.loaded_for_model_list", {
      hasAccountId: auth.accountId !== undefined,
      expiresInMs: Math.max(0, auth.expiresAt - Date.now()),
    });

    const response = await this.fetchImpl(deriveOpenAiModelListEndpoint(this.endpoint), {
      method: "GET",
      headers: createRequestHeaders(auth, "application/json"),
    });
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "model_list.response_received", {
      status: response.status,
      requestId: getOpenAiRequestId(response.headers) ?? null,
      contentType: response.headers.get("content-type") ?? null,
      durationMs: Date.now() - modelListRequestStartedAtMs,
    });

    if (!response.ok) {
      throw await createHttpError(response, "models");
    }

    const models: AvailableAssistantModel[] = parseAvailableAssistantModelsFromOpenAiResponse(await response.json());
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "model_list.parsed", {
      availableModelCount: models.length,
    });
    return models

  }

  startConversationTurn(input: OpenAiConversationTurnRequest): OpenAiProviderConversationTurn {
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.created", {
      selectedModelId: input.selectedModelId,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      conversationSessionEntryCount: input.conversationSessionEntries.length,
      modelContextItemCount: input.modelContextItems.length,
      systemPromptLength: input.systemPromptText.length,
    });
    return new OpenAiProviderConversationTurn({
      endpoint: this.endpoint,
      fetchImpl: this.fetchImpl,
      loadRequestHeaders: async () => {
        const auth = await loadOpenAiAuth({
          store: this.store,
          fetchImpl: this.fetchImpl,
        });
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "auth.loaded_for_stream", {
          hasAccountId: auth.accountId !== undefined,
          expiresInMs: Math.max(0, auth.expiresAt - Date.now()),
        });

        const headers = createRequestHeaders(auth, "text/event-stream");
        headers.set("Content-Type", "application/json");
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "request_headers.created", {
          accept: headers.get("accept") ?? null,
          contentType: headers.get("content-type") ?? null,
          originator: headers.get("originator") ?? null,
          userAgent: headers.get("user-agent") ?? null,
          hasAuthorizationHeader: headers.has("authorization"),
          hasAccountHeader: headers.has("chatgpt-account-id"),
        });
        return headers;
      },
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      ...(input.promptCacheKey ? { promptCacheKey: input.promptCacheKey } : {}),
      ...(input.availableToolNames ? { availableToolNames: input.availableToolNames } : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      systemPromptText: input.systemPromptText,
      conversationSessionEntries: input.conversationSessionEntries,
      onStepRequestFailed: async (response) => createHttpError(response, "stream"),
      diagnosticLogger: this.diagnosticLogger,
    });
  }
}

function logOpenAiDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  diagnosticLogger?.({
    subsystem: "openai",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

function getOpenAiRequestId(headers: Headers): string | undefined {
  return headers.get("x-request-id") ?? headers.get("request-id") ?? headers.get("openai-request-id") ?? undefined;
}
