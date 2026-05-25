import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
  ProviderAvailableToolName,
  ProviderRequestedToolCall,
  ProviderStreamEvent,
  ReasoningEffort,
  TokenUsage,
  ToolCallRequest,
} from "@buli/contracts";
import {
  createFunctionCallOutputInputItem,
  createOpenAiResponseReplayItems,
  createOpenAiResponsesInputItems,
  type OpenAiConversationInputItem,
} from "./request.ts";
import { writeOpenAiDebugLog } from "./debugLog.ts";
import {
  logOpenAiDiagnosticEvent,
  summarizeOpenAiToolCallRequestForDiagnostics,
  summarizeTokenUsageForDiagnostics,
} from "./diagnostics.ts";
import {
  extractStructuredOpenAiErrorMessage,
  getOpenAiRequestId,
  sanitizeOpenAiErrorMessage,
  type OpenAiHttpErrorResponse,
} from "./httpResponseDiagnostics.ts";
import { fetchWithTimeout } from "../fetchWithTimeout.ts";
import { requestOpenAiHttpResponseWithRetries } from "./openAiHttpRetry.ts";
import {
  createOpenAiResponsesHttpRequestBody,
  summarizeOpenAiResponsesRequestForDiagnostics,
} from "./openAiResponsesRequest.ts";
import { parseOpenAiStream, type OpenAiResponseStepTerminalState } from "./stream.ts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import type { OpenAiRateLimitCoordinator } from "./openAiRateLimitCoordinator.ts";
import {
  type OpenAiInvalidFunctionCallIntent,
  type OpenAiProviderFunctionCallIntent,
} from "./toolDefinitions.ts";

type OpenAiProviderToolResultSubmission = {
  toolCallId: string;
  toolResultText: string;
};

type PendingOpenAiToolResultSubmissionWait = {
  resolveSubmission: (toolResultSubmission: OpenAiProviderToolResultSubmission) => void;
  rejectSubmission: (error: Error) => void;
  abortListener?: (() => void) | undefined;
};

type OpenAiTerminalUsageProviderEvent = Extract<ProviderStreamEvent, { type: "completed" | "incomplete" }>;
type OpenAiResponseStepToolCallTerminalState = Extract<
  OpenAiResponseStepTerminalState,
  { terminalKind: "tool_call_requested" | "tool_calls_requested" | "provider_function_calls_requested" }
>;

const DEFAULT_RESPONSE_STEP_DIAGNOSTIC_WARNING_THRESHOLD = 32;
const DEFAULT_TOOL_CALL_DIAGNOSTIC_WARNING_THRESHOLD = 128;
const DEFAULT_REPEATED_TOOL_CALL_DIAGNOSTIC_WARNING_THRESHOLD = 3;
const DEFAULT_OPENAI_RESPONSE_STEP_FETCH_TIMEOUT_MILLISECONDS = 60_000;
const DEFAULT_OPENAI_RESPONSE_STEP_STREAM_IDLE_TIMEOUT_MILLISECONDS = 300_000;
const OPENAI_RESPONSE_STEP_FETCH_TIMEOUT_MESSAGE = "OpenAI response-step request timed out";

function addTokenUsage(accumulatedTokenUsage: TokenUsage | undefined, nextTokenUsage: TokenUsage): TokenUsage {
  if (!accumulatedTokenUsage) {
    return nextTokenUsage;
  }

  const accumulatedTotalTokenCount =
    accumulatedTokenUsage.total ?? accumulatedTokenUsage.input + accumulatedTokenUsage.output + accumulatedTokenUsage.reasoning;
  const nextTotalTokenCount = nextTokenUsage.total ?? nextTokenUsage.input + nextTokenUsage.output + nextTokenUsage.reasoning;

  return {
    total: accumulatedTotalTokenCount + nextTotalTokenCount,
    input: accumulatedTokenUsage.input + nextTokenUsage.input,
    output: accumulatedTokenUsage.output + nextTokenUsage.output,
    reasoning: accumulatedTokenUsage.reasoning + nextTokenUsage.reasoning,
    cache: {
      read: accumulatedTokenUsage.cache.read + nextTokenUsage.cache.read,
      write: accumulatedTokenUsage.cache.write + nextTokenUsage.cache.write,
    },
  };
}

export class OpenAiProviderConversationTurn {
  readonly endpoint: string;
  readonly fetchImpl: typeof fetch;
  readonly loadRequestHeaders: () => Promise<Headers>;
  readonly selectedModelId: string;
  readonly selectedReasoningEffort: ReasoningEffort | undefined;
  readonly promptCacheKey: string | undefined;
  readonly availableToolNames: readonly ProviderAvailableToolName[] | undefined;
  readonly abortSignal: AbortSignal | undefined;
  readonly systemPromptText: string;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly onStepRequestFailed: (response: Response) => Promise<Error>;
  readonly maxResponseStepsPerTurn: number | undefined;
  readonly maxToolCallsPerTurn: number | undefined;
  readonly responseStepDiagnosticWarningThreshold: number;
  readonly toolCallDiagnosticWarningThreshold: number;
  readonly repeatedToolCallDiagnosticWarningThreshold: number;
  readonly responseStepFetchTimeoutMilliseconds: number;
  readonly responseStepStreamIdleTimeoutMilliseconds: number;
  readonly rateLimitCoordinator: OpenAiRateLimitCoordinator | undefined;
  readonly openAiConversationInputItems: OpenAiConversationInputItem[];
  readonly providerTurnReplayInputItems: OpenAiProviderTurnReplayInputItem[];
  readonly queuedToolResultSubmissionByToolCallId: Map<string, OpenAiProviderToolResultSubmission>;
  readonly pendingToolResultSubmissionWaitByToolCallId: Map<string, PendingOpenAiToolResultSubmissionWait>;
  hasStartedStreamingProviderEvents = false;

