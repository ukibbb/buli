import type {
  BuliDiagnosticLogger,
  ProviderRequestedToolCall,
  ProviderStreamEvent,
  TokenUsage,
  ToolCallRequest,
} from "@buli/contracts";
import {
  logOpenAiDiagnosticEvent,
  summarizeTokenUsageForDiagnostics,
} from "./diagnostics.ts";
import {
  isOpenAiResponseObject,
  readOpenAiFunctionCallOutputItem,
  readOpenAiResponseObjectStringField,
} from "./openAiResponseObjects.ts";
import { OpenAiResponseOutputItemTracker } from "./openAiResponseOutputItemTracker.ts";
import { OpenAiFunctionCallStreamAccumulator } from "./openAiFunctionCallStreamAccumulator.ts";
import { OpenAiReasoningSummaryStreamProjector } from "./openAiReasoningSummaryStreamProjector.ts";
import { sanitizeOpenAiErrorMessage } from "./httpResponseDiagnostics.ts";
import { normalizeOpenAiUsage } from "./usage.ts";
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
  createOpenAiResponseStepToolCallTerminalState,
  type OpenAiResponseStepTerminalState,
} from "./openAiResponseStepTerminalStateBuilder.ts";

export type { OpenAiResponseStepTerminalState } from "./openAiResponseStepTerminalStateBuilder.ts";

