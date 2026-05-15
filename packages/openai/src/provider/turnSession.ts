import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
  ProviderAvailableToolName,
  ProviderStreamEvent,
  ReasoningEffort,
  TokenUsage,
} from "@buli/contracts";
import {
  createFunctionCallOutputInputItem,
  createOpenAiResponseReplayItems,
  createOpenAiResponsesInputItems,
  type OpenAiConversationInputItem,
} from "./request.ts";
import { writeOpenAiDebugLog } from "./debugLog.ts";
import { createOpenAiToolDefinitions } from "./toolDefinitions.ts";
import { parseOpenAiStream, type OpenAiResponseStepTerminalState } from "./stream.ts";

type OpenAiProviderToolResultSubmission = {
  toolCallId: string;
  toolResultText: string;
};

type OpenAiTerminalUsageProviderEvent = Extract<ProviderStreamEvent, { type: "completed" | "incomplete" }>;

type OpenAiReasoningRequest = {
  effort?: ReasoningEffort;
  summary?: "auto";
};

type HttpErrorDebugResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

function createHttpRequestBody(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  promptCacheKey?: string;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  systemPromptText: string;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}) {
  const reasoningRequest = createReasoningRequest(input);
  return {
    model: input.selectedModelId,
    instructions: input.systemPromptText,
    store: false,
    ...(input.promptCacheKey ? { prompt_cache_key: input.promptCacheKey } : {}),
    input: input.openAiInputItems,
    tools: createOpenAiToolDefinitions({ availableToolNames: input.availableToolNames }),
    parallel_tool_calls: false,
    ...(shouldIncludeReasoningEncryptedContent(input) ? { include: ["reasoning.encrypted_content"] } : {}),
    ...(reasoningRequest ? { reasoning: reasoningRequest } : {}),
    stream: true,
  };
}