  constructor(input: {
    endpoint: string;
    fetchImpl: typeof fetch;
    loadRequestHeaders: () => Promise<Headers>;
    selectedModelId: string;
    selectedReasoningEffort?: ReasoningEffort;
    promptCacheKey?: string;
    availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
    abortSignal?: AbortSignal;
    systemPromptText: string;
    conversationSessionEntries: readonly ConversationSessionEntry[];
    onStepRequestFailed: (response: Response) => Promise<Error>;
    maxResponseStepsPerTurn?: number;
    maxToolCallsPerTurn?: number;
    responseStepDiagnosticWarningThreshold?: number;
    toolCallDiagnosticWarningThreshold?: number;
    repeatedToolCallDiagnosticWarningThreshold?: number;
    responseStepFetchTimeoutMilliseconds?: number;
    responseStepStreamIdleTimeoutMilliseconds?: number;
    rateLimitCoordinator?: OpenAiRateLimitCoordinator | undefined;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.endpoint = input.endpoint;
    this.fetchImpl = input.fetchImpl;
    this.loadRequestHeaders = input.loadRequestHeaders;
    this.selectedModelId = input.selectedModelId;
    this.selectedReasoningEffort = input.selectedReasoningEffort;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.abortSignal = input.abortSignal;
    this.systemPromptText = input.systemPromptText;
    this.diagnosticLogger = input.diagnosticLogger;
    this.onStepRequestFailed = input.onStepRequestFailed;
    this.maxResponseStepsPerTurn = normalizeOptionalPositiveIntegerLimit(input.maxResponseStepsPerTurn);
    this.maxToolCallsPerTurn = normalizeOptionalPositiveIntegerLimit(input.maxToolCallsPerTurn);
    this.responseStepDiagnosticWarningThreshold = normalizePositiveIntegerThreshold(
      input.responseStepDiagnosticWarningThreshold,
      DEFAULT_RESPONSE_STEP_DIAGNOSTIC_WARNING_THRESHOLD,
    );
    this.toolCallDiagnosticWarningThreshold = normalizePositiveIntegerThreshold(
      input.toolCallDiagnosticWarningThreshold,
      DEFAULT_TOOL_CALL_DIAGNOSTIC_WARNING_THRESHOLD,
    );
    this.repeatedToolCallDiagnosticWarningThreshold = normalizePositiveIntegerThreshold(
      input.repeatedToolCallDiagnosticWarningThreshold,
      DEFAULT_REPEATED_TOOL_CALL_DIAGNOSTIC_WARNING_THRESHOLD,
    );
    this.responseStepFetchTimeoutMilliseconds = normalizePositiveIntegerThreshold(
      input.responseStepFetchTimeoutMilliseconds,
      DEFAULT_OPENAI_RESPONSE_STEP_FETCH_TIMEOUT_MILLISECONDS,
    );
    this.responseStepStreamIdleTimeoutMilliseconds = normalizePositiveIntegerThreshold(
      input.responseStepStreamIdleTimeoutMilliseconds,
      DEFAULT_OPENAI_RESPONSE_STEP_STREAM_IDLE_TIMEOUT_MILLISECONDS,
    );
    this.rateLimitCoordinator = input.rateLimitCoordinator;
    this.openAiConversationInputItems = createOpenAiResponsesInputItems(input.conversationSessionEntries);
    this.providerTurnReplayInputItems = [];
    this.queuedToolResultSubmissionByToolCallId = new Map<string, OpenAiProviderToolResultSubmission>();
    this.pendingToolResultSubmissionWaitByToolCallId = new Map<string, PendingOpenAiToolResultSubmissionWait>();
  }

  async submitToolResult(input: OpenAiProviderToolResultSubmission): Promise<void> {
    const pendingSubmissionWait = this.pendingToolResultSubmissionWaitByToolCallId.get(input.toolCallId);
    if (pendingSubmissionWait) {
      this.clearPendingToolResultSubmissionWait(input.toolCallId, pendingSubmissionWait);
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "tool_result_submission.resolved_pending_wait", {
        toolCallId: input.toolCallId,
        toolResultTextLength: input.toolResultText.length,
      });
      pendingSubmissionWait.resolveSubmission(input);
      return;
    }

    this.queuedToolResultSubmissionByToolCallId.set(input.toolCallId, input);
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "tool_result_submission.queued", {
      toolCallId: input.toolCallId,
      toolResultTextLength: input.toolResultText.length,
      queuedToolResultSubmissionCount: this.queuedToolResultSubmissionByToolCallId.size,
    });
  }

  getProviderTurnReplay(): OpenAiProviderTurnReplay | undefined {
    if (this.providerTurnReplayInputItems.length === 0) {
      return undefined;
    }

    return {
      provider: "openai",
      inputItems: [...this.providerTurnReplayInputItems],
    };
  }

  async *streamProviderEvents(): AsyncGenerator<ProviderStreamEvent> {
    if (this.hasStartedStreamingProviderEvents) {
      throw new Error("Provider turn events can only be streamed once");
    }
    this.hasStartedStreamingProviderEvents = true;
    let accumulatedOpenAiTurnUsage: TokenUsage | undefined;
    let responseStepIndex = 0;
    let requestedToolCallCount = 0;
    const observedRequestedToolCallIds = new Set<string>();
    const toolCallPatternObservationCountByFingerprint = new Map<string, number>();
    const turnStartedAtMs = Date.now();

    const observeRequestedToolCallsForTurnLimitsAndDiagnostics = (input: {
      responseStepIndex: number;
      requestedToolCalls: readonly ProviderRequestedToolCall[];
    }): void => {
      const newlyObservedRequestedToolCalls = input.requestedToolCalls.filter((requestedToolCall) =>
        !observedRequestedToolCallIds.has(requestedToolCall.toolCallId)
      );
      if (newlyObservedRequestedToolCalls.length === 0) {
        return;
      }

      const previousRequestedToolCallCount = requestedToolCallCount;
      const nextRequestedToolCallCount = requestedToolCallCount + newlyObservedRequestedToolCalls.length;
      if (this.maxToolCallsPerTurn !== undefined && nextRequestedToolCallCount > this.maxToolCallsPerTurn) {
        throw new Error(
          `OpenAI tool-call limit exceeded: requested ${nextRequestedToolCallCount} tool calls (max ${this.maxToolCallsPerTurn}).`,
        );
      }

      requestedToolCallCount = nextRequestedToolCallCount;
      for (const requestedToolCall of newlyObservedRequestedToolCalls) {
        observedRequestedToolCallIds.add(requestedToolCall.toolCallId);
      }
      this.logProviderTurnSoftDiagnosticWarnings({
        responseStepIndex: input.responseStepIndex,
        requestedToolCallCount,
        previousRequestedToolCallCount,
        currentResponseStepToolCallCount: newlyObservedRequestedToolCalls.length,
        requestedToolCalls: newlyObservedRequestedToolCalls,
        toolCallPatternObservationCountByFingerprint,
      });
    };

    while (true) {
      responseStepIndex += 1;
      if (this.maxResponseStepsPerTurn !== undefined && responseStepIndex > this.maxResponseStepsPerTurn) {
        throw new Error(`OpenAI response step limit exceeded after ${this.maxResponseStepsPerTurn} steps.`);
      }
      if (responseStepIndex === this.responseStepDiagnosticWarningThreshold) {
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.response_step_warning_threshold_reached", {
          responseStepIndex,
          responseStepDiagnosticWarningThreshold: this.responseStepDiagnosticWarningThreshold,
          requestedToolCallCount,
        });
      }
      const responseStepStartedAtMs = Date.now();
      const requestBody = createOpenAiResponsesHttpRequestBody({
        selectedModelId: this.selectedModelId,
        ...(this.selectedReasoningEffort ? { selectedReasoningEffort: this.selectedReasoningEffort } : {}),
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
        ...(this.availableToolNames ? { availableToolNames: this.availableToolNames } : {}),
        systemPromptText: this.systemPromptText,
        openAiInputItems: this.openAiConversationInputItems,
      });
      const requestDebugSummary = summarizeOpenAiResponsesRequestForDiagnostics({
        requestBody,
        responseStepIndex,
      });
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.request_prepared", requestDebugSummary);
      await writeOpenAiDebugLog("OpenAI responses request", requestDebugSummary);

      let terminalState: OpenAiResponseStepTerminalState | undefined;
      let terminalUsageProviderEvent: OpenAiTerminalUsageProviderEvent | undefined;
      const responseStepStreamSlot = await this.rateLimitCoordinator?.acquireResponseStepStreamSlot({
        abortSignal: this.abortSignal,
      });
      try {
        const responseRetryIterator = requestOpenAiHttpResponseWithRetries({
          fetchResponse: async () => fetchWithTimeout({
            resource: this.endpoint,
            fetchImpl: this.fetchImpl,
            abortSignal: this.abortSignal,
            timeoutMilliseconds: this.responseStepFetchTimeoutMilliseconds,
            timeoutErrorMessage: OPENAI_RESPONSE_STEP_FETCH_TIMEOUT_MESSAGE,
            requestInit: {
              method: "POST",
              headers: await this.loadRequestHeaders(),
              body: JSON.stringify(requestBody),
            },
          }),
          diagnosticLogger: this.diagnosticLogger,
          diagnosticEventPrefix: "response_step",
          diagnosticFields: { responseStepIndex },
          requestAttemptDiagnosticFieldName: "responseStepRequestAttemptIndex",
          maximumRetryCountDiagnosticFieldName: "maxResponseStepHttpRetryCount",
          debugLogTitlePrefix: "OpenAI response-step",
          abortSignal: this.abortSignal,
          operationStartedAtMs: responseStepStartedAtMs,
          shouldYieldRetryPendingEvents: true,
          onResponseHeadersReceived: (responseHeaderObservation) => {
            this.rateLimitCoordinator?.observeResponseHeaders(responseHeaderObservation.headers, {
              status: responseHeaderObservation.status,
              wasSuccessfulHttpResponse: responseHeaderObservation.wasSuccessfulHttpResponse,
              retryAfterMilliseconds: responseHeaderObservation.retryAfterMilliseconds,
            });
          },
        })[Symbol.asyncIterator]();
        let responseRetryResult: Awaited<ReturnType<typeof responseRetryIterator.next>> | undefined;
        while (true) {
          responseRetryResult = await responseRetryIterator.next();
          if (responseRetryResult.done) {
            break;
          }

          logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_event.yielded", {
            responseStepIndex,
            eventType: responseRetryResult.value.type,
            ...summarizeProviderStreamEventForDiagnostics(responseRetryResult.value),
          });
          yield responseRetryResult.value;
        }

        if (!responseRetryResult?.done) {
          throw new Error("OpenAI response-step retry loop ended without a response");
        }

        const response = responseRetryResult.value.response;
        if (!response.ok) {
          const failedResponseDebugPayload = await createFailedResponseDebugPayload(response.clone());
          logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.request_failed", {
            responseStepIndex,
            responseStepRequestAttemptIndex: responseRetryResult.value.requestAttemptIndex,
            ...failedResponseDebugPayload,
          });
          await writeOpenAiDebugLog("OpenAI responses request failed", failedResponseDebugPayload);
          throw await this.onStepRequestFailed(response);
        }

        const openAiStepEventIterator = parseOpenAiStream(response, {
          diagnosticLogger: this.diagnosticLogger,
          abortSignal: this.abortSignal,
          idleTimeoutMilliseconds: this.responseStepStreamIdleTimeoutMilliseconds,
        })[Symbol.asyncIterator]();
        while (true) {
          const nextStepItem = await openAiStepEventIterator.next();
          if (nextStepItem.done) {
            terminalState = nextStepItem.value;
            break;
          }

          if (nextStepItem.value.type === "completed" || nextStepItem.value.type === "incomplete") {
            logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_event.terminal_usage_received", {
              responseStepIndex,
              eventType: nextStepItem.value.type,
              ...summarizeTokenUsageForDiagnostics(nextStepItem.value.usage),
            });
            terminalUsageProviderEvent = nextStepItem.value;
            accumulatedOpenAiTurnUsage = addTokenUsage(accumulatedOpenAiTurnUsage, nextStepItem.value.usage);
            continue;
          }

          if (nextStepItem.value.type === "tool_call_requested" || nextStepItem.value.type === "tool_calls_requested") {
            observeRequestedToolCallsForTurnLimitsAndDiagnostics({
              responseStepIndex,
              requestedToolCalls: listRequestedToolCallsFromProviderEvent(nextStepItem.value),
            });
            logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_event.yielded", {
              responseStepIndex,
              eventType: nextStepItem.value.type,
              ...summarizeProviderStreamEventForDiagnostics(nextStepItem.value),
            });
            yield nextStepItem.value;
            continue;
          }

          logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_event.yielded", {
            responseStepIndex,
            eventType: nextStepItem.value.type,
            ...summarizeProviderStreamEventForDiagnostics(nextStepItem.value),
          });
          yield nextStepItem.value;
        }
      } finally {
        responseStepStreamSlot?.release();
      }

      if (!terminalState) {
        throw new Error("OpenAI response step ended without a terminal state");
      }

      if (isOpenAiResponseStepFunctionCallTerminalState(terminalState)) {
        const providerFunctionCallIntents = listProviderFunctionCallIntentsFromTerminalState(terminalState);
        const providerFunctionCallIntentClassification = classifyOpenAiProviderFunctionCallIntents(providerFunctionCallIntents);
        const requestedToolCalls = providerFunctionCallIntentClassification.requestedToolCalls;
        const invalidFunctionCallIntents = providerFunctionCallIntentClassification.invalidFunctionCallIntents;
        const onlyRequestedToolCall = requestedToolCalls.length === 1 ? requestedToolCalls[0] : undefined;
        observeRequestedToolCallsForTurnLimitsAndDiagnostics({
          responseStepIndex,
          requestedToolCalls,
        });
        accumulatedOpenAiTurnUsage = addTokenUsage(accumulatedOpenAiTurnUsage, terminalState.usage);
        const responseReplayItems = createOpenAiResponseReplayItems(terminalState.responseOutputItems);
        const toolCallTerminalDebugSummary = {
          functionCallCount: providerFunctionCallIntents.length,
          toolCallCount: requestedToolCalls.length,
          invalidFunctionCallCount: invalidFunctionCallIntents.length,
          toolCallIds: requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId),
          toolNames: requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallRequest.toolName),
          invalidFunctionCallIds: invalidFunctionCallIntents.map((invalidFunctionCallIntent) => invalidFunctionCallIntent.functionCallId),
          invalidFunctionNames: invalidFunctionCallIntents.map((invalidFunctionCallIntent) => invalidFunctionCallIntent.functionName),
          responseStepIndex,
          responseOutputItemCount: terminalState.responseOutputItems.length,
          continuationInputItemCount: responseReplayItems.continuationInputItems.length,
          providerTurnReplayInputItemCount: responseReplayItems.providerTurnReplayInputItems.length,
          ...(onlyRequestedToolCall
            ? summarizeOpenAiToolCallRequestForDiagnostics(onlyRequestedToolCall.toolCallRequest)
            : {}),
          ...summarizeTokenUsageForDiagnostics(terminalState.usage),
        };
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.tool_call_terminal_observed", toolCallTerminalDebugSummary);
        await writeOpenAiDebugLog("OpenAI tool-call terminal state", toolCallTerminalDebugSummary);
        for (const providerFunctionCallIntent of providerFunctionCallIntents) {
          if (!responseReplayItems.providerTurnReplayInputItems.some(isMatchingFunctionCallReplayItem(providerFunctionCallIntent.functionCallId))) {
            throw new Error(
              `OpenAI response omitted a replayable function_call item for function call ${providerFunctionCallIntent.functionCallId}.`,
            );
          }
        }

        this.openAiConversationInputItems.push(...responseReplayItems.continuationInputItems);
        this.providerTurnReplayInputItems.push(...responseReplayItems.providerTurnReplayInputItems);
        const toolResultSubmissions = requestedToolCalls.length > 0
          ? await this.waitForToolResultSubmissions(requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId))
          : [];
        const toolResultSubmissionByToolCallId = new Map(
          toolResultSubmissions.map((toolResultSubmission) => [toolResultSubmission.toolCallId, toolResultSubmission]),
        );
        const functionCallOutputInputItems = providerFunctionCallIntents.map((providerFunctionCallIntent) => {
          switch (providerFunctionCallIntent.intentKind) {
            case "invalid_function_call":
              return createFunctionCallOutputInputItem(
                providerFunctionCallIntent.functionCallId,
                createInvalidFunctionCallOutputText(providerFunctionCallIntent),
              );
            case "executable_tool": {
              const toolResultSubmission = toolResultSubmissionByToolCallId.get(providerFunctionCallIntent.functionCallId);
              if (!toolResultSubmission) {
                throw new Error(`OpenAI provider turn is missing a tool result for ${providerFunctionCallIntent.functionCallId}.`);
              }

              return createFunctionCallOutputInputItem(
                toolResultSubmission.toolCallId,
                toolResultSubmission.toolResultText,
              );
            }
            default:
              return assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent);
          }
        });
        const toolResultDebugSummary = {
          responseStepIndex,
          functionCallCount: providerFunctionCallIntents.length,
          toolCallCount: toolResultSubmissions.length,
          invalidFunctionCallCount: invalidFunctionCallIntents.length,
          toolCallIds: toolResultSubmissions.map((toolResultSubmission) => toolResultSubmission.toolCallId),
          invalidFunctionCallIds: invalidFunctionCallIntents.map((invalidFunctionCallIntent) => invalidFunctionCallIntent.functionCallId),
          toolResultTextLengths: toolResultSubmissions.map((toolResultSubmission) => toolResultSubmission.toolResultText.length),
        };
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.tool_result_recorded_for_continuation", toolResultDebugSummary);
        await writeOpenAiDebugLog("OpenAI tool result submission", toolResultDebugSummary);
        this.openAiConversationInputItems.push(...functionCallOutputInputItems);
        this.providerTurnReplayInputItems.push(...functionCallOutputInputItems);
        continue;
      }

      if (terminalState.terminalKind === "completed") {
        if (!terminalUsageProviderEvent || terminalUsageProviderEvent.type !== "completed") {
          throw new Error("OpenAI completed response ended without a completed usage event");
        }

        const completedProviderEvent = {
          ...terminalUsageProviderEvent,
          usage: accumulatedOpenAiTurnUsage ?? terminalUsageProviderEvent.usage,
          contextWindowUsage: terminalUsageProviderEvent.contextWindowUsage ?? terminalUsageProviderEvent.usage,
        };
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.completed", {
          responseStepCount: responseStepIndex,
          requestedToolCallCount,
          durationMs: Date.now() - turnStartedAtMs,
          ...summarizeTokenUsageForDiagnostics(completedProviderEvent.usage),
        });
        yield completedProviderEvent;
        return;
      }

      if (!terminalUsageProviderEvent || terminalUsageProviderEvent.type !== "incomplete") {
        throw new Error("OpenAI incomplete response ended without an incomplete usage event");
      }

      const incompleteProviderEvent = {
        ...terminalUsageProviderEvent,
        usage: accumulatedOpenAiTurnUsage ?? terminalUsageProviderEvent.usage,
        contextWindowUsage: terminalUsageProviderEvent.contextWindowUsage ?? terminalUsageProviderEvent.usage,
      };
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.incomplete", {
        responseStepCount: responseStepIndex,
        requestedToolCallCount,
        durationMs: Date.now() - turnStartedAtMs,
        incompleteReason: incompleteProviderEvent.incompleteReason,
        ...summarizeTokenUsageForDiagnostics(incompleteProviderEvent.usage),
      });
      yield incompleteProviderEvent;
      return;
    }
  }

  private waitForToolResultSubmission(toolCallId: string): Promise<OpenAiProviderToolResultSubmission> {
    const queuedToolResultSubmission = this.queuedToolResultSubmissionByToolCallId.get(toolCallId);
    if (queuedToolResultSubmission) {
      this.queuedToolResultSubmissionByToolCallId.delete(toolCallId);
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "tool_result_submission.consumed_queued", {
        toolCallId,
        toolResultTextLength: queuedToolResultSubmission.toolResultText.length,
      });
      return Promise.resolve(queuedToolResultSubmission);
    }

    if (this.abortSignal?.aborted) {
      return Promise.reject(new Error("OpenAI provider turn interrupted while waiting for tool result"));
    }

    logOpenAiDiagnosticEvent(this.diagnosticLogger, "tool_result_submission.wait_started", {
      toolCallId,
    });
    return new Promise<OpenAiProviderToolResultSubmission>((resolveSubmission, rejectSubmission) => {
      const pendingSubmissionWait: PendingOpenAiToolResultSubmissionWait = {
        resolveSubmission,
        rejectSubmission,
      };
      const abortListener = (): void => {
        this.clearPendingToolResultSubmissionWait(toolCallId, pendingSubmissionWait);
        rejectSubmission(new Error("OpenAI provider turn interrupted while waiting for tool result"));
      };
      pendingSubmissionWait.abortListener = abortListener;
      this.pendingToolResultSubmissionWaitByToolCallId.set(toolCallId, pendingSubmissionWait);
      this.abortSignal?.addEventListener("abort", abortListener, { once: true });
      if (this.abortSignal?.aborted) {
        abortListener();
      }
    });
  }

  private waitForToolResultSubmissions(toolCallIds: readonly string[]): Promise<OpenAiProviderToolResultSubmission[]> {
    return Promise.all(toolCallIds.map((toolCallId) => this.waitForToolResultSubmission(toolCallId)));
  }

  private clearPendingToolResultSubmissionWait(
    toolCallId: string,
    pendingSubmissionWait: PendingOpenAiToolResultSubmissionWait,
  ): void {
    this.pendingToolResultSubmissionWaitByToolCallId.delete(toolCallId);
    if (pendingSubmissionWait.abortListener) {
      this.abortSignal?.removeEventListener("abort", pendingSubmissionWait.abortListener);
    }
  }

  private logProviderTurnSoftDiagnosticWarnings(input: {
    responseStepIndex: number;
    requestedToolCallCount: number;
    previousRequestedToolCallCount: number;
    currentResponseStepToolCallCount: number;
    requestedToolCalls: readonly ProviderRequestedToolCall[];
    toolCallPatternObservationCountByFingerprint: Map<string, number>;
  }): void {
    if (
      input.previousRequestedToolCallCount < this.toolCallDiagnosticWarningThreshold &&
      input.requestedToolCallCount >= this.toolCallDiagnosticWarningThreshold
    ) {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.tool_call_warning_threshold_reached", {
        responseStepIndex: input.responseStepIndex,
        requestedToolCallCount: input.requestedToolCallCount,
        toolCallDiagnosticWarningThreshold: this.toolCallDiagnosticWarningThreshold,
        currentResponseStepToolCallCount: input.currentResponseStepToolCallCount,
      });
    }

    for (const requestedToolCall of input.requestedToolCalls) {
      const toolCallPatternDiagnosticFields = summarizeToolCallPatternForDiagnostics(requestedToolCall.toolCallRequest);
      const toolCallPatternFingerprint = createToolCallPatternDiagnosticFingerprint(toolCallPatternDiagnosticFields);
      const toolCallPatternObservationCount =
        (input.toolCallPatternObservationCountByFingerprint.get(toolCallPatternFingerprint) ?? 0) + 1;
      input.toolCallPatternObservationCountByFingerprint.set(toolCallPatternFingerprint, toolCallPatternObservationCount);
      if (toolCallPatternObservationCount !== this.repeatedToolCallDiagnosticWarningThreshold) {
        continue;
      }

      logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.repeated_tool_call_pattern_observed", {
        responseStepIndex: input.responseStepIndex,
        requestedToolCallCount: input.requestedToolCallCount,
        toolCallPatternObservationCount,
        repeatedToolCallDiagnosticWarningThreshold: this.repeatedToolCallDiagnosticWarningThreshold,
        ...toolCallPatternDiagnosticFields,
      });
    }
  }
}

