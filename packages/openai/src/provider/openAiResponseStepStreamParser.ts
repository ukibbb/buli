import { ContextWindowOverflowError, type BuliDiagnosticLogger, type ProviderStreamEvent, type TokenUsage } from "@buli/contracts";
import {
  logOpenAiDiagnosticEvent,
  summarizeTokenUsageForDiagnostics,
} from "./diagnostics.ts";
import {
  isOpenAiOutputTextContentPart,
  isOpenAiResponseObject,
  readOpenAiFunctionCallOutputItem,
  readOpenAiResponseObjectArrayField,
  readOpenAiResponseObjectStringField,
  type OpenAiResponseObject,
} from "./openAiResponseObjects.ts";
import { OpenAiResponseOutputItemTracker } from "./openAiResponseOutputItemTracker.ts";
import { OpenAiFunctionCallStreamAccumulator } from "./openAiFunctionCallStreamAccumulator.ts";
import { OpenAiReasoningSummaryStreamProjector } from "./openAiReasoningSummaryStreamProjector.ts";
import { isOpenAiContextWindowOverflowFailure, sanitizeOpenAiErrorMessage } from "./httpResponseDiagnostics.ts";
import { normalizeOpenAiUsage } from "./usage.ts";
import { classifyOpenAiProviderFunctionCallIntents } from "./openAiProviderFunctionCallIntentClassification.ts";
import {
  parseOpenAiErrorChunk,
  parseOpenAiResponseCompletedChunk,
  parseOpenAiResponseIncompleteChunk,
  readOpenAiFunctionCallArgumentsDeltaChunk,
  readOpenAiFunctionCallArgumentsDoneChunk,
  readOpenAiOutputTextDeltaChunk,
  readOpenAiOutputItemAddedChunk,
  readOpenAiOutputItemDoneChunk,
  readOpenAiReasoningSummaryPartAddedChunk,
  readOpenAiReasoningSummaryTextDeltaChunk,
  readOpenAiReasoningSummaryTextDoneChunk,
  readOpenAiResponseFailedChunk,
} from "./openAiResponseStreamEvents.ts";
import {
  chooseOpenAiResponseStepTerminalKind,
  createOpenAiResponseStepProviderFunctionCallTerminalState,
  type OpenAiResponseStepTerminalState,
} from "./openAiResponseStepTerminalStateBuilder.ts";
import {
  createProviderCompletedEvent,
  createProviderFunctionCallIntentEvents,
  createProviderIncompleteEvent,
  createProviderTextChunkEvent,
} from "./providerStreamEventFactories.ts";

export type { OpenAiResponseStepTerminalState } from "./openAiResponseStepTerminalStateBuilder.ts";

export type OpenAiStreamParserOptions = {
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  abortSignal?: AbortSignal | undefined;
  idleTimeoutMilliseconds?: number | undefined;
};

// Reasoning summary timing is captured provider-side because the provider is
// closest to the SSE clock. reasoning_summary_started is emitted once per
// turn on the first reasoning delta. reasoning_summary_completed is emitted
// exactly once, on the first non-reasoning event that arrives after reasoning
// has started. Between consecutive reasoning summary parts we inject a
// paragraph separator so the UI can render them as one entry.
export class OpenAiResponseStepStreamParser {
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private readonly streamStartedAtMs: number;
  private readonly reasoningSummaryStreamProjector = new OpenAiReasoningSummaryStreamProjector();
  private readonly functionCallStreamAccumulator: OpenAiFunctionCallStreamAccumulator;
  private finished = false;
  private terminalState: OpenAiResponseStepTerminalState | undefined;
  private readonly outputItemTracker = new OpenAiResponseOutputItemTracker();
  private sseFrameCount = 0;
  private ignoredSseEventCount = 0;
  private textDeltaEventCount = 0;
  private textDeltaCharacterCount = 0;
  private reasoningDeltaEventCount = 0;
  private reasoningDeltaCharacterCount = 0;
  private functionCallArgumentDeltaEventCount = 0;
  private functionCallArgumentCharacterCount = 0;
  private readonly parseSseDataFrameByEventType: Record<string, (value: OpenAiResponseObject) => ProviderStreamEvent[]> = {
    "response.output_text.delta": (value) => this.parseOutputTextDeltaSseFrame(value),
    "response.reasoning_summary_text.delta": (value) => this.parseReasoningSummaryTextDeltaSseFrame(value),
    "response.reasoning_summary_text.done": (value) => this.parseReasoningSummaryTextDoneSseFrame(value),
    "response.reasoning_summary_part.added": (value) => this.parseReasoningSummaryPartAddedSseFrame(value),
    "response.function_call_arguments.delta": (value) => this.parseFunctionCallArgumentsDeltaSseFrame(value),
    "response.output_item.added": (value) => this.parseOutputItemAddedSseFrame(value),
    "response.function_call_arguments.done": (value) => this.parseFunctionCallArgumentsDoneSseFrame(value),
    "response.output_item.done": (value) => this.parseOutputItemDoneSseFrame(value),
    "response.completed": (value) => this.parseCompletedResponseSseFrame(value),
    "response.incomplete": (value) => this.parseIncompleteResponseSseFrame(value),
    "response.failed": (value) => this.parseFailedResponseSseFrame(value),
    error: (value) => this.parseErrorSseFrame(value),
  };

