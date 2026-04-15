import { ProviderStreamEventSchema, type ProviderStreamEvent } from "@buli/contracts";
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

const ErrorChunkSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

const ResponseCompletedChunkSchema = z.object({
  type: z.literal("response.completed"),
  response: z.object({
    usage: OpenAiUsageSchema,
  }),
});

const ResponseIncompleteChunkSchema = z.object({
  type: z.literal("response.incomplete"),
  response: z.object({
    incomplete_details: z.object({ reason: z.string() }).nullish(),
    usage: OpenAiUsageSchema,
  }),
});

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
export async function* parseOpenAiStream(response: Response): AsyncGenerator<ProviderStreamEvent> {
  if (!response.body) {
    throw new Error("OpenAI stream response body is missing");
  }

  let finished = false;
  let reasoningStartedAtMs: number | undefined;
  let isReasoningSummaryInProgress = false;
  let reasoningPartSeparatorPending = false;

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
}
