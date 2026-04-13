import { ProviderStreamEventSchema, type ProviderStreamEvent } from "@buli/contracts";
import { z } from "zod";
import { OpenAiUsageSchema, normalizeOpenAiUsage } from "./usage.ts";

const TextDeltaChunkSchema = z.object({
  type: z.literal("response.output_text.delta"),
  item_id: z.string(),
  delta: z.string(),
});

const ErrorChunkSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

const ResponseFinishedChunkSchema = z.object({
  type: z.enum(["response.completed", "response.incomplete"]),
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

export async function* parseOpenAiStream(response: Response): AsyncGenerator<ProviderStreamEvent> {
  if (!response.body) {
    throw new Error("OpenAI stream response body is missing");
  }

  let finished = false;

  for await (const data of readSseData(response.body)) {
    if (data === "[DONE]") {
      break;
    }

    const value = JSON.parse(data) as unknown;

    const error = ErrorChunkSchema.safeParse(value);
    if (error.success) {
      throw new Error(error.data.message);
    }

    const delta = TextDeltaChunkSchema.safeParse(value);
    if (delta.success) {
      yield ProviderStreamEventSchema.parse({
        type: "text_chunk",
        text: delta.data.delta,
      });
      continue;
    }

    const finish = ResponseFinishedChunkSchema.safeParse(value);
    if (finish.success) {
      finished = true;
      yield ProviderStreamEventSchema.parse({
        type: "completed",
        usage: normalizeOpenAiUsage(finish.data.response.usage),
      });
    }
  }

  if (!finished) {
    throw new Error("OpenAI stream ended without a completion event");
  }
}