  constructor(options: OpenAiStreamParserOptions = {}) {
    this.diagnosticLogger = options.diagnosticLogger;
    this.functionCallStreamAccumulator = new OpenAiFunctionCallStreamAccumulator({
      diagnosticLogger: options.diagnosticLogger,
    });
    this.streamStartedAtMs = Date.now();
  }

  start(input: { contentType: string | null }): void {
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.started", {
      contentType: input.contentType,
    });
  }

  parseSseDataFrame(data: string): ProviderStreamEvent[] {
    this.sseFrameCount += 1;
    let value: unknown;
    try {
      value = JSON.parse(data) as unknown;
    } catch {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.sse_event_malformed_json", {
        sseFrameCount: this.sseFrameCount,
        frameCharacterCount: data.length,
      });
      throw new Error(`OpenAI stream returned malformed SSE JSON at frame ${this.sseFrameCount} (${data.length} characters).`);
    }
    if (!isOpenAiResponseObject(value)) {
      this.ignoredSseEventCount += 1;
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.sse_event_ignored", {
        reason: "not_object_with_type",
        sseFrameCount: this.sseFrameCount,
      });
      return [];
    }

    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.sse_event_received", {
      openAiEventType: value.type,
      sseFrameCount: this.sseFrameCount,
    });

    const parseSseDataFrame = this.parseSseDataFrameByEventType[value.type];
    if (!parseSseDataFrame) {
      this.ignoreSseEvent("unknown_event_type", value.type);
      return [];
    }

    return parseSseDataFrame(value);
  }

  private parseOutputTextDeltaSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const outputTextDelta = readOpenAiOutputTextDeltaChunk(value);
    if (!outputTextDelta) {
      this.ignoreSseEvent("malformed_output_text_delta", value.type);
      return [];
    }

    const outputIndexValue = outputTextDelta["output_index"];
    const contentIndexValue = outputTextDelta["content_index"];
    const outputIndex = isNonNegativeInteger(outputIndexValue) ? outputIndexValue : undefined;
    const contentIndex = isNonNegativeInteger(contentIndexValue) ? contentIndexValue : 0;
    this.outputItemTracker.appendAssistantOutputTextDelta({
      itemId: outputTextDelta.item_id,
      outputIndex,
      contentIndex,
      deltaText: outputTextDelta.delta,
    });
    this.textDeltaEventCount += 1;
    this.textDeltaCharacterCount += outputTextDelta.delta.length;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.text_delta_received", {
      textDeltaLength: outputTextDelta.delta.length,
      textDeltaEventCount: this.textDeltaEventCount,
      textDeltaCharacterCount: this.textDeltaCharacterCount,
    });
    const providerStreamEvents = this.createPendingReasoningCompletedEvents();
    providerStreamEvents.push(createProviderTextChunkEvent(outputTextDelta.delta));
    return providerStreamEvents;
  }

  private parseReasoningSummaryTextDeltaSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const reasoningSummaryTextDelta = readOpenAiReasoningSummaryTextDeltaChunk(value);
    if (!reasoningSummaryTextDelta) {
      this.ignoreSseEvent("malformed_reasoning_delta", value.type);
      return [];
    }

    const summaryIndexValue = reasoningSummaryTextDelta["summary_index"];
    if (summaryIndexValue !== undefined && !isNonNegativeInteger(summaryIndexValue)) {
      this.ignoreSseEvent("malformed_reasoning_delta", value.type);
      return [];
    }

    const outputIndexValue = reasoningSummaryTextDelta["output_index"];
    const summaryIndex = isNonNegativeInteger(summaryIndexValue) ? summaryIndexValue : 0;
    const outputIndex = isNonNegativeInteger(outputIndexValue) ? outputIndexValue : undefined;
    this.outputItemTracker.appendReasoningSummaryTextDelta({
      itemId: reasoningSummaryTextDelta.item_id,
      outputIndex,
      summaryIndex,
      deltaText: reasoningSummaryTextDelta.delta,
    });
    this.reasoningDeltaEventCount += 1;
    this.reasoningDeltaCharacterCount += reasoningSummaryTextDelta.delta.length;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.reasoning_delta_received", {
      itemId: reasoningSummaryTextDelta.item_id,
      summaryIndex,
      reasoningDeltaLength: reasoningSummaryTextDelta.delta.length,
      reasoningDeltaEventCount: this.reasoningDeltaEventCount,
      reasoningDeltaCharacterCount: this.reasoningDeltaCharacterCount,
    });
    return this.reasoningSummaryStreamProjector.appendReasoningSummaryTextDelta({
      itemId: reasoningSummaryTextDelta.item_id,
      summaryIndex,
      deltaText: reasoningSummaryTextDelta.delta,
    });
  }

  private parseReasoningSummaryTextDoneSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const reasoningSummaryTextDone = readOpenAiReasoningSummaryTextDoneChunk(value);
    if (!reasoningSummaryTextDone) {
      this.ignoreSseEvent("malformed_reasoning_done", value.type);
      return [];
    }

    this.reasoningSummaryStreamProjector.markReasoningSummaryPartDone();
    return [];
  }

  private parseReasoningSummaryPartAddedSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const reasoningSummaryPartAdded = readOpenAiReasoningSummaryPartAddedChunk(value);
    if (!reasoningSummaryPartAdded) {
      this.ignoreSseEvent("malformed_reasoning_summary_part_added", value.type);
      return [];
    }

    this.outputItemTracker.ensureReasoningSummaryPart({
      itemId: reasoningSummaryPartAdded.item_id,
      outputIndex: reasoningSummaryPartAdded.output_index,
      summaryIndex: reasoningSummaryPartAdded.summary_index,
    });
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.reasoning_summary_part_added", {
      itemId: reasoningSummaryPartAdded.item_id,
      summaryIndex: reasoningSummaryPartAdded.summary_index,
    });
    return [];
  }

  private parseFunctionCallArgumentsDeltaSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const functionCallArgumentsDelta = readOpenAiFunctionCallArgumentsDeltaChunk(value);
    if (!functionCallArgumentsDelta) {
      this.ignoreSseEvent("malformed_function_call_arguments_delta", value.type);
      return [];
    }

    this.functionCallArgumentDeltaEventCount += 1;
    this.functionCallArgumentCharacterCount += functionCallArgumentsDelta.delta.length;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.function_call_arguments_delta_received", {
      functionCallArgumentDeltaLength: functionCallArgumentsDelta.delta.length,
      functionCallArgumentDeltaEventCount: this.functionCallArgumentDeltaEventCount,
      functionCallArgumentCharacterCount: this.functionCallArgumentCharacterCount,
    });
    this.outputItemTracker.appendFunctionCallArgumentsTextDeltaByItemId(
      functionCallArgumentsDelta.item_id,
      functionCallArgumentsDelta.delta,
    );
    this.functionCallStreamAccumulator.appendFunctionCallArgumentsDelta({
      itemId: functionCallArgumentsDelta.item_id,
      deltaText: functionCallArgumentsDelta.delta,
    });
    return [];
  }

  private parseOutputItemAddedSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const outputItemAdded = readOpenAiOutputItemAddedChunk(value);
    if (!outputItemAdded) {
      this.ignoreSseEvent("malformed_output_item_added", value.type);
      return [];
    }

    this.outputItemTracker.setTrackedOutputItemAtIndex({
      outputIndex: outputItemAdded.output_index,
      responseOutputItem: outputItemAdded.item,
    });
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.output_item_added", {
      outputIndex: outputItemAdded.output_index,
      outputItemType: outputItemAdded.item.type,
      trackedOutputItemCount: this.outputItemTracker.trackedOutputItemCount,
    });
    const providerEvents = isOpenAiReasoningOutputItem(outputItemAdded.item)
      ? this.reasoningSummaryStreamProjector.beginReasoningSummary()
      : this.createPendingReasoningCompletedEvents();
    providerEvents.push(...this.createCompletedAssistantMessageOutputItemTextEvents({
      outputIndex: outputItemAdded.output_index,
      outputItem: outputItemAdded.item,
    }));
    const functionCallItem = readOpenAiFunctionCallOutputItem(outputItemAdded.item);
    if (functionCallItem) {
      if (functionCallItem.argumentsText && functionCallItem.argumentsText.length > 0) {
        this.outputItemTracker.setFunctionCallArgumentsTextByItemId(functionCallItem.itemId, functionCallItem.argumentsText);
      }
      this.functionCallStreamAccumulator.observeFunctionCallOutputItem({
        functionCallItem,
        shouldRecordRequestedToolCallIfReady: false,
      });
    }
    return providerEvents;
  }

  private parseFunctionCallArgumentsDoneSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const functionCallArgumentsDone = readOpenAiFunctionCallArgumentsDoneChunk(value);
    if (!functionCallArgumentsDone) {
      this.ignoreSseEvent("malformed_function_call_arguments_done", value.type);
      return [];
    }

    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.function_call_arguments_completed", {
      itemId: functionCallArgumentsDone.item_id,
      functionArgumentsLength: functionCallArgumentsDone.arguments.length,
    });

    this.outputItemTracker.setFunctionCallArgumentsTextByItemId(functionCallArgumentsDone.item_id, functionCallArgumentsDone.arguments);
    this.functionCallStreamAccumulator.completeFunctionCallArguments({
      itemId: functionCallArgumentsDone.item_id,
      argumentsText: functionCallArgumentsDone.arguments,
    });
    return this.createNewExecutableToolCallEvents();
  }

  private parseOutputItemDoneSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const outputItemDone = readOpenAiOutputItemDoneChunk(value);
    if (!outputItemDone) {
      this.ignoreSseEvent("malformed_output_item_done", value.type);
      return [];
    }

    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.output_item_completed", {
      outputIndex: outputItemDone.output_index ?? null,
      outputItemType: outputItemDone.item.type,
    });

    if (outputItemDone.output_index !== undefined) {
      this.outputItemTracker.setTrackedOutputItemAtIndex({
        outputIndex: outputItemDone.output_index,
        responseOutputItem: outputItemDone.item,
      });
    } else if (readOpenAiResponseObjectStringField(outputItemDone.item, "id") !== undefined) {
      this.outputItemTracker.mergeOutputItemDoneWithoutOutputIndex(outputItemDone.item);
    }
    const functionCallItem = readOpenAiFunctionCallOutputItem(outputItemDone.item);
    const providerEvents: ProviderStreamEvent[] = [];
    if (functionCallItem) {
      if (functionCallItem.argumentsText && functionCallItem.argumentsText.length > 0) {
        this.outputItemTracker.setFunctionCallArgumentsTextByItemId(functionCallItem.itemId, functionCallItem.argumentsText);
      }
      this.functionCallStreamAccumulator.observeFunctionCallOutputItem({
        functionCallItem,
        shouldRecordRequestedToolCallIfReady: true,
      });
      providerEvents.push(...this.createNewExecutableToolCallEvents());
    }
    if (isOpenAiReasoningOutputItem(outputItemDone.item)) {
      providerEvents.push(...this.createPendingReasoningCompletedEvents());
    }
    return providerEvents;
  }

  private parseCompletedResponseSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const completedResponse = parseOpenAiResponseCompletedChunk(value);
    return this.handleTerminalResponse({
      responseOutputItemsFromTerminalEvent: completedResponse.response.output,
      terminalResponseUsage: normalizeOpenAiUsage(completedResponse.response.usage),
      fallbackTerminalKind: "completed",
    });
  }

  private parseIncompleteResponseSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const incompleteResponse = parseOpenAiResponseIncompleteChunk(value);
    return this.handleTerminalResponse({
      responseOutputItemsFromTerminalEvent: incompleteResponse.response.output,
      terminalResponseUsage: normalizeOpenAiUsage(incompleteResponse.response.usage),
      fallbackTerminalKind: "incomplete",
      incompleteReason: incompleteResponse.response.incomplete_details?.reason ?? "unknown",
    });
  }

  private parseFailedResponseSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const failedResponse = readOpenAiResponseFailedChunk(value);
    if (!failedResponse) {
      throw new Error("OpenAI response failed: unknown error");
    }

    const errorMessage = sanitizeOpenAiErrorMessage(failedResponse.response.error?.message ?? "unknown error");
    const errorCode = failedResponse.response.error?.code;
    const failureMessage = `OpenAI response failed: ${errorMessage}${errorCode ? ` | code=${errorCode}` : ""}`;
    if (isOpenAiContextWindowOverflowFailure({ errorCode, errorMessage })) {
      throw new ContextWindowOverflowError(failureMessage);
    }
    throw new Error(failureMessage);
  }

  private parseErrorSseFrame(value: OpenAiResponseObject): ProviderStreamEvent[] {
    const error = parseOpenAiErrorChunk(value);
    const errorMessage = sanitizeOpenAiErrorMessage(error.message);
    const failureMessage = `${errorMessage}${error.code ? ` | code=${error.code}` : ""}`;
    if (isOpenAiContextWindowOverflowFailure({ errorCode: error.code, errorMessage })) {
      throw new ContextWindowOverflowError(failureMessage);
    }
    throw new Error(failureMessage);
  }

  complete(): OpenAiResponseStepTerminalState {
    if (!this.finished) {
      throw new Error("OpenAI stream ended without a completion event");
    }

    if (!this.terminalState) {
      throw new Error("OpenAI stream ended without a terminal step state");
    }

    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.finished", {
      terminalKind: this.terminalState.terminalKind,
      durationMs: Date.now() - this.streamStartedAtMs,
      sseFrameCount: this.sseFrameCount,
      ignoredSseEventCount: this.ignoredSseEventCount,
      textDeltaEventCount: this.textDeltaEventCount,
      textDeltaCharacterCount: this.textDeltaCharacterCount,
      reasoningDeltaEventCount: this.reasoningDeltaEventCount,
      reasoningDeltaCharacterCount: this.reasoningDeltaCharacterCount,
      functionCallArgumentDeltaEventCount: this.functionCallArgumentDeltaEventCount,
      functionCallArgumentCharacterCount: this.functionCallArgumentCharacterCount,
      trackedOutputItemCount: this.outputItemTracker.trackedOutputItemCount,
    });

    return this.terminalState;
  }

  private ignoreSseEvent(reason: string, openAiEventType: string): void {
    this.ignoredSseEventCount += 1;
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.sse_event_ignored", {
      reason,
      openAiEventType,
      sseFrameCount: this.sseFrameCount,
    });
  }

  private createPendingReasoningCompletedEvents(): ProviderStreamEvent[] {
    return this.reasoningSummaryStreamProjector.completeReasoningSummaryBeforeNonReasoningEvent();
  }

  private handleTerminalResponse(input: {
    responseOutputItemsFromTerminalEvent: readonly unknown[] | undefined;
    terminalResponseUsage: TokenUsage;
    fallbackTerminalKind: "completed" | "incomplete";
    incompleteReason?: string | undefined;
  }): ProviderStreamEvent[] {
    const providerEvents = this.createPendingReasoningCompletedEvents();
    this.finished = true;
    const responseOutputItems = this.outputItemTracker.createTrackedBackedResponseOutputItems(
      input.responseOutputItemsFromTerminalEvent,
    );
    const terminalAssistantTextChunks = this.outputItemTracker.listUnemittedAssistantOutputTextChunks(responseOutputItems);
    this.functionCallStreamAccumulator.recordProviderFunctionCallIntentsFromResponseOutputItems(responseOutputItems);
    const pendingProviderFunctionCallIntents = this.functionCallStreamAccumulator.listPendingProviderFunctionCallIntents();
    const pendingProviderFunctionCallIntentClassification = classifyOpenAiProviderFunctionCallIntents(
      pendingProviderFunctionCallIntents,
    );
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.terminal_observed", {
      terminalKind: chooseOpenAiResponseStepTerminalKind({
        requestedToolCallCount: pendingProviderFunctionCallIntentClassification.requestedToolCalls.length,
        invalidFunctionCallCount: pendingProviderFunctionCallIntentClassification.invalidFunctionCallIntents.length,
        fallbackTerminalKind: input.fallbackTerminalKind,
      }),
      ...(input.incompleteReason !== undefined ? { incompleteReason: input.incompleteReason } : {}),
      ...summarizeTokenUsageForDiagnostics(input.terminalResponseUsage),
    });
    if (terminalAssistantTextChunks.length > 0) {
      logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.terminal_assistant_text_recovered", {
        textChunkCount: terminalAssistantTextChunks.length,
        textCharacterCount: terminalAssistantTextChunks.reduce(
          (textCharacterCount, terminalAssistantTextChunk) => textCharacterCount + terminalAssistantTextChunk.length,
          0,
        ),
      });
      providerEvents.push(...terminalAssistantTextChunks.map(createProviderTextChunkEvent));
    }
    if (pendingProviderFunctionCallIntents.length > 0) {
      this.terminalState = createOpenAiResponseStepProviderFunctionCallTerminalState({
        providerFunctionCallIntents: pendingProviderFunctionCallIntents,
        responseOutputItems,
        usage: input.terminalResponseUsage,
      });
      providerEvents.push(...createProviderFunctionCallIntentEvents(
        this.functionCallStreamAccumulator.drainNewExecutableToolCallIntents(),
      ));
      return providerEvents;
    }

    if (input.fallbackTerminalKind === "completed") {
      this.terminalState = { terminalKind: "completed" };
      providerEvents.push(createProviderCompletedEvent(input.terminalResponseUsage));
      return providerEvents;
    }

    this.terminalState = { terminalKind: "incomplete" };
    providerEvents.push(createProviderIncompleteEvent({
      incompleteReason: input.incompleteReason ?? "unknown",
      usage: input.terminalResponseUsage,
    }));
    return providerEvents;
  }

  private createNewExecutableToolCallEvents(): ProviderStreamEvent[] {
    return [
      ...this.createPendingReasoningCompletedEvents(),
      ...createProviderFunctionCallIntentEvents(this.functionCallStreamAccumulator.drainNewExecutableToolCallIntents()),
    ];
  }

  private createCompletedAssistantMessageOutputItemTextEvents(input: {
    outputIndex: number;
    outputItem: unknown;
  }): ProviderStreamEvent[] {
    if (
      !isOpenAiResponseObject(input.outputItem) ||
      input.outputItem.type !== "message" ||
      readOpenAiResponseObjectStringField(input.outputItem, "role") !== "assistant" ||
      readOpenAiResponseObjectStringField(input.outputItem, "status") !== "completed"
    ) {
      return [];
    }

    const itemId = readOpenAiResponseObjectStringField(input.outputItem, "id");
    if (itemId === undefined) {
      return [];
    }

    const providerEvents: ProviderStreamEvent[] = [];
    const contentParts = readOpenAiResponseObjectArrayField(input.outputItem, "content") ?? [];
    for (const [contentIndex, contentPart] of contentParts.entries()) {
      if (!isOpenAiOutputTextContentPart(contentPart) || contentPart.text.length === 0) {
        continue;
      }

      this.outputItemTracker.appendAssistantOutputTextDelta({
        itemId,
        outputIndex: input.outputIndex,
        contentIndex,
        deltaText: contentPart.text,
      });
      providerEvents.push(createProviderTextChunkEvent(contentPart.text));
    }

    return providerEvents;
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOpenAiReasoningOutputItem(value: unknown): boolean {
  return isOpenAiResponseObject(value) && value.type === "reasoning";
}