function normalizeOptionalPositiveIntegerLimit(requestedLimit: number | undefined): number | undefined {
  if (requestedLimit === undefined || !Number.isFinite(requestedLimit)) {
    return undefined;
  }

  return Math.max(1, Math.floor(requestedLimit));
}

function normalizePositiveIntegerThreshold(requestedThreshold: number | undefined, defaultThreshold: number): number {
  if (requestedThreshold === undefined || !Number.isFinite(requestedThreshold)) {
    return defaultThreshold;
  }

  return Math.max(1, Math.floor(requestedThreshold));
}

function createToolCallPatternDiagnosticFingerprint(diagnosticFields: BuliDiagnosticLogFields): string {
  return JSON.stringify(
    Object.entries(diagnosticFields).sort(([leftFieldName], [rightFieldName]) => leftFieldName.localeCompare(rightFieldName)),
  );
}

function summarizeToolCallPatternForDiagnostics(toolCallRequest: ToolCallRequest): BuliDiagnosticLogFields {
  switch (toolCallRequest.toolName) {
    case "bash":
      return summarizeOpenAiToolCallRequestForDiagnostics(toolCallRequest);
    case "read":
      return {
        toolName: toolCallRequest.toolName,
        readTargetPathLength: toolCallRequest.readTargetPath.length,
        hasOffsetLineNumber: toolCallRequest.offsetLineNumber !== undefined,
        hasMaximumLineCount: toolCallRequest.maximumLineCount !== undefined,
      };
    case "read_many":
      return {
        toolName: toolCallRequest.toolName,
        readTargetCount: toolCallRequest.readTargets.length,
        readTargetPathLength: toolCallRequest.readTargets.reduce(
          (totalPathLength, readTarget) => totalPathLength + readTarget.readTargetPath.length,
          0,
        ),
        readTargetWithOffsetCount: toolCallRequest.readTargets.filter((readTarget) => readTarget.offsetLineNumber !== undefined).length,
        readTargetWithMaximumLineCountCount: toolCallRequest.readTargets.filter((readTarget) =>
          readTarget.maximumLineCount !== undefined
        ).length,
      };
    case "search_many":
      return {
        toolName: toolCallRequest.toolName,
        searchCount: toolCallRequest.searches.length,
        globSearchCount: toolCallRequest.searches.filter((search) => search.searchKind === "glob").length,
        grepSearchCount: toolCallRequest.searches.filter((search) => search.searchKind === "grep").length,
      };
    case "glob":
      return {
        toolName: toolCallRequest.toolName,
        globPatternLength: toolCallRequest.globPattern.length,
        hasSearchDirectoryPath: toolCallRequest.searchDirectoryPath !== undefined,
      };
    case "grep":
      return {
        toolName: toolCallRequest.toolName,
        regexPatternLength: toolCallRequest.regexPattern.length,
        hasSearchPath: toolCallRequest.searchPath !== undefined,
        hasIncludeGlobPattern: toolCallRequest.includeGlobPattern !== undefined,
      };
    case "edit":
      return {
        toolName: toolCallRequest.toolName,
        editTargetPathLength: toolCallRequest.editTargetPath.length,
        oldStringLength: toolCallRequest.oldString.length,
        newStringLength: toolCallRequest.newString.length,
      };
    case "edit_many":
      return {
        toolName: toolCallRequest.toolName,
        editCount: toolCallRequest.edits.length,
        editTargetPathLengths: toolCallRequest.edits.map((edit) => edit.editTargetPath.length),
      };
    case "patch":
    case "patch_many":
      return {
        toolName: toolCallRequest.toolName,
        patchTextLength: toolCallRequest.patchText.length,
      };
    case "write":
      return {
        toolName: toolCallRequest.toolName,
        writeTargetPathLength: toolCallRequest.writeTargetPath.length,
        fileContentLength: toolCallRequest.fileContent.length,
      };
    case "task":
      return {
        toolName: toolCallRequest.toolName,
        subagentDescriptionLength: toolCallRequest.subagentDescription.length,
        subagentPromptLength: toolCallRequest.subagentPrompt.length,
      };
    default:
      return assertUnhandledToolCallPatternSummary(toolCallRequest);
  }
}

