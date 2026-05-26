import type {
  AvailableAssistantModel,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ProviderAvailableToolName,
  ReasoningEffort,
} from "@buli/contracts";
import { OPENAI_CODEX_API_ENDPOINT } from "../auth/constants.ts";
import { isOpenAiAuthFreshEnough, refreshStoredAuth } from "../auth/refresh.ts";
import type { OpenAiAuthInfo } from "../auth/schema.ts";
import { OpenAiAuthStore } from "../auth/store.ts";
import { fetchWithTimeout } from "../fetchWithTimeout.ts";
import { logOpenAiDiagnosticEvent } from "./diagnostics.ts";
import { createOpenAiHttpRequestError, getOpenAiRequestId } from "./httpResponseDiagnostics.ts";
import { requestOpenAiHttpResponseWithRetries } from "./openAiHttpRetry.ts";
import { OpenAiRateLimitCoordinator } from "./openAiRateLimitCoordinator.ts";
import { deriveOpenAiModelListEndpoint, parseAvailableAssistantModelsFromOpenAiResponse } from "./models.ts";
import { OpenAiProviderConversationTurn } from "./turnSession.ts";

export type OpenAiConversationTurnRequest = {
  conversationTurnId?: string;
  providerTurnKind?: "assistant" | "task_subagent" | "conversation_compaction";
  parentTaskToolCallId?: string;
  subagentName?: string;
  compactionSource?: "manual" | "auto";
  systemPromptText: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  promptCacheKey?: string;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  abortSignal?: AbortSignal;
};

export type OpenAiModelListRequest = Readonly<{
  abortSignal?: AbortSignal | undefined;
  fetchTimeoutMilliseconds?: number | undefined;
}>;

const OPENAI_MODEL_LIST_FETCH_TIMEOUT_MESSAGE = "OpenAI model-list request timed out";
const DEFAULT_OPENAI_MAX_RESPONSE_STEPS_PER_TURN = 256;
const DEFAULT_OPENAI_MAX_TOOL_CALLS_PER_TURN = 512;