export type OpenAiStreamParserOptions = {
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

function createProviderTextChunkEvent(text: string): ProviderStreamEvent {
  return { type: "text_chunk", text };
}

function createProviderToolCallRequestedEvent(toolCallId: string, toolCallRequest: ToolCallRequest): ProviderStreamEvent {
  return { type: "tool_call_requested", toolCallId, toolCallRequest };
}

function createProviderToolCallsRequestedEvent(requestedToolCalls: readonly ProviderRequestedToolCall[]): ProviderStreamEvent {
  if (requestedToolCalls.length === 1) {
    const requestedToolCall = requestedToolCalls[0];
    if (!requestedToolCall) {
      throw new Error("OpenAI stream tried to emit an empty tool-call batch.");
    }

    return createProviderToolCallRequestedEvent(requestedToolCall.toolCallId, requestedToolCall.toolCallRequest);
  }

  return {
    type: "tool_calls_requested",
    requestedToolCalls: [...requestedToolCalls],
  };
}

function createProviderCompletedEvent(usage: TokenUsage): ProviderStreamEvent {
  return {
    type: "completed",
    usage,
  };
}

function createProviderIncompleteEvent(input: {
  incompleteReason: string;
  usage: TokenUsage;
}): ProviderStreamEvent {
  return {
    type: "incomplete",
    incompleteReason: input.incompleteReason,
    usage: input.usage,
  };
}

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

    switch (value.type) {
      case "response.output_text.delta": {
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
        return [
          ...this.createPendingReasoningCompletedEvents(),
          createProviderTextChunkEvent(outputTextDelta.delta),
        ];
      }

      case "response.reasoning_summary_text.delta": {
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

      case "response.reasoning_summary_text.done": {
        const reasoningSummaryTextDone = readOpenAiReasoningSummaryTextDoneChunk(value);
        if (!reasoningSummaryTextDone) {
          this.ignoreSseEvent("malformed_reasoning_done", value.type);
          return [];
        }

        this.reasoningSummaryStreamProjector.markReasoningSummaryPartDone();
        return [];
      }

      case "response.reasoning_summary_part.added": {
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

      case "response.function_call_arguments.delta": {
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

      case "response.output_item.added": {
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
        return [];
      }

      case "response.function_call_arguments.done": {
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
        return [];
      }

      case "response.output_item.done": {
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
        if (functionCallItem) {
          if (functionCallItem.argumentsText && functionCallItem.argumentsText.length > 0) {
            this.outputItemTracker.setFunctionCallArgumentsTextByItemId(functionCallItem.itemId, functionCallItem.argumentsText);
          }
          this.functionCallStreamAccumulator.observeFunctionCallOutputItem({
            functionCallItem,
            shouldRecordRequestedToolCallIfReady: true,
          });
        }
        return [];
      }

      case "response.completed": {
        const completedResponse = parseOpenAiResponseCompletedChunk(value);
        const providerEvents = this.createPendingReasoningCompletedEvents();
        this.finished = true;
        const responseUsage = normalizeOpenAiUsage(completedResponse.response.usage);
        const responseOutputItems = this.outputItemTracker.createTrackedBackedResponseOutputItems(completedResponse.response.output);
        this.functionCallStreamAccumulator.recordRequestedToolCallsFromResponseOutputItems(responseOutputItems);
        const pendingRequestedToolCalls = this.functionCallStreamAccumulator.listPendingRequestedToolCalls();
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.terminal_observed", {
          terminalKind: chooseOpenAiResponseStepTerminalKind({
            requestedToolCallCount: pendingRequestedToolCalls.length,
            fallbackTerminalKind: "completed",
          }),
          ...summarizeTokenUsageForDiagnostics(responseUsage),
        });
        if (pendingRequestedToolCalls.length > 0) {
          this.terminalState = createOpenAiResponseStepToolCallTerminalState({
            requestedToolCalls: pendingRequestedToolCalls,
            responseOutputItems,
            usage: responseUsage,
          });
          providerEvents.push(createProviderToolCallsRequestedEvent(pendingRequestedToolCalls));
          return providerEvents;
        }
        this.terminalState = { terminalKind: "completed" };
        providerEvents.push(createProviderCompletedEvent(responseUsage));
        return providerEvents;
      }

      case "response.incomplete": {
        const incompleteResponse = parseOpenAiResponseIncompleteChunk(value);
        const providerEvents = this.createPendingReasoningCompletedEvents();
        this.finished = true;
        const responseUsage = normalizeOpenAiUsage(incompleteResponse.response.usage);
        const responseOutputItems = this.outputItemTracker.createTrackedBackedResponseOutputItems(incompleteResponse.response.output);
        this.functionCallStreamAccumulator.recordRequestedToolCallsFromResponseOutputItems(responseOutputItems);
        const pendingRequestedToolCalls = this.functionCallStreamAccumulator.listPendingRequestedToolCalls();
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.terminal_observed", {
          terminalKind: chooseOpenAiResponseStepTerminalKind({
            requestedToolCallCount: pendingRequestedToolCalls.length,
            fallbackTerminalKind: "incomplete",
          }),
          incompleteReason: incompleteResponse.response.incomplete_details?.reason ?? "unknown",
          ...summarizeTokenUsageForDiagnostics(responseUsage),
        });
        if (pendingRequestedToolCalls.length > 0) {
          this.terminalState = createOpenAiResponseStepToolCallTerminalState({
            requestedToolCalls: pendingRequestedToolCalls,
            responseOutputItems,
            usage: responseUsage,
          });
          providerEvents.push(createProviderToolCallsRequestedEvent(pendingRequestedToolCalls));
          return providerEvents;
        }
        this.terminalState = { terminalKind: "incomplete" };
        providerEvents.push(createProviderIncompleteEvent({
          incompleteReason: incompleteResponse.response.incomplete_details?.reason ?? "unknown",
          usage: responseUsage,
        }));
        return providerEvents;
      }

      case "response.failed": {
        const failedResponse = readOpenAiResponseFailedChunk(value);
        if (!failedResponse) {
          throw new Error("OpenAI response failed: unknown error");
        }

        const errorMessage = sanitizeOpenAiErrorMessage(failedResponse.response.error?.message ?? "unknown error");
        const errorCode = failedResponse.response.error?.code;
        throw new Error(`OpenAI response failed: ${errorMessage}${errorCode ? ` | code=${errorCode}` : ""}`);
      }

      case "error": {
        const error = parseOpenAiErrorChunk(value);
        throw new Error(sanitizeOpenAiErrorMessage(error.message));
      }

      default: {
        this.ignoreSseEvent("unknown_event_type", value.type);
        return [];
      }
    }
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
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