function assertUnhandledToolCallPatternSummary(unhandledToolCallRequest: never): never {
  throw new Error(`Unhandled tool call pattern summary: ${JSON.stringify(unhandledToolCallRequest)}`);
}

function isMatchingFunctionCallReplayItem(toolCallId: string) {
  return (openAiInputItem: OpenAiProviderTurnReplayInputItem): boolean =>
    openAiInputItem.type === "function_call" && openAiInputItem.call_id === toolCallId;
}

function isOpenAiResponseStepFunctionCallTerminalState(
  terminalState: OpenAiResponseStepTerminalState,
): terminalState is OpenAiResponseStepToolCallTerminalState {
  return (
    terminalState.terminalKind === "tool_call_requested" ||
    terminalState.terminalKind === "tool_calls_requested" ||
    terminalState.terminalKind === "provider_function_calls_requested"
  );
}

function listProviderFunctionCallIntentsFromTerminalState(
  terminalState: OpenAiResponseStepToolCallTerminalState,
): OpenAiProviderFunctionCallIntent[] {
  if (terminalState.terminalKind === "provider_function_calls_requested") {
    return [...terminalState.providerFunctionCallIntents];
  }

  return listRequestedToolCallsFromTerminalState(terminalState).map((requestedToolCall) => ({
    intentKind: "executable_tool",
    functionCallId: requestedToolCall.toolCallId,
    toolCallRequest: requestedToolCall.toolCallRequest,
  }));
}

