import type {
  BuliDiagnosticLogger,
  ProviderRequestedToolCall,
  ProviderStreamEvent,
  TokenUsage,
  ToolCallRequest,
} from "@buli/contracts";
import { z } from "zod";
import {
  logOpenAiDiagnosticEvent,
  summarizeOpenAiToolCallRequestForDiagnostics,
  summarizeTokenUsageForDiagnostics,
} from "./diagnostics.ts";
import {
  isOpenAiReasoningSummaryTextPart,
  isOpenAiOutputTextContentPart,
  isOpenAiResponseObject,
  listOpenAiOutputTextContentParts,
  listOpenAiReasoningSummaryTextParts,
  readOpenAiFunctionCallOutputItem,
  type OpenAiFunctionCallOutputItem,
  type OpenAiResponseObject,
} from "./openAiResponseObjects.ts";
import { createOpenAiToolCallRequest } from "./toolDefinitions.ts";
import { OpenAiUsageSchema, normalizeOpenAiUsage } from "./usage.ts";

const ReasoningSummaryPartAddedChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_part.added"),
  item_id: z.string(),
  output_index: z.number().int().nonnegative().optional(),
  summary_index: z.number().int().nonnegative(),
});

const FunctionCallArgumentsDoneChunkSchema = z.object({
  type: z.literal("response.function_call_arguments.done"),
  item_id: z.string(),
  arguments: z.string(),
});

const OutputItemAddedChunkSchema = z.object({
  type: z.literal("response.output_item.added"),
  output_index: z.number().int().nonnegative(),
  item: z.object({ type: z.string() }).passthrough(),
});

const OutputItemDoneChunkSchema = z.object({
  type: z.literal("response.output_item.done"),
  output_index: z.number().int().nonnegative().optional(),
  item: z.object({ type: z.string() }).passthrough(),
});

const ErrorChunkSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

const ResponseCompletedChunkSchema = z.object({
  type: z.literal("response.completed"),
  response: z.object({
    usage: OpenAiUsageSchema,
    output: z.array(z.unknown()).optional(),
  }),
});

const ResponseIncompleteChunkSchema = z.object({
  type: z.literal("response.incomplete"),
  response: z.object({
    incomplete_details: z.object({ reason: z.string() }).nullish(),
    usage: OpenAiUsageSchema,
    output: z.array(z.unknown()).optional(),
  }),
});

const ResponseFailedChunkSchema = z.object({
  type: z.literal("response.failed"),
  response: z.object({
    error: z.object({
      code: z.string().optional(),
      message: z.string().optional(),
    }).nullish(),
  }).passthrough(),
});

type OpenAiResponseStepToolCallRequestedState = {
  terminalKind: "tool_call_requested";
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  responseOutputItems: unknown[];
  usage: TokenUsage;
};

type OpenAiResponseStepToolCallsRequestedState = {
  terminalKind: "tool_calls_requested";
  requestedToolCalls: ProviderRequestedToolCall[];
  responseOutputItems: unknown[];
  usage: TokenUsage;
};

type OpenAiResponseStepCompletedState = {
  terminalKind: "completed";
};

type OpenAiResponseStepIncompleteState = {
  terminalKind: "incomplete";
};

export type OpenAiResponseStepTerminalState =
  | OpenAiResponseStepToolCallRequestedState
  | OpenAiResponseStepToolCallsRequestedState
  | OpenAiResponseStepCompletedState
  | OpenAiResponseStepIncompleteState;

