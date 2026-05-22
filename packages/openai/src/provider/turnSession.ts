import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
  ProviderAvailablePresentationFunctionName,
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
import {
  createOpenAiResponsesHttpRequestBody,
  summarizeOpenAiResponsesRequestForDiagnostics,
} from "./openAiResponsesRequest.ts";
import { parseOpenAiStream, type OpenAiResponseStepTerminalState } from "./stream.ts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import {
  type OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent,
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
  readonly availablePresentationFunctionNames: readonly ProviderAvailablePresentationFunctionName[] | undefined;
  readonly abortSignal: AbortSignal | undefined;
  readonly systemPromptText: string;
  readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  readonly onStepRequestFailed: (response: Response) => Promise<Error>;
  readonly maxResponseStepsPerTurn: number | undefined;
  readonly maxToolCallsPerTurn: number | undefined;
  readonly responseStepDiagnosticWarningThreshold: number | undefined;
  readonly toolCallDiagnosticWarningThreshold: number | undefined;
  readonly repeatedToolCallDiagnosticWarningThreshold: number | undefined;
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
    availablePresentationFunctionNames?: readonly ProviderAvailablePresentationFunctionName[] | undefined;
    abortSignal?: AbortSignal;
    systemPromptText: string;
    conversationSessionEntries: readonly ConversationSessionEntry[];
    onStepRequestFailed: (response: Response) => Promise<Error>;
    maxResponseStepsPerTurn?: number;
    maxToolCallsPerTurn?: number;
    responseStepDiagnosticWarningThreshold?: number;
    toolCallDiagnosticWarningThreshold?: number;
    repeatedToolCallDiagnosticWarningThreshold?: number;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  }) {
    this.endpoint = input.endpoint;
    this.fetchImpl = input.fetchImpl;
    this.loadRequestHeaders = input.loadRequestHeaders;
    this.selectedModelId = input.selectedModelId;
    this.selectedReasoningEffort = input.selectedReasoningEffort;
    this.promptCacheKey = input.promptCacheKey;
    this.availableToolNames = input.availableToolNames;
    this.availablePresentationFunctionNames = input.availablePresentationFunctionNames;
    this.abortSignal = input.abortSignal;
    this.systemPromptText = input.systemPromptText;
    this.diagnosticLogger = input.diagnosticLogger;
    this.onStepRequestFailed = input.onStepRequestFailed;
    this.maxResponseStepsPerTurn = normalizeOptionalPositiveIntegerLimit(input.maxResponseStepsPerTurn);
    this.maxToolCallsPerTurn = normalizeOptionalPositiveIntegerLimit(input.maxToolCallsPerTurn);
    this.responseStepDiagnosticWarningThreshold = normalizeOptionalPositiveIntegerLimit(
      input.responseStepDiagnosticWarningThreshold,
    );
    this.toolCallDiagnosticWarningThreshold = normalizeOptionalPositiveIntegerLimit(
      input.toolCallDiagnosticWarningThreshold,
    );
    this.repeatedToolCallDiagnosticWarningThreshold = normalizeOptionalPositiveIntegerLimit(
      input.repeatedToolCallDiagnosticWarningThreshold,
    );
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
    const toolCallPatternObservationCountByKey = new Map<string, number>();
    const turnStartedAtMs = Date.now();

    while (true) {
      responseStepIndex += 1;
      if (this.maxResponseStepsPerTurn !== undefined && responseStepIndex > this.maxResponseStepsPerTurn) {
        throw new Error(`OpenAI response step limit exceeded after ${this.maxResponseStepsPerTurn} steps.`);
      }
      const responseStepStartedAtMs = Date.now();
      const requestBody = createOpenAiResponsesHttpRequestBody({
        selectedModelId: this.selectedModelId,
        ...(this.selectedReasoningEffort ? { selectedReasoningEffort: this.selectedReasoningEffort } : {}),
        ...(this.promptCacheKey ? { promptCacheKey: this.promptCacheKey } : {}),
        ...(this.availableToolNames ? { availableToolNames: this.availableToolNames } : {}),
        ...(this.availablePresentationFunctionNames
          ? { availablePresentationFunctionNames: this.availablePresentationFunctionNames }
          : {}),
        systemPromptText: this.systemPromptText,
        openAiInputItems: this.openAiConversationInputItems,
      });
      const requestDebugSummary = summarizeOpenAiResponsesRequestForDiagnostics({
        requestBody,
        responseStepIndex,
      });
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.request_prepared", requestDebugSummary);
      await writeOpenAiDebugLog("OpenAI responses request", requestDebugSummary);

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: await this.loadRequestHeaders(),
        body: JSON.stringify(requestBody),
        ...(this.abortSignal ? { signal: this.abortSignal } : {}),
      });
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.response_received", {
        responseStepIndex,
        status: response.status,
        requestId: getOpenAiRequestId(response.headers) ?? null,
        contentType: response.headers.get("content-type") ?? null,
        durationMs: Date.now() - responseStepStartedAtMs,
      });

      if (!response.ok) {
        const failedResponseDebugPayload = await createFailedResponseDebugPayload(response.clone());
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.request_failed", {
          responseStepIndex,
          ...failedResponseDebugPayload,
        });
        await writeOpenAiDebugLog("OpenAI responses request failed", failedResponseDebugPayload);
        throw await this.onStepRequestFailed(response);
      }

      const openAiStepEventIterator = parseOpenAiStream(response, {
        diagnosticLogger: this.diagnosticLogger,
      })[Symbol.asyncIterator]();
      let terminalState: OpenAiResponseStepTerminalState | undefined;
      let terminalUsageProviderEvent: OpenAiTerminalUsageProviderEvent | undefined;
      const pendingExecutableToolCallProviderEvents: ProviderStreamEvent[] = [];
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
          pendingExecutableToolCallProviderEvents.push(nextStepItem.value);
          continue;
        }

        logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_event.yielded", {
          responseStepIndex,
          eventType: nextStepItem.value.type,
          ...summarizeProviderStreamEventForDiagnostics(nextStepItem.value),
        });
        yield nextStepItem.value;
      }

      if (!terminalState) {
        throw new Error("OpenAI response step ended without a terminal state");
      }

      if (isOpenAiResponseStepFunctionCallTerminalState(terminalState)) {
        const providerFunctionCallIntents = listProviderFunctionCallIntentsFromTerminalState(terminalState);
        const providerFunctionCallIntentClassification = classifyOpenAiProviderFunctionCallIntents(providerFunctionCallIntents);
        const requestedToolCalls = providerFunctionCallIntentClassification.requestedToolCalls;
        const presentationFunctionCallIntents = providerFunctionCallIntentClassification.presentationFunctionCallIntents;
        const onlyRequestedToolCall = requestedToolCalls.length === 1 ? requestedToolCalls[0] : undefined;
        const previousRequestedToolCallCount = requestedToolCallCount;
        requestedToolCallCount += requestedToolCalls.length;
        this.logProviderTurnSoftDiagnosticWarnings({
          responseStepIndex,
          requestedToolCallCount,
          previousRequestedToolCallCount,
          currentResponseStepToolCallCount: requestedToolCalls.length,
          requestedToolCalls,
          toolCallPatternObservationCountByKey,
        });
        if (this.maxToolCallsPerTurn !== undefined && requestedToolCallCount > this.maxToolCallsPerTurn) {
          throw new Error(
            `OpenAI tool-call limit exceeded: requested ${requestedToolCallCount} tool calls (max ${this.maxToolCallsPerTurn}).`,
          );
        }
        accumulatedOpenAiTurnUsage = addTokenUsage(accumulatedOpenAiTurnUsage, terminalState.usage);
        const responseReplayItems = createOpenAiResponseReplayItems(terminalState.responseOutputItems);
        const toolCallTerminalDebugSummary = {
          functionCallCount: providerFunctionCallIntents.length,
          toolCallCount: requestedToolCalls.length,
          presentationFunctionCallCount: presentationFunctionCallIntents.length,
          toolCallIds: requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId),
          toolNames: requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallRequest.toolName),
          presentationCallIds: presentationFunctionCallIntents.map((presentationFunctionCallIntent) => presentationFunctionCallIntent.functionCallId),
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

        for (const pendingExecutableToolCallProviderEvent of pendingExecutableToolCallProviderEvents) {
          logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_event.yielded", {
            responseStepIndex,
            eventType: pendingExecutableToolCallProviderEvent.type,
            ...summarizeProviderStreamEventForDiagnostics(pendingExecutableToolCallProviderEvent),
          });
          yield pendingExecutableToolCallProviderEvent;
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
            case "code_execution_walkthrough_presentation":
              return createFunctionCallOutputInputItem(
                providerFunctionCallIntent.functionCallId,
                createCodeExecutionWalkthroughPresentationFunctionOutputText(providerFunctionCallIntent),
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
          presentationFunctionCallCount: presentationFunctionCallIntents.length,
          toolCallIds: toolResultSubmissions.map((toolResultSubmission) => toolResultSubmission.toolCallId),
          presentationCallIds: presentationFunctionCallIntents.map((presentationFunctionCallIntent) => presentationFunctionCallIntent.functionCallId),
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
    toolCallPatternObservationCountByKey: Map<string, number>;
  }): void {
    if (input.responseStepIndex === this.responseStepDiagnosticWarningThreshold) {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.response_step_warning_threshold_reached", {
        responseStepIndex: input.responseStepIndex,
        responseStepDiagnosticWarningThreshold: this.responseStepDiagnosticWarningThreshold,
        requestedToolCallCount: input.currentResponseStepToolCallCount,
      });
    }

    if (
      this.toolCallDiagnosticWarningThreshold !== undefined &&
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

    if (this.repeatedToolCallDiagnosticWarningThreshold === undefined) {
      return;
    }

    for (const requestedToolCall of input.requestedToolCalls) {
      const toolCallPatternKey = createToolCallPatternDiagnosticKey(requestedToolCall.toolCallRequest);
      const toolCallPatternObservationCount =
        (input.toolCallPatternObservationCountByKey.get(toolCallPatternKey) ?? 0) + 1;
      input.toolCallPatternObservationCountByKey.set(toolCallPatternKey, toolCallPatternObservationCount);
      if (toolCallPatternObservationCount !== this.repeatedToolCallDiagnosticWarningThreshold) {
        continue;
      }

      logOpenAiDiagnosticEvent(this.diagnosticLogger, "provider_turn.repeated_tool_call_pattern_observed", {
        responseStepIndex: input.responseStepIndex,
        toolCallPatternObservationCount,
        repeatedToolCallDiagnosticWarningThreshold: this.repeatedToolCallDiagnosticWarningThreshold,
        ...summarizeToolCallPatternForDiagnostics(requestedToolCall.toolCallRequest),
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

function createToolCallPatternDiagnosticKey(toolCallRequest: ToolCallRequest): string {
  switch (toolCallRequest.toolName) {
    case "bash":
      return [
        toolCallRequest.toolName,
        toolCallRequest.workingDirectoryPath !== undefined,
        toolCallRequest.timeoutMilliseconds !== undefined,
      ].join(":");
    case "read":
      return [
        toolCallRequest.toolName,
        toolCallRequest.offsetLineNumber !== undefined,
        toolCallRequest.maximumLineCount !== undefined,
      ].join(":");
    case "glob":
      return [toolCallRequest.toolName, toolCallRequest.searchDirectoryPath !== undefined].join(":");
    case "grep":
      return [
        toolCallRequest.toolName,
        toolCallRequest.searchPath !== undefined,
        toolCallRequest.includeGlobPattern !== undefined,
      ].join(":");
    case "edit":
    case "write":
    case "task":
      return toolCallRequest.toolName;
    default:
      return assertUnhandledToolCallPatternDiagnosticKey(toolCallRequest);
  }
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
    case "write":
      return {
        toolName: toolCallRequest.toolName,
        writeTargetPathLength: toolCallRequest.writeTargetPath.length,
        fileContentLength: toolCallRequest.fileContent.length,
      };
    case "task":
      return {
        toolName: toolCallRequest.toolName,
        subagentName: toolCallRequest.subagentName,
        subagentDescriptionLength: toolCallRequest.subagentDescription.length,
        subagentPromptLength: toolCallRequest.subagentPrompt.length,
      };
    default:
      return assertUnhandledToolCallPatternSummary(toolCallRequest);
  }
}

function assertUnhandledToolCallPatternDiagnosticKey(unhandledToolCallRequest: never): never {
  throw new Error(`Unhandled tool call pattern key: ${JSON.stringify(unhandledToolCallRequest)}`);
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

  if (providerStreamEvent.type === "code_execution_walkthrough_presented") {
    return {
      presentationCallId: providerStreamEvent.presentationCallId,
      codeExecutionWalkthroughTitleLength: providerStreamEvent.codeExecutionWalkthrough.titleText.length,
      codeExecutionWalkthroughStepCount: providerStreamEvent.codeExecutionWalkthrough.steps.length,
      codeExecutionWalkthroughCodeExampleCount: providerStreamEvent.codeExecutionWalkthrough.steps.reduce(
        (codeExampleCount, walkthroughStep) => codeExampleCount + walkthroughStep.codeExamples.length,
        0,
      ),
    };
  }

  if (providerStreamEvent.type === "rate_limit_pending") {
    return {
      retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
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

function createCodeExecutionWalkthroughPresentationFunctionOutputText(
  presentationFunctionCallIntent: OpenAiCodeExecutionWalkthroughPresentationFunctionCallIntent,
): string {
  return `Rendered code execution walkthrough: ${presentationFunctionCallIntent.codeExecutionWalkthrough.titleText}`;
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
