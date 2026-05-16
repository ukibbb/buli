import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ProviderStreamEvent,
  TokenUsage,
  ToolCallRequest,
} from "@buli/contracts";
import { z } from "zod";
import { createOpenAiToolCallRequest } from "./toolDefinitions.ts";
import { OpenAiUsageSchema, normalizeOpenAiUsage } from "./usage.ts";

const TextDeltaChunkSchema = z.object({
  type: z.literal("response.output_text.delta"),
  item_id: z.string(),
  delta: z.string(),
});

const ReasoningDeltaChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_text.delta"),
  item_id: z.string(),
  summary_index: z.number().int().nonnegative().optional(),
  delta: z.string(),
});

const ReasoningDoneChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_text.done"),
  item_id: z.string(),
  summary_index: z.number().int().nonnegative().optional(),
});

const ReasoningSummaryPartAddedChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_part.added"),
  item_id: z.string(),
  summary_index: z.number().int().nonnegative(),
});

const FunctionCallArgumentsDeltaChunkSchema = z.object({
  type: z.literal("response.function_call_arguments.delta"),
  item_id: z.string(),
  delta: z.string(),
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

type OpenAiResponseStepToolCallRequestedState = {
  terminalKind: "tool_call_requested";
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  responseOutputItems: unknown[];
  usage: TokenUsage;
};

type PendingOpenAiResponseStepToolCallRequestedState = Omit<OpenAiResponseStepToolCallRequestedState, "responseOutputItems" | "usage">;

type OpenAiResponseStepCompletedState = {
  terminalKind: "completed";
};

type OpenAiResponseStepIncompleteState = {
  terminalKind: "incomplete";
};

export type OpenAiResponseStepTerminalState =
  | OpenAiResponseStepToolCallRequestedState
  | OpenAiResponseStepCompletedState
  | OpenAiResponseStepIncompleteState;

export type OpenAiStreamParserOptions = {
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

type PendingFunctionCallState = {
  toolCallId: string;
  toolName: string;
  argumentsText: string;
  hasEmittedProviderEvent: boolean;
};

type OpenAiChunkObject = {
  type: string;
  [fieldName: string]: unknown;
};

function nextFrameBoundary(buffer: string): { index: number; length: number } | undefined {
  const boundaries = [
    { index: buffer.indexOf("\n\n"), length: 2 },
    { index: buffer.indexOf("\r\n\r\n"), length: 4 },
  ].filter((boundary) => boundary.index >= 0);

  if (boundaries.length === 0) {
    return undefined;
  }

  boundaries.sort((left, right) => left.index - right.index);
  return boundaries[0];
}

function extractData(frame: string): string {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += chunk.value;

    while (true) {
      const boundary = nextFrameBoundary(buffer);
      if (!boundary) {
        break;
      }

      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);

      const data = extractData(frame);

      if (data) {
        yield data;
      }
    }
  }

  const data = extractData(buffer);

  if (data) {
    yield data;
  }
}

function isOpenAiChunkObject(value: unknown): value is OpenAiChunkObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string";
}

