import type { ProviderStreamEvent, ToolCallRequest } from "@buli/contracts";
import { z } from "zod";
import { OpenAiUsageSchema, normalizeOpenAiUsage } from "./usage.ts";

const TextDeltaChunkSchema = z.object({
  type: z.literal("response.output_text.delta"),
  item_id: z.string(),
  delta: z.string(),
});

const ReasoningDeltaChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_text.delta"),
  item_id: z.string(),
  delta: z.string(),
});

const ReasoningDoneChunkSchema = z.object({
  type: z.literal("response.reasoning_summary_text.done"),
  item_id: z.string(),
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
};

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
export async function* parseOpenAiStream(response: Response): AsyncGenerator<ProviderStreamEvent, OpenAiResponseStepTerminalState> {
  if (!response.body) {
    throw new Error("OpenAI stream response body is missing");
  }

  let finished = false;
  let reasoningStartedAtMs: number | undefined;
  let isReasoningSummaryInProgress = false;
  let reasoningPartSeparatorPending = false;
  let terminalState: OpenAiResponseStepTerminalState | undefined;
  const pendingFunctionCallStateByItemId = new Map<string, PendingFunctionCallState>();
  const trackedOutputItemsByIndex = new Map<number, unknown>();

  function listTrackedOutputItems(): unknown[] {
    return [...trackedOutputItemsByIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, outputItem]) => outputItem);
  }

  function createToolCallRequest(toolCallState: PendingFunctionCallState): ToolCallRequest {
    if (toolCallState.toolName !== "bash") {
      throw new Error(`Unsupported tool requested by OpenAI: ${toolCallState.toolName}`);
    }

    const parsedArguments = JSON.parse(toolCallState.argumentsText) as {
      command?: string;
      description?: string;
      workdir?: string | null;
      timeout?: number | null;
    };
    if (!parsedArguments.command || !parsedArguments.description) {
      throw new Error("OpenAI function call for bash is missing required arguments");
    }

    return {
      toolName: "bash",
      shellCommand: parsedArguments.command,
      commandDescription: parsedArguments.description,
      ...(typeof parsedArguments.workdir === "string" ? { workingDirectoryPath: parsedArguments.workdir } : {}),
      ...(typeof parsedArguments.timeout === "number" ? { timeoutMilliseconds: parsedArguments.timeout } : {}),
    };
  }

  function emitRequestedToolCallIfReady(itemId: string): ProviderStreamEvent | undefined {
    const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(itemId);
    if (!pendingFunctionCallState || pendingFunctionCallState.hasEmittedProviderEvent || !pendingFunctionCallState.argumentsText) {
      return undefined;
    }

    pendingFunctionCallState.hasEmittedProviderEvent = true;
    const toolCallRequest = createToolCallRequest(pendingFunctionCallState);
    terminalState = {
      terminalKind: "tool_call_requested",
      toolCallId: pendingFunctionCallState.toolCallId,
      toolCallRequest,
      responseOutputItems: [],
    };
    return createProviderToolCallRequestedEvent(pendingFunctionCallState.toolCallId, toolCallRequest);
  }

  async function* emitPendingReasoningCompletedEvent(): AsyncGenerator<ProviderStreamEvent> {
    if (isReasoningSummaryInProgress && reasoningStartedAtMs !== undefined) {
      yield createProviderReasoningSummaryCompletedEvent(Math.max(0, Math.round(performance.now() - reasoningStartedAtMs)));
      reasoningStartedAtMs = undefined;
      isReasoningSummaryInProgress = false;
      reasoningPartSeparatorPending = false;
    }
  }

  for await (const data of readSseData(response.body)) {
    if (data === "[DONE]") {
      break;
    }

    const value = JSON.parse(data) as unknown;
    if (!isOpenAiChunkObject(value)) {
      continue;
    }

    switch (value.type) {
      case "response.output_text.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          continue;
        }

        yield* emitPendingReasoningCompletedEvent();
        yield createProviderTextChunkEvent(value.delta);
        continue;
      }

      case "response.reasoning_summary_text.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          continue;
        }

        if (!isReasoningSummaryInProgress) {
          reasoningStartedAtMs = performance.now();
          isReasoningSummaryInProgress = true;
          yield createProviderReasoningSummaryStartedEvent();
        }
        if (reasoningPartSeparatorPending) {
          yield createProviderReasoningSummaryTextChunkEvent("\n\n");
          reasoningPartSeparatorPending = false;
        }
        yield createProviderReasoningSummaryTextChunkEvent(value.delta);
        continue;
      }

      case "response.reasoning_summary_text.done": {
        if (typeof value.item_id !== "string") {
          continue;
        }

        reasoningPartSeparatorPending = true;
        continue;
      }

      case "response.function_call_arguments.delta": {
        if (typeof value.item_id !== "string" || typeof value.delta !== "string") {
          continue;
        }

        const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(value.item_id);
        if (pendingFunctionCallState) {
          pendingFunctionCallState.argumentsText += value.delta;
        }
        continue;
      }

      case "response.output_item.added": {
        const outputItemAdded = OutputItemAddedChunkSchema.safeParse(value);
        if (!outputItemAdded.success) {
          continue;
        }

        trackedOutputItemsByIndex.set(outputItemAdded.data.output_index, outputItemAdded.data.item);
        if (outputItemAdded.data.item.type === "function_call") {
          const functionCallItem = outputItemAdded.data.item as {
            id?: string;
            call_id?: string;
            name?: string;
          };
          if (functionCallItem.id && functionCallItem.call_id && functionCallItem.name) {
            pendingFunctionCallStateByItemId.set(functionCallItem.id, {
              toolCallId: functionCallItem.call_id,
              toolName: functionCallItem.name,
              argumentsText: "",
              hasEmittedProviderEvent: false,
            });
          }
        }
        continue;
      }

      case "response.function_call_arguments.done": {
        const functionCallArgumentsDone = FunctionCallArgumentsDoneChunkSchema.safeParse(value);
        if (!functionCallArgumentsDone.success) {
          continue;
        }

        const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(functionCallArgumentsDone.data.item_id);
        if (pendingFunctionCallState) {
          pendingFunctionCallState.argumentsText = functionCallArgumentsDone.data.arguments;
          const requestedToolCallEvent = emitRequestedToolCallIfReady(functionCallArgumentsDone.data.item_id);
          if (requestedToolCallEvent) {
            yield requestedToolCallEvent;
          }
        }
        continue;
      }

      case "response.output_item.done": {
        const outputItemDone = OutputItemDoneChunkSchema.safeParse(value);
        if (!outputItemDone.success) {
          continue;
        }

        if (outputItemDone.data.output_index !== undefined) {
          trackedOutputItemsByIndex.set(outputItemDone.data.output_index, outputItemDone.data.item);
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
        const responseOutputItems = completedResponse.response.output ?? listTrackedOutputItems();
        if (terminalState?.terminalKind === "tool_call_requested") {
          terminalState = {
            ...terminalState,
            responseOutputItems,
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
        const responseOutputItems = incompleteResponse.response.output ?? listTrackedOutputItems();
        if (terminalState?.terminalKind === "tool_call_requested") {
          terminalState = {
            ...terminalState,
            responseOutputItems,
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

  return terminalState;
}