function listRequestedToolCallsFromTerminalState(
  terminalState: Exclude<OpenAiResponseStepToolCallTerminalState, { terminalKind: "provider_function_calls_requested" }>,
): ProviderRequestedToolCall[] {
  if (terminalState.terminalKind === "tool_calls_requested") {
    return [...terminalState.requestedToolCalls];
  }

  return [{
    toolCallId: terminalState.toolCallId,
    toolCallRequest: terminalState.toolCallRequest,
  }];
}

function listRequestedToolCallsFromProviderEvent(
  providerStreamEvent: Extract<ProviderStreamEvent, { type: "tool_call_requested" | "tool_calls_requested" }>,
): ProviderRequestedToolCall[] {
  if (providerStreamEvent.type === "tool_calls_requested") {
    return [...providerStreamEvent.requestedToolCalls];
  }

  return [{
    toolCallId: providerStreamEvent.toolCallId,
    toolCallRequest: providerStreamEvent.toolCallRequest,
  }];
}

function summarizeProviderStreamEventForDiagnostics(providerStreamEvent: ProviderStreamEvent): BuliDiagnosticLogFields {
  if (providerStreamEvent.type === "reasoning_summary_started") {
    return {};
  }

  if (providerStreamEvent.type === "text_chunk") {
    return {
      textLength: providerStreamEvent.text.length,
    };
  }

  if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
    return {
      textLength: providerStreamEvent.text.length,
    };
  }

  if (providerStreamEvent.type === "reasoning_summary_completed") {
    return {
      reasoningDurationMs: providerStreamEvent.reasoningDurationMs,
    };
  }

  if (providerStreamEvent.type === "tool_call_requested") {
    return {
      toolCallId: providerStreamEvent.toolCallId,
      ...summarizeOpenAiToolCallRequestForDiagnostics(providerStreamEvent.toolCallRequest),
    };
  }

  if (providerStreamEvent.type === "tool_calls_requested") {
    return {
      toolCallCount: providerStreamEvent.requestedToolCalls.length,
      toolCallIds: providerStreamEvent.requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId),
      toolNames: providerStreamEvent.requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallRequest.toolName),
    };
  }

  if (providerStreamEvent.type === "rate_limit_pending") {
    return {
      retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
      ...(providerStreamEvent.retryWaitStartedAtMs !== undefined
        ? { retryWaitStartedAtMs: providerStreamEvent.retryWaitStartedAtMs }
        : {}),
      limitExplanationLength: providerStreamEvent.limitExplanation.length,
    };
  }

  if (providerStreamEvent.type === "plan_proposed") {
    return {
      planId: providerStreamEvent.planId,
      planTitleLength: providerStreamEvent.planTitle.length,
      planStepCount: providerStreamEvent.planSteps.length,
    };
  }

  if (providerStreamEvent.type === "incomplete") {
    return {
      incompleteReason: providerStreamEvent.incompleteReason,
      ...summarizeTokenUsageForDiagnostics(providerStreamEvent.usage),
    };
  }

  return summarizeTokenUsageForDiagnostics(providerStreamEvent.usage);
}