function isOpenAiReasoningSummaryTextPart(value: unknown): value is { type: "summary_text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "summary_text" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

function listOpenAiReasoningSummaryTextParts(value: unknown): Array<{ type: "summary_text"; text: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((summaryPart) => isOpenAiReasoningSummaryTextPart(summaryPart) ? [summaryPart] : []);
}

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

function createProviderCompletedEvent(input: { usage: z.infer<typeof OpenAiUsageSchema> }): ProviderStreamEvent {
  return {
    type: "completed",
    usage: normalizeOpenAiUsage(input.usage),
  };
}

function createProviderIncompleteEvent(input: {
  incompleteReason: string;
  usage: z.infer<typeof OpenAiUsageSchema>;
}): ProviderStreamEvent {
  return {
    type: "incomplete",
    incompleteReason: input.incompleteReason,
    usage: normalizeOpenAiUsage(input.usage),
  };
}

// Reasoning summary timing is captured provider-side because the provider is
// closest to the SSE clock. reasoning_summary_started is emitted once per
// turn on the first reasoning delta. reasoning_summary_completed is emitted
// exactly once, on the first non-reasoning event that arrives after reasoning
// has started (output_text.delta or response.completed). Between consecutive
// reasoning summary parts we inject a paragraph separator so the UI can
// render them as one entry.
export async function* parseOpenAiStream(
  response: Response,
  options: OpenAiStreamParserOptions = {},
): AsyncGenerator<ProviderStreamEvent, OpenAiResponseStepTerminalState> {
  if (!response.body) {
    throw new Error("OpenAI stream response body is missing");
  }

  const streamStartedAtMs = Date.now();
  let finished = false;
  let reasoningStartedAtMs: number | undefined;
  let isReasoningSummaryInProgress = false;
  let reasoningPartSeparatorPending = false;
  let terminalState: OpenAiResponseStepTerminalState | undefined;
  let pendingToolCallTerminalState: PendingOpenAiResponseStepToolCallRequestedState | undefined;
  const pendingFunctionCallStateByItemId = new Map<string, PendingFunctionCallState>();
  const trackedOutputItemsByIndex = new Map<number, unknown>();
  let sseFrameCount = 0;
  let ignoredSseEventCount = 0;
  let textDeltaEventCount = 0;
  let textDeltaCharacterCount = 0;
  let reasoningDeltaEventCount = 0;
  let reasoningDeltaCharacterCount = 0;
  let lastReasoningSummaryPartKey: string | undefined;
  let functionCallArgumentDeltaEventCount = 0;
  let functionCallArgumentCharacterCount = 0;

  logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.started", {
    contentType: response.headers.get("content-type") ?? null,
  });

  function listTrackedOutputItems(): unknown[] {
    return [...trackedOutputItemsByIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, outputItem]) => outputItem);
  }

  function updateTrackedOutputItemByItemId(
    itemId: string,
    createUpdatedOutputItem: (outputItem: OpenAiChunkObject) => unknown,
  ): boolean {
    for (const [outputIndex, outputItem] of trackedOutputItemsByIndex.entries()) {
      if (!isOpenAiChunkObject(outputItem) || typeof outputItem.id !== "string" || outputItem.id !== itemId) {
        continue;
      }

      trackedOutputItemsByIndex.set(outputIndex, createUpdatedOutputItem(outputItem));
      return true;
    }

    return false;
  }

  function updateTrackedReasoningSummaryTextByItemId(input: {
    itemId: string;
    summaryIndex: number;
    createNextSummaryText: (currentSummaryText: string) => string;
  }): void {
    updateTrackedOutputItemByItemId(input.itemId, (trackedOutputItem) => {
      if (trackedOutputItem.type !== "reasoning") {
        return trackedOutputItem;
      }

      const summaryParts = Array.isArray(trackedOutputItem.summary) ? [...trackedOutputItem.summary] : [];
      const currentSummaryPart = summaryParts[input.summaryIndex];
      const currentSummaryText = isOpenAiReasoningSummaryTextPart(currentSummaryPart) ? currentSummaryPart.text : "";
      summaryParts[input.summaryIndex] = {
        type: "summary_text",
        text: input.createNextSummaryText(currentSummaryText),
      };
      return {
        ...trackedOutputItem,
        summary: summaryParts,
      };
    });
  }

  function mergeTrackedAndResponseOutputItem(input: {
    trackedOutputItem: OpenAiChunkObject;
    responseOutputItem: OpenAiChunkObject;
  }): unknown {
    if (input.trackedOutputItem.type === "function_call") {
      const trackedArguments = typeof input.trackedOutputItem.arguments === "string"
        ? input.trackedOutputItem.arguments
        : undefined;
      const responseArguments = typeof input.responseOutputItem.arguments === "string"
        ? input.responseOutputItem.arguments
        : undefined;
      const mostCompleteArguments = trackedArguments && trackedArguments.length > 0
        ? trackedArguments
        : responseArguments ?? trackedArguments;

      return {
        ...input.responseOutputItem,
        ...input.trackedOutputItem,
        ...(mostCompleteArguments !== undefined ? { arguments: mostCompleteArguments } : {}),
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
  // response.output omits or weakens the function_call item we already observed
  // in streamed output_item events.
  function createTrackedBackedResponseOutputItems(responseOutputItems: readonly unknown[] | undefined): unknown[] {
    const trackedOutputItems = listTrackedOutputItems();
    if (trackedOutputItems.length === 0) {
      return responseOutputItems ? [...responseOutputItems] : [];
    }
    if (!responseOutputItems || responseOutputItems.length === 0) {
      return trackedOutputItems;
    }

    const responseOutputItemById = new Map<string, OpenAiChunkObject>();
    for (const responseOutputItem of responseOutputItems) {
      if (!isOpenAiChunkObject(responseOutputItem) || typeof responseOutputItem.id !== "string") {
        continue;
      }

      responseOutputItemById.set(responseOutputItem.id, responseOutputItem);
    }

    const consumedResponseOutputItemIds = new Set<string>();
    const mergedOutputItems: unknown[] = [];
    for (const trackedOutputItem of trackedOutputItems) {
      if (!isOpenAiChunkObject(trackedOutputItem) || typeof trackedOutputItem.id !== "string") {
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
        mergeTrackedAndResponseOutputItem({ trackedOutputItem, responseOutputItem }),
      );
    }

    for (const responseOutputItem of responseOutputItems) {
      if (
        isOpenAiChunkObject(responseOutputItem) &&
        typeof responseOutputItem.id === "string" &&
        consumedResponseOutputItemIds.has(responseOutputItem.id)
      ) {
        continue;
      }

      mergedOutputItems.push(responseOutputItem);
    }

    return mergedOutputItems;
  }

  function createToolCallRequest(toolCallState: PendingFunctionCallState): ToolCallRequest {
    return createOpenAiToolCallRequest({
      toolName: toolCallState.toolName,
      argumentsText: toolCallState.argumentsText,
    });
  }

  function emitRequestedToolCallIfReady(itemId: string): ProviderStreamEvent | undefined {
    const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(itemId);
    if (!pendingFunctionCallState || pendingFunctionCallState.hasEmittedProviderEvent || !pendingFunctionCallState.argumentsText) {
      return undefined;
    }

    pendingFunctionCallState.hasEmittedProviderEvent = true;
    const toolCallRequest = createToolCallRequest(pendingFunctionCallState);
    pendingToolCallTerminalState = {
      terminalKind: "tool_call_requested",
      toolCallId: pendingFunctionCallState.toolCallId,
      toolCallRequest,
    };
    logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.tool_call_ready", {
      toolCallId: pendingFunctionCallState.toolCallId,
      toolName: pendingFunctionCallState.toolName,
      functionArgumentsLength: pendingFunctionCallState.argumentsText.length,
      ...(toolCallRequest.toolName === "bash"
        ? {
            shellCommandLength: toolCallRequest.shellCommand.length,
            commandDescriptionLength: toolCallRequest.commandDescription.length,
            hasWorkingDirectoryPath: toolCallRequest.workingDirectoryPath !== undefined,
            hasTimeoutMilliseconds: toolCallRequest.timeoutMilliseconds !== undefined,
          }
        : {}),
    });
    return createProviderToolCallRequestedEvent(pendingFunctionCallState.toolCallId, toolCallRequest);
  }

  async function* emitPendingReasoningCompletedEvent(): AsyncGenerator<ProviderStreamEvent> {
    if (isReasoningSummaryInProgress && reasoningStartedAtMs !== undefined) {
      yield createProviderReasoningSummaryCompletedEvent(Math.max(0, Math.round(performance.now() - reasoningStartedAtMs)));
      reasoningStartedAtMs = undefined;
      isReasoningSummaryInProgress = false;
      reasoningPartSeparatorPending = false;
      lastReasoningSummaryPartKey = undefined;
    }
  }

  for await (const data of readSseData(response.body)) {
    if (data === "[DONE]") {
      break;
    }

    sseFrameCount += 1;
    const value = JSON.parse(data) as unknown;
    if (!isOpenAiChunkObject(value)) {
      ignoredSseEventCount += 1;
      logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
        reason: "not_object_with_type",
        sseFrameCount,
      });
      continue;
    }

    logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_received", {
      openAiEventType: value.type,
      sseFrameCount,
    });

    switch (value.type) {
      case "response.output_text.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_output_text_delta",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        textDeltaEventCount += 1;
        textDeltaCharacterCount += value.delta.length;
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.text_delta_received", {
          textDeltaLength: value.delta.length,
          textDeltaEventCount,
          textDeltaCharacterCount,
        });
        yield* emitPendingReasoningCompletedEvent();
        yield createProviderTextChunkEvent(value.delta);
        continue;
      }

      case "response.reasoning_summary_text.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_reasoning_delta",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        const summaryIndex = typeof value.summary_index === "number" && Number.isInteger(value.summary_index)
          ? value.summary_index
          : 0;
        updateTrackedReasoningSummaryTextByItemId({
          itemId: value.item_id,
          summaryIndex,
          createNextSummaryText: (currentSummaryText) => `${currentSummaryText}${value.delta}`,
        });
        reasoningDeltaEventCount += 1;
        reasoningDeltaCharacterCount += value.delta.length;
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.reasoning_delta_received", {
          itemId: value.item_id,
          summaryIndex,
          reasoningDeltaLength: value.delta.length,
          reasoningDeltaEventCount,
          reasoningDeltaCharacterCount,
        });
        if (!isReasoningSummaryInProgress) {
          reasoningStartedAtMs = performance.now();
          isReasoningSummaryInProgress = true;
          yield createProviderReasoningSummaryStartedEvent();
        }
        const reasoningSummaryPartKey = `${value.item_id}:${summaryIndex}`;
        if (reasoningPartSeparatorPending || (lastReasoningSummaryPartKey && lastReasoningSummaryPartKey !== reasoningSummaryPartKey)) {
          yield createProviderReasoningSummaryTextChunkEvent("\n\n");
          reasoningPartSeparatorPending = false;
        }
        lastReasoningSummaryPartKey = reasoningSummaryPartKey;
        yield createProviderReasoningSummaryTextChunkEvent(value.delta);
        continue;
      }

      case "response.reasoning_summary_text.done": {
        if (typeof value.item_id !== "string") {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_reasoning_done",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        reasoningPartSeparatorPending = true;
        continue;
      }

      case "response.reasoning_summary_part.added": {
        const reasoningSummaryPartAdded = ReasoningSummaryPartAddedChunkSchema.safeParse(value);
        if (!reasoningSummaryPartAdded.success) {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_reasoning_summary_part_added",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        updateTrackedReasoningSummaryTextByItemId({
          itemId: reasoningSummaryPartAdded.data.item_id,
          summaryIndex: reasoningSummaryPartAdded.data.summary_index,
          createNextSummaryText: (currentSummaryText) => currentSummaryText,
        });
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.reasoning_summary_part_added", {
          itemId: reasoningSummaryPartAdded.data.item_id,
          summaryIndex: reasoningSummaryPartAdded.data.summary_index,
        });
        continue;
      }

      case "response.function_call_arguments.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_function_call_arguments_delta",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        functionCallArgumentDeltaEventCount += 1;
        functionCallArgumentCharacterCount += value.delta.length;
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.function_call_arguments_delta_received", {
          functionCallArgumentDeltaLength: value.delta.length,
          functionCallArgumentDeltaEventCount,
          functionCallArgumentCharacterCount,
        });
        const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(value.item_id);
        if (pendingFunctionCallState) {
          pendingFunctionCallState.argumentsText += value.delta;
        }
        continue;
      }

      case "response.output_item.added": {
        const outputItemAdded = OutputItemAddedChunkSchema.safeParse(value);
        if (!outputItemAdded.success) {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_output_item_added",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        trackedOutputItemsByIndex.set(outputItemAdded.data.output_index, outputItemAdded.data.item);
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.output_item_added", {
          outputIndex: outputItemAdded.data.output_index,
          outputItemType: outputItemAdded.data.item.type,
          trackedOutputItemCount: trackedOutputItemsByIndex.size,
        });
        if (outputItemAdded.data.item.type === "function_call") {
          const functionCallItem = outputItemAdded.data.item as {
            id?: string;
            call_id?: string;
            name?: string;
            arguments?: string;
          };
          if (functionCallItem.id && functionCallItem.call_id && functionCallItem.name) {
            pendingFunctionCallStateByItemId.set(functionCallItem.id, {
              toolCallId: functionCallItem.call_id,
              toolName: functionCallItem.name,
              argumentsText: functionCallItem.arguments ?? "",
              hasEmittedProviderEvent: false,
            });
          }
        }
        continue;
      }

      case "response.function_call_arguments.done": {
        const functionCallArgumentsDone = FunctionCallArgumentsDoneChunkSchema.safeParse(value);
        if (!functionCallArgumentsDone.success) {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_function_call_arguments_done",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.function_call_arguments_completed", {
          itemId: functionCallArgumentsDone.data.item_id,
          functionArgumentsLength: functionCallArgumentsDone.data.arguments.length,
        });

        const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(functionCallArgumentsDone.data.item_id);
        if (pendingFunctionCallState) {
          pendingFunctionCallState.argumentsText = functionCallArgumentsDone.data.arguments;
          updateTrackedOutputItemByItemId(functionCallArgumentsDone.data.item_id, (trackedOutputItem) =>
            trackedOutputItem.type === "function_call"
              ? { ...trackedOutputItem, arguments: functionCallArgumentsDone.data.arguments }
              : trackedOutputItem,
          );
          const requestedToolCallEvent = emitRequestedToolCallIfReady(functionCallArgumentsDone.data.item_id);
          if (requestedToolCallEvent) {
            yield* emitPendingReasoningCompletedEvent();
            yield requestedToolCallEvent;
          }
        }
        continue;
      }

      case "response.output_item.done": {
        const outputItemDone = OutputItemDoneChunkSchema.safeParse(value);
        if (!outputItemDone.success) {
          ignoredSseEventCount += 1;
          logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
            reason: "malformed_output_item_done",
            openAiEventType: value.type,
            sseFrameCount,
          });
          continue;
        }

        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.output_item_completed", {
          outputIndex: outputItemDone.data.output_index ?? null,
          outputItemType: outputItemDone.data.item.type,
        });

        if (outputItemDone.data.output_index !== undefined) {
          const trackedOutputItem = trackedOutputItemsByIndex.get(outputItemDone.data.output_index);
          trackedOutputItemsByIndex.set(
            outputItemDone.data.output_index,
            isOpenAiChunkObject(trackedOutputItem) && trackedOutputItem.type === outputItemDone.data.item.type
              ? mergeTrackedAndResponseOutputItem({
                  trackedOutputItem,
                  responseOutputItem: outputItemDone.data.item,
                })
              : outputItemDone.data.item,
          );
        } else if (typeof outputItemDone.data.item.id === "string") {
          updateTrackedOutputItemByItemId(outputItemDone.data.item.id, (trackedOutputItem) =>
            trackedOutputItem.type === outputItemDone.data.item.type
              ? mergeTrackedAndResponseOutputItem({
                  trackedOutputItem,
                  responseOutputItem: outputItemDone.data.item,
                })
              : outputItemDone.data.item,
          );
        }
        if (outputItemDone.data.item.type === "function_call") {
          const functionCallItem = outputItemDone.data.item as {
            id?: string;
            call_id?: string;
            name?: string;
            arguments?: string;
          };
          if (functionCallItem.id && functionCallItem.call_id && functionCallItem.name) {
            const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(functionCallItem.id) ?? {
              toolCallId: functionCallItem.call_id,
              toolName: functionCallItem.name,
              argumentsText: functionCallItem.arguments ?? "",
              hasEmittedProviderEvent: false,
            };
            if (functionCallItem.arguments) {
              pendingFunctionCallState.argumentsText = functionCallItem.arguments;
            }
            pendingFunctionCallStateByItemId.set(functionCallItem.id, pendingFunctionCallState);
            const requestedToolCallEvent = emitRequestedToolCallIfReady(functionCallItem.id);
            if (requestedToolCallEvent) {
              yield* emitPendingReasoningCompletedEvent();
              yield requestedToolCallEvent;
            }
          }
        }
        continue;
      }

      case "response.completed": {
        const completedResponse = ResponseCompletedChunkSchema.parse(value);
        yield* emitPendingReasoningCompletedEvent();
        finished = true;
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.terminal_observed", {
          terminalKind: pendingToolCallTerminalState ? "tool_call_requested" : "completed",
          ...summarizeTokenUsageForDiagnostics(normalizeOpenAiUsage(completedResponse.response.usage)),
        });
        if (pendingToolCallTerminalState) {
          terminalState = {
            ...pendingToolCallTerminalState,
            responseOutputItems: createTrackedBackedResponseOutputItems(completedResponse.response.output),
            usage: normalizeOpenAiUsage(completedResponse.response.usage),
          };
          continue;
        }
        terminalState = { terminalKind: "completed" };
        yield createProviderCompletedEvent({ usage: completedResponse.response.usage });
        continue;
      }

      case "response.incomplete": {
        const incompleteResponse = ResponseIncompleteChunkSchema.parse(value);
        yield* emitPendingReasoningCompletedEvent();
        finished = true;
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.terminal_observed", {
          terminalKind: pendingToolCallTerminalState ? "tool_call_requested" : "incomplete",
          incompleteReason: incompleteResponse.response.incomplete_details?.reason ?? "unknown",
          ...summarizeTokenUsageForDiagnostics(normalizeOpenAiUsage(incompleteResponse.response.usage)),
        });
        if (pendingToolCallTerminalState) {
          terminalState = {
            ...pendingToolCallTerminalState,
            responseOutputItems: createTrackedBackedResponseOutputItems(incompleteResponse.response.output),
            usage: normalizeOpenAiUsage(incompleteResponse.response.usage),
          };
          continue;
        }
        terminalState = { terminalKind: "incomplete" };
        yield createProviderIncompleteEvent({
          incompleteReason: incompleteResponse.response.incomplete_details?.reason ?? "unknown",
          usage: incompleteResponse.response.usage,
        });
        continue;
      }

      case "error": {
        const error = ErrorChunkSchema.parse(value);
        throw new Error(error.message);
      }

      default: {
        ignoredSseEventCount += 1;
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.sse_event_ignored", {
          reason: "unknown_event_type",
          openAiEventType: value.type,
          sseFrameCount,
        });
        continue;
      }
    }
  }

  if (!finished) {
    throw new Error("OpenAI stream ended without a completion event");
  }

  if (!terminalState) {
    throw new Error("OpenAI stream ended without a terminal step state");
  }

  logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.finished", {
    terminalKind: terminalState.terminalKind,
    durationMs: Date.now() - streamStartedAtMs,
    sseFrameCount,
    ignoredSseEventCount,
    textDeltaEventCount,
    textDeltaCharacterCount,
    reasoningDeltaEventCount,
    reasoningDeltaCharacterCount,
    functionCallArgumentDeltaEventCount,
    functionCallArgumentCharacterCount,
    trackedOutputItemCount: trackedOutputItemsByIndex.size,
  });

  return terminalState;
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
