import { ProviderStreamEventSchema, type ProviderStreamEvent, type ToolCallRequest } from "@buli/contracts";
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
    return ProviderStreamEventSchema.parse({
      type: "tool_call_requested",
      toolCallId: pendingFunctionCallState.toolCallId,
      toolCallRequest,
    });
  }

  async function* emitPendingReasoningCompletedEvent(): AsyncGenerator<ProviderStreamEvent> {
    if (isReasoningSummaryInProgress && reasoningStartedAtMs !== undefined) {
      yield ProviderStreamEventSchema.parse({
        type: "reasoning_summary_completed",
        reasoningDurationMs: Math.max(0, Math.round(performance.now() - reasoningStartedAtMs)),
      });
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

    const error = ErrorChunkSchema.safeParse(value);
    if (error.success) {
      throw new Error(error.data.message);
    }

    const reasoningDelta = ReasoningDeltaChunkSchema.safeParse(value);
    if (reasoningDelta.success) {
      if (!isReasoningSummaryInProgress) {
        reasoningStartedAtMs = performance.now();
        isReasoningSummaryInProgress = true;
        yield ProviderStreamEventSchema.parse({ type: "reasoning_summary_started" });
      }
      if (reasoningPartSeparatorPending) {
        yield ProviderStreamEventSchema.parse({
          type: "reasoning_summary_text_chunk",
          text: "\n\n",
        });
        reasoningPartSeparatorPending = false;
      }
      yield ProviderStreamEventSchema.parse({
        type: "reasoning_summary_text_chunk",
        text: reasoningDelta.data.delta,
      });
      continue;
    }

    const reasoningDone = ReasoningDoneChunkSchema.safeParse(value);
    if (reasoningDone.success) {
      reasoningPartSeparatorPending = true;
      continue;
    }

    const outputItemAdded = OutputItemAddedChunkSchema.safeParse(value);
    if (outputItemAdded.success) {
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

    const functionCallArgumentsDelta = FunctionCallArgumentsDeltaChunkSchema.safeParse(value);
    if (functionCallArgumentsDelta.success) {
      const pendingFunctionCallState = pendingFunctionCallStateByItemId.get(functionCallArgumentsDelta.data.item_id);
      if (pendingFunctionCallState) {
        pendingFunctionCallState.argumentsText += functionCallArgumentsDelta.data.delta;
      }
      continue;
    }

    const functionCallArgumentsDone = FunctionCallArgumentsDoneChunkSchema.safeParse(value);
    if (functionCallArgumentsDone.success) {
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

    const outputItemDone = OutputItemDoneChunkSchema.safeParse(value);
    if (outputItemDone.success) {
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

    const textDelta = TextDeltaChunkSchema.safeParse(value);
    if (textDelta.success) {
      yield* emitPendingReasoningCompletedEvent();
      yield ProviderStreamEventSchema.parse({
        type: "text_chunk",
        text: textDelta.data.delta,
      });
      continue;
    }

    const completedResponse = ResponseCompletedChunkSchema.safeParse(value);
    if (completedResponse.success) {
      yield* emitPendingReasoningCompletedEvent();
      finished = true;
      const responseOutputItems = completedResponse.data.response.output ?? listTrackedOutputItems();
      if (terminalState?.terminalKind === "tool_call_requested") {
        terminalState = {
          ...terminalState,
          responseOutputItems,
        };
        continue;
      }
      terminalState = { terminalKind: "completed" };
      yield ProviderStreamEventSchema.parse({
        type: "completed",
        usage: normalizeOpenAiUsage(completedResponse.data.response.usage),
      });
      continue;
    }

    const incompleteResponse = ResponseIncompleteChunkSchema.safeParse(value);
    if (incompleteResponse.success) {
      yield* emitPendingReasoningCompletedEvent();
      finished = true;
      const responseOutputItems = incompleteResponse.data.response.output ?? listTrackedOutputItems();
      if (terminalState?.terminalKind === "tool_call_requested") {
        terminalState = {
          ...terminalState,
          responseOutputItems,
        };
        continue;
      }
      terminalState = { terminalKind: "incomplete" };
      yield ProviderStreamEventSchema.parse({
        type: "incomplete",
        incompleteReason: incompleteResponse.data.response.incomplete_details?.reason ?? "unknown",
        usage: normalizeOpenAiUsage(incompleteResponse.data.response.usage),
      });
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