export type OpenAiStreamParserOptions = {
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

type PendingFunctionCallState = {
  toolCallId: string;
  toolName: string;
  argumentsText: string;
  hasRecordedToolCallRequest: boolean;
};

function createProviderTextChunkEvent(text: string): ProviderStreamEvent {
  return { type: "text_chunk", text };
}

function createProviderReasoningSummaryStartedEvent(): ProviderStreamEvent {
  return { type: "reasoning_summary_started" };
}

function createProviderReasoningSummaryTextChunkEvent(text: string): ProviderStreamEvent {
  return { type: "reasoning_summary_text_chunk", text };
}

function createProviderReasoningSummaryCompletedEvent(reasoningDurationMs: number): ProviderStreamEvent {
  return { type: "reasoning_summary_completed", reasoningDurationMs };
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
  private finished = false;
  private reasoningStartedAtMs: number | undefined;
  private isReasoningSummaryInProgress = false;
  private reasoningPartSeparatorPending = false;
  private terminalState: OpenAiResponseStepTerminalState | undefined;
  private readonly pendingRequestedToolCalls: ProviderRequestedToolCall[] = [];
  private readonly pendingFunctionCallStateByItemId = new Map<string, PendingFunctionCallState>();
  private readonly pendingFunctionCallArgumentsTextByItemId = new Map<string, string>();
  private readonly trackedOutputItemsByIndex = new Map<number, unknown>();
  private sseFrameCount = 0;
  private ignoredSseEventCount = 0;
  private textDeltaEventCount = 0;
  private textDeltaCharacterCount = 0;
  private reasoningDeltaEventCount = 0;
  private reasoningDeltaCharacterCount = 0;
  private lastReasoningSummaryPartKey: string | undefined;
  private functionCallArgumentDeltaEventCount = 0;
  private functionCallArgumentCharacterCount = 0;
  private nextUnindexedTrackedOutputItemIndex = -1_000_000;

  constructor(options: OpenAiStreamParserOptions = {}) {
    this.diagnosticLogger = options.diagnosticLogger;
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
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          this.ignoreSseEvent("malformed_output_text_delta", value.type);
          return [];
        }

        const outputIndex = typeof value.output_index === "number" && Number.isInteger(value.output_index) && value.output_index >= 0
          ? value.output_index
          : undefined;
        const contentIndex = typeof value.content_index === "number" && Number.isInteger(value.content_index) && value.content_index >= 0
          ? value.content_index
          : 0;
        this.updateTrackedAssistantMessageTextByItemId({
          itemId: value.item_id,
          outputIndex,
          contentIndex,
          deltaText: value.delta,
        });
        this.textDeltaEventCount += 1;
        this.textDeltaCharacterCount += value.delta.length;
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.text_delta_received", {
          textDeltaLength: value.delta.length,
          textDeltaEventCount: this.textDeltaEventCount,
          textDeltaCharacterCount: this.textDeltaCharacterCount,
        });
        return [
          ...this.createPendingReasoningCompletedEvents(),
          createProviderTextChunkEvent(value.delta),
        ];
      }

      case "response.reasoning_summary_text.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          this.ignoreSseEvent("malformed_reasoning_delta", value.type);
          return [];
        }

        if (value.summary_index !== undefined && !isNonNegativeInteger(value.summary_index)) {
          this.ignoreSseEvent("malformed_reasoning_delta", value.type);
          return [];
        }

        const summaryIndex = isNonNegativeInteger(value.summary_index) ? value.summary_index : 0;
        const outputIndex = isNonNegativeInteger(value.output_index) ? value.output_index : undefined;
        this.updateTrackedReasoningSummaryTextByItemId({
          itemId: value.item_id,
          outputIndex,
          summaryIndex,
          createNextSummaryText: (currentSummaryText) => `${currentSummaryText}${value.delta}`,
        });
        this.reasoningDeltaEventCount += 1;
        this.reasoningDeltaCharacterCount += value.delta.length;
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.reasoning_delta_received", {
          itemId: value.item_id,
          summaryIndex,
          reasoningDeltaLength: value.delta.length,
          reasoningDeltaEventCount: this.reasoningDeltaEventCount,
          reasoningDeltaCharacterCount: this.reasoningDeltaCharacterCount,
        });
        const providerEvents: ProviderStreamEvent[] = [];
        if (!this.isReasoningSummaryInProgress) {
          this.reasoningStartedAtMs = performance.now();
          this.isReasoningSummaryInProgress = true;
          providerEvents.push(createProviderReasoningSummaryStartedEvent());
        }
        const reasoningSummaryPartKey = `${value.item_id}:${summaryIndex}`;
        if (this.reasoningPartSeparatorPending || (this.lastReasoningSummaryPartKey && this.lastReasoningSummaryPartKey !== reasoningSummaryPartKey)) {
          providerEvents.push(createProviderReasoningSummaryTextChunkEvent("\n\n"));
          this.reasoningPartSeparatorPending = false;
        }
        this.lastReasoningSummaryPartKey = reasoningSummaryPartKey;
        providerEvents.push(createProviderReasoningSummaryTextChunkEvent(value.delta));
        return providerEvents;
      }

      case "response.reasoning_summary_text.done": {
        if (typeof value.item_id !== "string") {
          this.ignoreSseEvent("malformed_reasoning_done", value.type);
          return [];
        }

        this.reasoningPartSeparatorPending = true;
        return [];
      }

      case "response.reasoning_summary_part.added": {
        const reasoningSummaryPartAdded = ReasoningSummaryPartAddedChunkSchema.safeParse(value);
        if (!reasoningSummaryPartAdded.success) {
          this.ignoreSseEvent("malformed_reasoning_summary_part_added", value.type);
          return [];
        }

        this.updateTrackedReasoningSummaryTextByItemId({
          itemId: reasoningSummaryPartAdded.data.item_id,
          outputIndex: reasoningSummaryPartAdded.data.output_index,
          summaryIndex: reasoningSummaryPartAdded.data.summary_index,
          createNextSummaryText: (currentSummaryText) => currentSummaryText,
        });
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.reasoning_summary_part_added", {
          itemId: reasoningSummaryPartAdded.data.item_id,
          summaryIndex: reasoningSummaryPartAdded.data.summary_index,
        });
        return [];
      }

      case "response.function_call_arguments.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          this.ignoreSseEvent("malformed_function_call_arguments_delta", value.type);
          return [];
        }

        this.functionCallArgumentDeltaEventCount += 1;
        this.functionCallArgumentCharacterCount += value.delta.length;
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.function_call_arguments_delta_received", {
          functionCallArgumentDeltaLength: value.delta.length,
          functionCallArgumentDeltaEventCount: this.functionCallArgumentDeltaEventCount,
          functionCallArgumentCharacterCount: this.functionCallArgumentCharacterCount,
        });
        const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(value.item_id);
        if (pendingFunctionCallState) {
          pendingFunctionCallState.argumentsText += value.delta;
          this.updateTrackedFunctionCallArgumentsTextByItemId(value.item_id, pendingFunctionCallState.argumentsText);
        } else {
          this.pendingFunctionCallArgumentsTextByItemId.set(
            value.item_id,
            `${this.pendingFunctionCallArgumentsTextByItemId.get(value.item_id) ?? ""}${value.delta}`,
          );
        }
        return [];
      }

      case "response.output_item.added": {
        const outputItemAdded = OutputItemAddedChunkSchema.safeParse(value);
        if (!outputItemAdded.success) {
          this.ignoreSseEvent("malformed_output_item_added", value.type);
          return [];
        }

        this.setTrackedOutputItemAtIndex({
          outputIndex: outputItemAdded.data.output_index,
          responseOutputItem: outputItemAdded.data.item,
        });
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.output_item_added", {
          outputIndex: outputItemAdded.data.output_index,
          outputItemType: outputItemAdded.data.item.type,
          trackedOutputItemCount: this.trackedOutputItemsByIndex.size,
        });
        const functionCallItem = readOpenAiFunctionCallOutputItem(outputItemAdded.data.item);
        if (functionCallItem) {
          this.updatePendingFunctionCallStateFromOutputItem({
            functionCallItem,
            shouldRecordRequestedToolCallIfReady: false,
          });
        }
        return [];
      }

      case "response.function_call_arguments.done": {
        const functionCallArgumentsDone = FunctionCallArgumentsDoneChunkSchema.safeParse(value);
        if (!functionCallArgumentsDone.success) {
          this.ignoreSseEvent("malformed_function_call_arguments_done", value.type);
          return [];
        }

        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.function_call_arguments_completed", {
          itemId: functionCallArgumentsDone.data.item_id,
          functionArgumentsLength: functionCallArgumentsDone.data.arguments.length,
        });

        const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(functionCallArgumentsDone.data.item_id);
        if (pendingFunctionCallState) {
          pendingFunctionCallState.argumentsText = functionCallArgumentsDone.data.arguments;
          this.updateTrackedFunctionCallArgumentsTextByItemId(functionCallArgumentsDone.data.item_id, functionCallArgumentsDone.data.arguments);
          this.recordRequestedToolCallIfReady(functionCallArgumentsDone.data.item_id);
        } else {
          this.pendingFunctionCallArgumentsTextByItemId.set(functionCallArgumentsDone.data.item_id, functionCallArgumentsDone.data.arguments);
        }
        return [];
      }

      case "response.output_item.done": {
        const outputItemDone = OutputItemDoneChunkSchema.safeParse(value);
        if (!outputItemDone.success) {
          this.ignoreSseEvent("malformed_output_item_done", value.type);
          return [];
        }

        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.output_item_completed", {
          outputIndex: outputItemDone.data.output_index ?? null,
          outputItemType: outputItemDone.data.item.type,
        });

        if (outputItemDone.data.output_index !== undefined) {
          this.setTrackedOutputItemAtIndex({
            outputIndex: outputItemDone.data.output_index,
            responseOutputItem: outputItemDone.data.item,
          });
        } else if (typeof outputItemDone.data.item.id === "string") {
          this.updateTrackedOutputItemByItemId(outputItemDone.data.item.id, (trackedOutputItem) =>
            trackedOutputItem.type === outputItemDone.data.item.type
              ? this.mergeTrackedAndResponseOutputItem({
                  trackedOutputItem,
                  responseOutputItem: outputItemDone.data.item,
                })
              : outputItemDone.data.item
          );
        }
        const functionCallItem = readOpenAiFunctionCallOutputItem(outputItemDone.data.item);
        if (functionCallItem) {
          this.updatePendingFunctionCallStateFromOutputItem({
            functionCallItem,
            shouldRecordRequestedToolCallIfReady: true,
          });
        }
        return [];
      }

      case "response.completed": {
        const completedResponse = ResponseCompletedChunkSchema.parse(value);
        const providerEvents = this.createPendingReasoningCompletedEvents();
        this.finished = true;
        const responseUsage = normalizeOpenAiUsage(completedResponse.response.usage);
        const responseOutputItems = this.createTrackedBackedResponseOutputItems(completedResponse.response.output);
        this.recordRequestedToolCallsFromResponseOutputItems(responseOutputItems);
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.terminal_observed", {
          terminalKind: this.pendingRequestedToolCalls.length > 1
            ? "tool_calls_requested"
            : this.pendingRequestedToolCalls.length === 1
              ? "tool_call_requested"
              : "completed",
          ...summarizeTokenUsageForDiagnostics(responseUsage),
        });
        if (this.pendingRequestedToolCalls.length > 0) {
          this.terminalState = this.createToolCallTerminalState({
            responseOutputItems,
            usage: responseUsage,
          });
          providerEvents.push(createProviderToolCallsRequestedEvent(this.pendingRequestedToolCalls));
          return providerEvents;
        }
        this.terminalState = { terminalKind: "completed" };
        providerEvents.push(createProviderCompletedEvent(responseUsage));
        return providerEvents;
      }

      case "response.incomplete": {
        const incompleteResponse = ResponseIncompleteChunkSchema.parse(value);
        const providerEvents = this.createPendingReasoningCompletedEvents();
        this.finished = true;
        const responseUsage = normalizeOpenAiUsage(incompleteResponse.response.usage);
        const responseOutputItems = this.createTrackedBackedResponseOutputItems(incompleteResponse.response.output);
        this.recordRequestedToolCallsFromResponseOutputItems(responseOutputItems);
        logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.terminal_observed", {
          terminalKind: this.pendingRequestedToolCalls.length > 1
            ? "tool_calls_requested"
            : this.pendingRequestedToolCalls.length === 1
              ? "tool_call_requested"
              : "incomplete",
          incompleteReason: incompleteResponse.response.incomplete_details?.reason ?? "unknown",
          ...summarizeTokenUsageForDiagnostics(responseUsage),
        });
        if (this.pendingRequestedToolCalls.length > 0) {
          this.terminalState = this.createToolCallTerminalState({
            responseOutputItems,
            usage: responseUsage,
          });
          providerEvents.push(createProviderToolCallsRequestedEvent(this.pendingRequestedToolCalls));
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
        const failedResponse = ResponseFailedChunkSchema.safeParse(value);
        if (!failedResponse.success) {
          throw new Error("OpenAI response failed: unknown error");
        }

        const errorMessage = failedResponse.data.response.error?.message ?? "unknown error";
        const errorCode = failedResponse.data.response.error?.code;
        throw new Error(`OpenAI response failed: ${errorMessage}${errorCode ? ` | code=${errorCode}` : ""}`);
      }

      case "error": {
        const error = ErrorChunkSchema.parse(value);
        throw new Error(error.message);
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
      trackedOutputItemCount: this.trackedOutputItemsByIndex.size,
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

  private listTrackedOutputItems(): unknown[] {
    return [...this.trackedOutputItemsByIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, outputItem]) => outputItem);
  }

  private updateTrackedOutputItemByItemId(
    itemId: string,
    createUpdatedOutputItem: (outputItem: OpenAiResponseObject) => unknown,
  ): boolean {
    for (const [outputIndex, outputItem] of this.trackedOutputItemsByIndex.entries()) {
      if (!isOpenAiResponseObject(outputItem) || typeof outputItem.id !== "string" || outputItem.id !== itemId) {
        continue;
      }

      this.trackedOutputItemsByIndex.set(outputIndex, createUpdatedOutputItem(outputItem));
      return true;
    }

    return false;
  }

  private setTrackedOutputItemAtIndex(input: {
    outputIndex: number;
    responseOutputItem: unknown;
  }): void {
    if (!isOpenAiResponseObject(input.responseOutputItem) || typeof input.responseOutputItem.id !== "string") {
      this.trackedOutputItemsByIndex.set(input.outputIndex, input.responseOutputItem);
      return;
    }

    let nextTrackedOutputItem: unknown = input.responseOutputItem;
    for (const [trackedOutputIndex, trackedOutputItem] of this.trackedOutputItemsByIndex.entries()) {
      if (
        trackedOutputIndex === input.outputIndex ||
        !isOpenAiResponseObject(trackedOutputItem) ||
        trackedOutputItem.type !== input.responseOutputItem.type ||
        trackedOutputItem.id !== input.responseOutputItem.id
      ) {
        continue;
      }

      nextTrackedOutputItem = this.mergeTrackedAndResponseOutputItem({
        trackedOutputItem,
        responseOutputItem: input.responseOutputItem,
      });
      this.trackedOutputItemsByIndex.delete(trackedOutputIndex);
      break;
    }

    const currentOutputItemAtIndex = this.trackedOutputItemsByIndex.get(input.outputIndex);
    if (
      isOpenAiResponseObject(currentOutputItemAtIndex) &&
      currentOutputItemAtIndex.type === input.responseOutputItem.type &&
      currentOutputItemAtIndex.id === input.responseOutputItem.id
    ) {
      nextTrackedOutputItem = this.mergeTrackedAndResponseOutputItem({
        trackedOutputItem: currentOutputItemAtIndex,
        responseOutputItem: isOpenAiResponseObject(nextTrackedOutputItem) ? nextTrackedOutputItem : input.responseOutputItem,
      });
    }

    this.trackedOutputItemsByIndex.set(input.outputIndex, nextTrackedOutputItem);
  }

  private updateTrackedReasoningSummaryTextByItemId(input: {
    itemId: string;
    outputIndex?: number | undefined;
    summaryIndex: number;
    createNextSummaryText: (currentSummaryText: string) => string;
  }): void {
    const didUpdateExistingTrackedOutputItem = this.updateTrackedOutputItemByItemId(input.itemId, (trackedOutputItem) => {
      if (trackedOutputItem.type !== "reasoning") {
        return trackedOutputItem;
      }

      return updateOpenAiReasoningSummaryText({
        reasoningOutputItem: trackedOutputItem,
        summaryIndex: input.summaryIndex,
        createNextSummaryText: input.createNextSummaryText,
      });
    });
    if (didUpdateExistingTrackedOutputItem) {
      return;
    }

    const outputIndex = input.outputIndex ?? this.reserveUnindexedTrackedOutputItemIndex();
    const trackedOutputItemAtIndex = this.trackedOutputItemsByIndex.get(outputIndex);
    if (isOpenAiResponseObject(trackedOutputItemAtIndex) && trackedOutputItemAtIndex.type === "reasoning") {
      this.trackedOutputItemsByIndex.set(
        outputIndex,
        updateOpenAiReasoningSummaryText({
          reasoningOutputItem: trackedOutputItemAtIndex,
          summaryIndex: input.summaryIndex,
          createNextSummaryText: input.createNextSummaryText,
        }),
      );
      return;
    }

    this.trackedOutputItemsByIndex.set(outputIndex, createTrackedOpenAiReasoningOutputItem({
      itemId: input.itemId,
      summaryIndex: input.summaryIndex,
      summaryText: input.createNextSummaryText(""),
    }));
  }

  private updateTrackedFunctionCallArgumentsTextByItemId(itemId: string, argumentsText: string): void {
    this.updateTrackedOutputItemByItemId(itemId, (trackedOutputItem) =>
      trackedOutputItem.type === "function_call"
        ? { ...trackedOutputItem, arguments: argumentsText }
        : trackedOutputItem
    );
  }

  private updateTrackedAssistantMessageTextByItemId(input: {
    itemId: string;
    outputIndex?: number | undefined;
    contentIndex: number;
    deltaText: string;
  }): void {
    const didUpdateExistingTrackedOutputItem = this.updateTrackedOutputItemByItemId(input.itemId, (trackedOutputItem) =>
      trackedOutputItem.type === "message"
        ? appendOpenAiAssistantOutputTextDelta({
            messageOutputItem: trackedOutputItem,
            contentIndex: input.contentIndex,
            deltaText: input.deltaText,
          })
        : trackedOutputItem
    );
    if (didUpdateExistingTrackedOutputItem) {
      return;
    }

    const outputIndex = input.outputIndex ?? this.reserveUnindexedTrackedOutputItemIndex();
    const trackedOutputItemAtIndex = this.trackedOutputItemsByIndex.get(outputIndex);
    if (isOpenAiResponseObject(trackedOutputItemAtIndex) && trackedOutputItemAtIndex.type === "message") {
      this.trackedOutputItemsByIndex.set(
        outputIndex,
        appendOpenAiAssistantOutputTextDelta({
          messageOutputItem: trackedOutputItemAtIndex,
          contentIndex: input.contentIndex,
          deltaText: input.deltaText,
        }),
      );
      return;
    }

    this.trackedOutputItemsByIndex.set(outputIndex, createTrackedOpenAiAssistantMessageOutputItem({
      itemId: input.itemId,
      contentIndex: input.contentIndex,
      text: input.deltaText,
    }));
  }

  private reserveUnindexedTrackedOutputItemIndex(): number {
    const reservedOutputIndex = this.nextUnindexedTrackedOutputItemIndex;
    this.nextUnindexedTrackedOutputItemIndex += 1;
    return reservedOutputIndex;
  }

  private mergeTrackedAndResponseOutputItem(input: {
    trackedOutputItem: OpenAiResponseObject;
    responseOutputItem: OpenAiResponseObject;
  }): unknown {
    if (input.trackedOutputItem.type === "function_call") {
      const trackedArguments = typeof input.trackedOutputItem.arguments === "string" && input.trackedOutputItem.arguments.length > 0
        ? input.trackedOutputItem.arguments
        : undefined;
      const responseArguments = typeof input.responseOutputItem.arguments === "string" && input.responseOutputItem.arguments.length > 0
        ? input.responseOutputItem.arguments
        : undefined;
      const mostCompleteArguments = responseArguments ?? trackedArguments;

      return {
        ...input.trackedOutputItem,
        ...input.responseOutputItem,
        ...(mostCompleteArguments !== undefined ? { arguments: mostCompleteArguments } : {}),
      };
    }

    if (input.trackedOutputItem.type === "message") {
      const responseOutputTextContentParts = listOpenAiOutputTextContentParts(input.responseOutputItem.content);
      const trackedOutputTextContentParts = listOpenAiOutputTextContentParts(input.trackedOutputItem.content);
      return {
        ...input.trackedOutputItem,
        ...input.responseOutputItem,
        ...(responseOutputTextContentParts.length > 0
          ? { content: input.responseOutputItem.content }
          : trackedOutputTextContentParts.length > 0
            ? { content: input.trackedOutputItem.content }
            : {}),
      };
    }

    if (input.trackedOutputItem.type !== "reasoning") {
      return { ...input.trackedOutputItem, ...input.responseOutputItem };
    }

    const trackedSummaryParts = listOpenAiReasoningSummaryTextParts(input.trackedOutputItem.summary);
    const responseSummaryParts = listOpenAiReasoningSummaryTextParts(input.responseOutputItem.summary);
    return {
      ...input.trackedOutputItem,
      ...input.responseOutputItem,
      summary: responseSummaryParts.length > 0 ? responseSummaryParts : trackedSummaryParts,
    };
  }

  // Tool-call continuation needs a replay-safe item list even when the terminal
  // response.output omits or weakens items we already observed in streamed
  // output_item and function_call_arguments events.
  private createTrackedBackedResponseOutputItems(responseOutputItems: readonly unknown[] | undefined): unknown[] {
    const trackedOutputItems = this.listTrackedOutputItems();
    if (trackedOutputItems.length === 0) {
      return responseOutputItems ? [...responseOutputItems] : [];
    }

    if (!responseOutputItems || responseOutputItems.length === 0) {
      return trackedOutputItems;
    }

    const responseOutputItemById = new Map<string, OpenAiResponseObject>();
    for (const responseOutputItem of responseOutputItems) {
      if (!isOpenAiResponseObject(responseOutputItem) || typeof responseOutputItem.id !== "string") {
        continue;
      }

      responseOutputItemById.set(responseOutputItem.id, responseOutputItem);
    }

    const consumedResponseOutputItemIds = new Set<string>();
    const mergedOutputItems: unknown[] = [];
    for (const trackedOutputItem of trackedOutputItems) {
      if (!isOpenAiResponseObject(trackedOutputItem) || typeof trackedOutputItem.id !== "string") {
        mergedOutputItems.push(trackedOutputItem);
        continue;
      }

      const responseOutputItem = responseOutputItemById.get(trackedOutputItem.id);
      if (!responseOutputItem || responseOutputItem.type !== trackedOutputItem.type) {
        mergedOutputItems.push(trackedOutputItem);
        continue;
      }

      consumedResponseOutputItemIds.add(trackedOutputItem.id);
      mergedOutputItems.push(
        this.mergeTrackedAndResponseOutputItem({ trackedOutputItem, responseOutputItem }),
      );
    }

    for (const responseOutputItem of responseOutputItems) {
      if (
        isOpenAiResponseObject(responseOutputItem) &&
        typeof responseOutputItem.id === "string" &&
        consumedResponseOutputItemIds.has(responseOutputItem.id)
      ) {
        continue;
      }

      mergedOutputItems.push(responseOutputItem);
    }

    return mergedOutputItems;
  }

  private recordRequestedToolCall(input: {
    itemId?: string;
    toolCallId: string;
    toolName: string;
    argumentsText: string;
  }): void {
    const toolCallRequest = createOpenAiToolCallRequest({
      toolName: input.toolName,
      argumentsText: input.argumentsText,
    });
    const existingRequestedToolCallIndex = this.pendingRequestedToolCalls.findIndex(
      (requestedToolCall) => requestedToolCall.toolCallId === input.toolCallId,
    );
    if (existingRequestedToolCallIndex >= 0) {
      this.pendingRequestedToolCalls[existingRequestedToolCallIndex] = {
        toolCallId: input.toolCallId,
        toolCallRequest,
      };
      return;
    }

    this.pendingRequestedToolCalls.push({
      toolCallId: input.toolCallId,
      toolCallRequest,
    });
    if (input.itemId) {
      const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.itemId);
      if (pendingFunctionCallState) {
        pendingFunctionCallState.hasRecordedToolCallRequest = true;
      }
    }
    logOpenAiDiagnosticEvent(this.diagnosticLogger, "stream.tool_call_ready", {
      toolCallId: input.toolCallId,
      functionArgumentsLength: input.argumentsText.length,
      ...summarizeOpenAiToolCallRequestForDiagnostics(toolCallRequest),
    });
  }

  private recordRequestedToolCallIfReady(itemId: string): void {
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(itemId);
    if (
      !pendingFunctionCallState ||
      pendingFunctionCallState.hasRecordedToolCallRequest ||
      !pendingFunctionCallState.argumentsText
    ) {
      return;
    }

    this.recordRequestedToolCall({
      itemId,
      toolCallId: pendingFunctionCallState.toolCallId,
      toolName: pendingFunctionCallState.toolName,
      argumentsText: pendingFunctionCallState.argumentsText,
    });
  }

  private updatePendingFunctionCallStateFromOutputItem(input: {
    functionCallItem: OpenAiFunctionCallOutputItem;
    shouldRecordRequestedToolCallIfReady: boolean;
  }): void {
    const pendingArgumentsText = this.pendingFunctionCallArgumentsTextByItemId.get(input.functionCallItem.itemId);
    const pendingFunctionCallState = this.pendingFunctionCallStateByItemId.get(input.functionCallItem.itemId) ?? {
      toolCallId: input.functionCallItem.toolCallId,
      toolName: input.functionCallItem.toolName,
      argumentsText: input.functionCallItem.argumentsText && input.functionCallItem.argumentsText.length > 0
        ? input.functionCallItem.argumentsText
        : pendingArgumentsText ?? "",
      hasRecordedToolCallRequest: false,
    };

    if (input.functionCallItem.argumentsText && input.functionCallItem.argumentsText.length > 0) {
      pendingFunctionCallState.argumentsText = input.functionCallItem.argumentsText;
    } else if (pendingFunctionCallState.argumentsText.length === 0 && pendingArgumentsText) {
      pendingFunctionCallState.argumentsText = pendingArgumentsText;
    }

    this.pendingFunctionCallStateByItemId.set(input.functionCallItem.itemId, pendingFunctionCallState);
    if (pendingFunctionCallState.argumentsText.length > 0) {
      this.updateTrackedFunctionCallArgumentsTextByItemId(input.functionCallItem.itemId, pendingFunctionCallState.argumentsText);
      this.pendingFunctionCallArgumentsTextByItemId.delete(input.functionCallItem.itemId);
    }
    if (input.shouldRecordRequestedToolCallIfReady) {
      this.recordRequestedToolCallIfReady(input.functionCallItem.itemId);
    }
  }

  private recordRequestedToolCallsFromResponseOutputItems(responseOutputItems: readonly unknown[]): void {
    for (const responseOutputItem of responseOutputItems) {
      const functionCallOutputItem = readOpenAiFunctionCallOutputItem(responseOutputItem);
      if (!functionCallOutputItem || !functionCallOutputItem.argumentsText) {
        continue;
      }

      this.recordRequestedToolCall({
        itemId: functionCallOutputItem.itemId,
        toolCallId: functionCallOutputItem.toolCallId,
        toolName: functionCallOutputItem.toolName,
        argumentsText: functionCallOutputItem.argumentsText,
      });
    }
  }

  private createToolCallTerminalState(input: {
    responseOutputItems: unknown[];
    usage: TokenUsage;
  }): OpenAiResponseStepToolCallRequestedState | OpenAiResponseStepToolCallsRequestedState {
    if (this.pendingRequestedToolCalls.length === 1) {
      const requestedToolCall = this.pendingRequestedToolCalls[0];
      if (!requestedToolCall) {
        throw new Error("OpenAI stream tried to finish an empty tool-call batch.");
      }

      return {
        terminalKind: "tool_call_requested",
        toolCallId: requestedToolCall.toolCallId,
        toolCallRequest: requestedToolCall.toolCallRequest,
        responseOutputItems: input.responseOutputItems,
        usage: input.usage,
      };
    }

    return {
      terminalKind: "tool_calls_requested",
      requestedToolCalls: [...this.pendingRequestedToolCalls],
      responseOutputItems: input.responseOutputItems,
      usage: input.usage,
    };
  }

  private createPendingReasoningCompletedEvents(): ProviderStreamEvent[] {
    if (this.isReasoningSummaryInProgress && this.reasoningStartedAtMs !== undefined) {
      const reasoningCompletedEvent = createProviderReasoningSummaryCompletedEvent(
        Math.max(0, Math.round(performance.now() - this.reasoningStartedAtMs)),
      );
      this.reasoningStartedAtMs = undefined;
      this.isReasoningSummaryInProgress = false;
      this.reasoningPartSeparatorPending = false;
      this.lastReasoningSummaryPartKey = undefined;
      return [reasoningCompletedEvent];
    }

    return [];
  }
}