async function loadOpenAiAuth(input: {
  store: OpenAiAuthStore;
  fetchImpl: typeof fetch;
  abortSignal?: AbortSignal | undefined;
  fetchTimeoutMilliseconds?: number | undefined;
}): Promise<OpenAiAuthInfo> {
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
  readonly rateLimitCoordinator: OpenAiRateLimitCoordinator;
  private cachedOpenAiAuth: OpenAiAuthInfo | undefined;
  private pendingOpenAiAuthLoad: Promise<OpenAiAuthInfo> | undefined;

  constructor(input: {
    endpoint?: string;
    store?: OpenAiAuthStore;
    fetchImpl?: typeof fetch;
    maximumConcurrentResponseStepStreams?: number | undefined;
    rateLimitCoordinator?: OpenAiRateLimitCoordinator | undefined;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    this.endpoint = input.endpoint ?? OPENAI_CODEX_API_ENDPOINT;
    this.store = input.store ?? new OpenAiAuthStore();
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.diagnosticLogger = input.diagnosticLogger;
    this.rateLimitCoordinator = input.rateLimitCoordinator ?? new OpenAiRateLimitCoordinator({
      maximumConcurrentResponseStepStreams: input.maximumConcurrentResponseStepStreams,
      diagnosticLogger: this.diagnosticLogger,
    });
  }

  async listAvailableAssistantModels(input: OpenAiModelListRequest = {}): Promise<AvailableAssistantModel[]> {
    const modelListRequestStartedAtMs = Date.now();
    const modelListEndpoint = deriveOpenAiModelListEndpoint(this.endpoint);
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "model_list.request_started", {
      endpointPath: new URL(modelListEndpoint).pathname,
    });
    const auth = await this.loadCachedOpenAiAuth(input);
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "auth.loaded_for_model_list", {
      hasAccountId: auth.accountId !== undefined,
      expiresInMs: Math.max(0, auth.expiresAt - Date.now()),
    });

    const modelListRetryIterator = requestOpenAiHttpResponseWithRetries({
      fetchResponse: async () => fetchWithTimeout({
        resource: modelListEndpoint,
        fetchImpl: this.fetchImpl,
        abortSignal: input.abortSignal,
        timeoutMilliseconds: input.fetchTimeoutMilliseconds,
        timeoutErrorMessage: OPENAI_MODEL_LIST_FETCH_TIMEOUT_MESSAGE,
        requestInit: {
          method: "GET",
          headers: createRequestHeaders(auth, "application/json"),
        },
      }),
      diagnosticLogger: this.diagnosticLogger,
      diagnosticEventPrefix: "model_list",
      requestAttemptDiagnosticFieldName: "modelListRequestAttemptIndex",
      maximumRetryCountDiagnosticFieldName: "maxModelListHttpRetryCount",
      debugLogTitlePrefix: "OpenAI model-list",
      abortSignal: input.abortSignal,
      operationStartedAtMs: modelListRequestStartedAtMs,
    })[Symbol.asyncIterator]();
    const modelListRetryResult = await modelListRetryIterator.next();
    if (!modelListRetryResult.done) {
      throw new Error("OpenAI model-list retry loop unexpectedly yielded a provider event");
    }
    const response = modelListRetryResult.value.response;

    if (!response.ok) {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "model_list.request_failed", {
        modelListRequestAttemptIndex: modelListRetryResult.value.requestAttemptIndex,
        status: response.status,
        requestId: getOpenAiRequestId(response.headers) ?? null,
        contentType: response.headers.get("content-type") ?? null,
      });
      throw await createOpenAiHttpRequestError(response, "models");
    }

    const models: AvailableAssistantModel[] = parseAvailableAssistantModelsFromOpenAiResponse(await response.json());
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "model_list.parsed", {
      availableModelCount: models.length,
    });
    return models;
  }

  startConversationTurn(input: OpenAiConversationTurnRequest): OpenAiProviderConversationTurn {
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.created", {
      conversationTurnId: input.conversationTurnId ?? null,
      providerTurnKind: input.providerTurnKind ?? null,
      parentTaskToolCallId: input.parentTaskToolCallId ?? null,
      subagentName: input.subagentName ?? null,
      compactionSource: input.compactionSource ?? null,
      selectedModelId: input.selectedModelId,
      selectedReasoningEffort: input.selectedReasoningEffort ?? null,
      conversationSessionEntryCount: input.conversationSessionEntries.length,
      systemPromptLength: input.systemPromptText.length,
    });
    return new OpenAiProviderConversationTurn({
      endpoint: this.endpoint,
      fetchImpl: this.fetchImpl,
      loadRequestHeaders: async () => {
        const auth = await this.loadCachedOpenAiAuth({ abortSignal: input.abortSignal });
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "auth.loaded_for_stream", {
          providerTurnKind: input.providerTurnKind ?? null,
          parentTaskToolCallId: input.parentTaskToolCallId ?? null,
          subagentName: input.subagentName ?? null,
          compactionSource: input.compactionSource ?? null,
          conversationTurnId: input.conversationTurnId ?? null,
          hasAccountId: auth.accountId !== undefined,
          expiresInMs: Math.max(0, auth.expiresAt - Date.now()),
        });

        const headers = createRequestHeaders(auth, "text/event-stream");
        headers.set("Content-Type", "application/json");
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "request_headers.created", {
          providerTurnKind: input.providerTurnKind ?? null,
          parentTaskToolCallId: input.parentTaskToolCallId ?? null,
          subagentName: input.subagentName ?? null,
          compactionSource: input.compactionSource ?? null,
          conversationTurnId: input.conversationTurnId ?? null,
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
      ...(input.providerTurnKind ? { providerTurnKind: input.providerTurnKind } : {}),
      ...(input.parentTaskToolCallId ? { parentTaskToolCallId: input.parentTaskToolCallId } : {}),
      ...(input.subagentName ? { subagentName: input.subagentName } : {}),
      ...(input.compactionSource ? { compactionSource: input.compactionSource } : {}),
      ...(input.conversationTurnId ? { conversationTurnId: input.conversationTurnId } : {}),
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      ...(input.promptCacheKey ? { promptCacheKey: input.promptCacheKey } : {}),
      ...(input.availableToolNames ? { availableToolNames: input.availableToolNames } : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      maxResponseStepsPerTurn: DEFAULT_OPENAI_MAX_RESPONSE_STEPS_PER_TURN,
      maxToolCallsPerTurn: DEFAULT_OPENAI_MAX_TOOL_CALLS_PER_TURN,
      rateLimitCoordinator: this.rateLimitCoordinator,
      systemPromptText: input.systemPromptText,
      conversationSessionEntries: input.conversationSessionEntries,
      onStepRequestFailed: async (response) => createOpenAiHttpRequestError(response, "stream"),
      diagnosticLogger: this.diagnosticLogger,
    });
  }

  private async loadCachedOpenAiAuth(input: {
    abortSignal?: AbortSignal | undefined;
    fetchTimeoutMilliseconds?: number | undefined;
  } = {}): Promise<OpenAiAuthInfo> {
    if (this.cachedOpenAiAuth && isOpenAiAuthFreshEnough(this.cachedOpenAiAuth)) {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "auth.cache_hit", {
        expiresInMs: Math.max(0, this.cachedOpenAiAuth.expiresAt - Date.now()),
      });
      return this.cachedOpenAiAuth;
    }

    if (this.pendingOpenAiAuthLoad) {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "auth.pending_load_reused");
      return this.pendingOpenAiAuthLoad;
    }

    const pendingOpenAiAuthLoad = loadOpenAiAuth({
      store: this.store,
      fetchImpl: this.fetchImpl,
      abortSignal: input.abortSignal,
      fetchTimeoutMilliseconds: input.fetchTimeoutMilliseconds,
    }).then((auth) => {
      this.cachedOpenAiAuth = auth;
      return auth;
    });
    this.pendingOpenAiAuthLoad = pendingOpenAiAuthLoad;

    try {
      return await pendingOpenAiAuthLoad;
    } finally {
      if (this.pendingOpenAiAuthLoad === pendingOpenAiAuthLoad) {
        this.pendingOpenAiAuthLoad = undefined;
      }
    }
  }
}