function createInvalidFunctionCallOutputText(invalidFunctionCallIntent: OpenAiInvalidFunctionCallIntent): string {
  return [
    `Invalid function call: ${invalidFunctionCallIntent.functionName}`,
    `Reason: ${invalidFunctionCallIntent.invalidCallExplanation}`,
    "The function call was not executed. Retry with valid JSON arguments that satisfy the expected schema.",
  ].join("\n");
}

function assertUnhandledOpenAiProviderFunctionCallIntent(providerFunctionCallIntent: never): never {
  throw new Error(`Unhandled OpenAI provider function-call intent: ${String(providerFunctionCallIntent)}`);
}

async function createFailedResponseDebugPayload(response: OpenAiHttpErrorResponse): Promise<{
  status: number;
  requestId: string | null;
  contentType: string | null;
  bodyTextLength: number;
  structuredErrorMessage: string | null;
}> {
  const bodyText = await response.text();
  const structuredErrorMessage = extractStructuredOpenAiErrorMessage(bodyText);
  return {
    status: response.status,
    requestId: getOpenAiRequestId(response.headers) ?? null,
    contentType: response.headers.get("content-type"),
    bodyTextLength: bodyText.length,
    structuredErrorMessage: structuredErrorMessage ? sanitizeOpenAiErrorMessage(structuredErrorMessage) : null,
  };
}