function appendOpenAiAssistantOutputTextDelta(input: {
  messageOutputItem: OpenAiResponseObject;
  contentIndex: number;
  deltaText: string;
}): OpenAiResponseObject {
  const contentParts = Array.isArray(input.messageOutputItem.content) ? [...input.messageOutputItem.content] : [];
  const currentContentPart = contentParts[input.contentIndex];
  const currentText = isOpenAiOutputTextContentPart(currentContentPart) ? currentContentPart.text : "";
  contentParts[input.contentIndex] = {
    type: "output_text",
    text: `${currentText}${input.deltaText}`,
  };

  return {
    ...input.messageOutputItem,
    content: contentParts,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function updateOpenAiReasoningSummaryText(input: {
  reasoningOutputItem: OpenAiResponseObject;
  summaryIndex: number;
  createNextSummaryText: (currentSummaryText: string) => string;
}): OpenAiResponseObject {
  const summaryParts = Array.isArray(input.reasoningOutputItem.summary) ? [...input.reasoningOutputItem.summary] : [];
  const currentSummaryPart = summaryParts[input.summaryIndex];
  const currentSummaryText = isOpenAiReasoningSummaryTextPart(currentSummaryPart) ? currentSummaryPart.text : "";
  summaryParts[input.summaryIndex] = {
    type: "summary_text",
    text: input.createNextSummaryText(currentSummaryText),
  };

  return {
    ...input.reasoningOutputItem,
    summary: summaryParts,
  };
}

function createTrackedOpenAiReasoningOutputItem(input: {
  itemId: string;
  summaryIndex: number;
  summaryText: string;
}): OpenAiResponseObject {
  const summaryParts: unknown[] = [];
  summaryParts[input.summaryIndex] = {
    type: "summary_text",
    text: input.summaryText,
  };

  return {
    type: "reasoning",
    id: input.itemId,
    summary: summaryParts,
  };
}

function createTrackedOpenAiAssistantMessageOutputItem(input: {
  itemId: string;
  contentIndex: number;
  text: string;
}): OpenAiResponseObject {
  const contentParts: unknown[] = [];
  contentParts[input.contentIndex] = {
    type: "output_text",
    text: input.text,
  };

  return {
    type: "message",
    id: input.itemId,
    role: "assistant",
    content: contentParts,
  };
}