type OpenAiResponsesHttpRequestBody = ReturnType<typeof createHttpRequestBody>;

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
  readonly openAiConversationInputItems: OpenAiConversationInputItem[];
  readonly providerTurnReplayInputItems: OpenAiProviderTurnReplayInputItem[];
  readonly queuedToolResultSubmissionByToolCallId: Map<string, OpenAiProviderToolResultSubmission>;
  readonly pendingToolResultSubmissionResolverByToolCallId: Map<
    string,
    (toolResultSubmission: OpenAiProviderToolResultSubmission) => void
  >;
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
    this.openAiConversationInputItems = createOpenAiResponsesInputItems(input.conversationSessionEntries);
    this.providerTurnReplayInputItems = [];
    this.queuedToolResultSubmissionByToolCallId = new Map<string, OpenAiProviderToolResultSubmission>();
    this.pendingToolResultSubmissionResolverByToolCallId = new Map<
      string,
      (toolResultSubmission: OpenAiProviderToolResultSubmission) => void
    >();
  }

  async submitToolResult(input: OpenAiProviderToolResultSubmission): Promise<void> {
    const resolveSubmission = this.pendingToolResultSubmissionResolverByToolCallId.get(input.toolCallId);
    if (resolveSubmission) {
      this.pendingToolResultSubmissionResolverByToolCallId.delete(input.toolCallId);
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "tool_result_submission.resolved_pending_wait", {
        toolCallId: input.toolCallId,
        toolResultTextLength: input.toolResultText.length,
      });
      resolveSubmission(input);
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
    const turnStartedAtMs = Date.now();

    while (true) {
      responseStepIndex += 1;
      const responseStepStartedAtMs = Date.now();
      const requestBody = createHttpRequestBody({
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

      if (terminalState.terminalKind === "tool_call_requested") {
        requestedToolCallCount += 1;
        accumulatedOpenAiTurnUsage = addTokenUsage(accumulatedOpenAiTurnUsage, terminalState.usage);
        const responseReplayItems = createOpenAiResponseReplayItems(terminalState.responseOutputItems);
        const toolCallTerminalDebugSummary = {
          toolCallId: terminalState.toolCallId,
          toolName: terminalState.toolCallRequest.toolName,
          responseStepIndex,
          responseOutputItemCount: terminalState.responseOutputItems.length,
          continuationInputItemCount: responseReplayItems.continuationInputItems.length,
          providerTurnReplayInputItemCount: responseReplayItems.providerTurnReplayInputItems.length,
          ...(terminalState.toolCallRequest.toolName === "bash"
            ? {
                shellCommandLength: terminalState.toolCallRequest.shellCommand.length,
                commandDescriptionLength: terminalState.toolCallRequest.commandDescription.length,
                hasWorkingDirectoryPath: terminalState.toolCallRequest.workingDirectoryPath !== undefined,
                hasTimeoutMilliseconds: terminalState.toolCallRequest.timeoutMilliseconds !== undefined,
              }
            : {}),
          ...summarizeTokenUsageForDiagnostics(terminalState.usage),
        };
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.tool_call_terminal_observed", toolCallTerminalDebugSummary);
        await writeOpenAiDebugLog("OpenAI tool-call terminal state", toolCallTerminalDebugSummary);
        if (!responseReplayItems.providerTurnReplayInputItems.some(isMatchingFunctionCallReplayItem(terminalState.toolCallId))) {
          throw new Error(
            `OpenAI response omitted a replayable function_call item for tool call ${terminalState.toolCallId}.`,
          );
        }

        this.openAiConversationInputItems.push(...responseReplayItems.continuationInputItems);
        this.providerTurnReplayInputItems.push(...responseReplayItems.providerTurnReplayInputItems);
        const toolResultSubmission = await this.waitForToolResultSubmission(terminalState.toolCallId);
        const functionCallOutputInputItem = createFunctionCallOutputInputItem(
          toolResultSubmission.toolCallId,
          toolResultSubmission.toolResultText,
        );
        const toolResultDebugSummary = {
          responseStepIndex,
          toolCallId: toolResultSubmission.toolCallId,
          toolResultTextLength: toolResultSubmission.toolResultText.length,
        };
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "response_step.tool_result_recorded_for_continuation", toolResultDebugSummary);
        await writeOpenAiDebugLog("OpenAI tool result submission", toolResultDebugSummary);
        this.openAiConversationInputItems.push(functionCallOutputInputItem);
        this.providerTurnReplayInputItems.push(functionCallOutputInputItem);
        continue;
      }

      if (terminalState.terminalKind === "completed") {
        if (!terminalUsageProviderEvent || terminalUsageProviderEvent.type !== "completed") {
          throw new Error("OpenAI completed response ended without a completed usage event");
        }

        const completedProviderEvent = {
          ...terminalUsageProviderEvent,
          usage: accumulatedOpenAiTurnUsage ?? terminalUsageProviderEvent.usage,
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

    logOpenAiDiagnosticEvent(this.diagnosticLogger, "tool_result_submission.wait_started", {
      toolCallId,
    });
    return new Promise<OpenAiProviderToolResultSubmission>((resolveSubmission) => {
      this.pendingToolResultSubmissionResolverByToolCallId.set(toolCallId, (toolResultSubmission) => {
        this.pendingToolResultSubmissionResolverByToolCallId.delete(toolCallId);
        resolveSubmission(toolResultSubmission);
      });
    });
  }
}

function shouldIncludeReasoningEncryptedContent(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  openAiInputItems: ReadonlyArray<OpenAiConversationInputItem>;
}): boolean {
  if (input.selectedReasoningEffort === "none") {
    return false;
  }

  if (input.selectedReasoningEffort) {
    return true;
  }

  if (input.openAiInputItems.some(isOpenAiReasoningInputItem)) {
    return true;
  }

  return isOpenAiReasoningModel(input.selectedModelId);
}

function createReasoningRequest(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): OpenAiReasoningRequest | undefined {
  if (input.selectedReasoningEffort === "none") {
    return { effort: "none" };
  }

  const reasoningRequest: OpenAiReasoningRequest = {};
  if (input.selectedReasoningEffort) {
    reasoningRequest.effort = input.selectedReasoningEffort;
  }
  if (shouldRequestReasoningSummary(input.selectedModelId)) {
    reasoningRequest.summary = "auto";
  }

  return reasoningRequest.effort || reasoningRequest.summary ? reasoningRequest : undefined;
}

function shouldRequestReasoningSummary(selectedModelId: string): boolean {
  return isOpenAiReasoningModel(selectedModelId);
}

function isOpenAiReasoningModel(selectedModelId: string): boolean {
  const normalizedSelectedModelId = selectedModelId.toLowerCase();
  return (
    (normalizedSelectedModelId.includes("gpt-5") || normalizedSelectedModelId.includes("codex")) &&
    !normalizedSelectedModelId.includes("chat")
  );
}

function isMatchingFunctionCallReplayItem(toolCallId: string) {
  return (openAiInputItem: OpenAiProviderTurnReplayInputItem): boolean =>
    openAiInputItem.type === "function_call" && openAiInputItem.call_id === toolCallId;
}

function isOpenAiReasoningInputItem(openAiInputItem: OpenAiConversationInputItem): openAiInputItem is Extract<OpenAiConversationInputItem, { type: "reasoning" }> {
  return "type" in openAiInputItem && openAiInputItem.type === "reasoning";
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

function summarizeOpenAiResponsesRequestForDiagnostics(input: {
  requestBody: OpenAiResponsesHttpRequestBody;
  responseStepIndex: number;
}): BuliDiagnosticLogFields {
  const inputItemSummary = summarizeOpenAiInputItemsForDiagnostics(input.requestBody.input);
  return {
    responseStepIndex: input.responseStepIndex,
    model: input.requestBody.model,
    reasoningEffort: input.requestBody.reasoning?.effort ?? null,
    reasoningSummary: input.requestBody.reasoning?.summary ?? null,
    includesReasoningEncryptedContent: input.requestBody.include?.includes("reasoning.encrypted_content") ?? false,
    hasPromptCacheKey: input.requestBody.prompt_cache_key !== undefined,
    toolDefinitionCount: input.requestBody.tools.length,
    toolNames: input.requestBody.tools.map((toolDefinition) => toolDefinition.name),
    parallelToolCalls: input.requestBody.parallel_tool_calls,
    stream: input.requestBody.stream,
    ...inputItemSummary,
  };
}

function summarizeOpenAiInputItemsForDiagnostics(
  openAiInputItems: readonly OpenAiConversationInputItem[],
): BuliDiagnosticLogFields {
  let userMessageInputItemCount = 0;
  let assistantMessageInputItemCount = 0;
  let messageInputContentLength = 0;
  let userMessageInputImageCount = 0;
  let reasoningInputItemCount = 0;
  let reasoningEncryptedContentItemCount = 0;
  let functionCallInputItemCount = 0;
  let functionCallOutputInputItemCount = 0;
  let functionCallOutputLength = 0;

  for (const openAiInputItem of openAiInputItems) {
    if ("role" in openAiInputItem) {
      if (openAiInputItem.role === "user") {
        userMessageInputItemCount += 1;
      } else {
        assistantMessageInputItemCount += 1;
      }
      if (typeof openAiInputItem.content === "string") {
        messageInputContentLength += openAiInputItem.content.length;
      } else {
        messageInputContentLength += openAiInputItem.content.reduce((contentLength, contentPart) => {
          if (contentPart.type === "input_text") {
            return contentLength + contentPart.text.length;
          }

          return contentLength + contentPart.image_url.length;
        }, 0);
        userMessageInputImageCount += openAiInputItem.content.filter((contentPart) => contentPart.type === "input_image").length;
      }
      continue;
    }

    if (openAiInputItem.type === "reasoning") {
      reasoningInputItemCount += 1;
      if (openAiInputItem.encrypted_content !== undefined) {
        reasoningEncryptedContentItemCount += 1;
      }
      continue;
    }

    if (openAiInputItem.type === "function_call") {
      functionCallInputItemCount += 1;
      continue;
    }

    functionCallOutputInputItemCount += 1;
    functionCallOutputLength += openAiInputItem.output.length;
  }

  return {
    inputItemCount: openAiInputItems.length,
    userMessageInputItemCount,
    assistantMessageInputItemCount,
    messageInputContentLength,
    userMessageInputImageCount,
    reasoningInputItemCount,
    reasoningEncryptedContentItemCount,
    functionCallInputItemCount,
    functionCallOutputInputItemCount,
    functionCallOutputLength,
  };
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
      toolName: providerStreamEvent.toolCallRequest.toolName,
      ...(providerStreamEvent.toolCallRequest.toolName === "bash"
        ? {
            shellCommandLength: providerStreamEvent.toolCallRequest.shellCommand.length,
            commandDescriptionLength: providerStreamEvent.toolCallRequest.commandDescription.length,
          }
        : {}),
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

function summarizeTokenUsageForDiagnostics(tokenUsage: TokenUsage): BuliDiagnosticLogFields {
  return {
    totalTokens: tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    reasoningTokens: tokenUsage.reasoning,
    cacheReadTokens: tokenUsage.cache.read,
    cacheWriteTokens: tokenUsage.cache.write,
  };
}

function getOpenAiRequestId(headers: Headers): string | undefined {
  return headers.get("x-request-id") ?? headers.get("request-id") ?? headers.get("openai-request-id") ?? undefined;
}

async function createFailedResponseDebugPayload(response: HttpErrorDebugResponse): Promise<{
  status: number;
  requestId: string | null;
  contentType: string | null;
  bodyTextLength: number;
  structuredErrorMessage: string | null;
}> {
  const bodyText = await response.text();
  return {
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? response.headers.get("openai-request-id"),
    contentType: response.headers.get("content-type"),
    bodyTextLength: bodyText.length,
    structuredErrorMessage: extractStructuredOpenAiErrorMessage(bodyText) ?? null,
  };
}

function extractStructuredOpenAiErrorMessage(responseBodyText: string): string | undefined {
  try {
    const parsedBody = JSON.parse(responseBodyText) as unknown;
    if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
      return undefined;
    }

    const errorValue = (parsedBody as { error?: unknown }).error;
    if (typeof errorValue !== "object" || errorValue === null || Array.isArray(errorValue)) {
      return undefined;
    }

    const messageValue = (errorValue as { message?: unknown }).message;
    return typeof messageValue === "string" ? messageValue : undefined;
  } catch {
    return undefined;
  }
}
