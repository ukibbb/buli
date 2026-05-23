import type { ProviderStreamEvent } from "@buli/contracts";
import {
  OpenAiResponseStepStreamParser,
  type OpenAiResponseStepTerminalState,
  type OpenAiStreamParserOptions,
} from "./openAiResponseStepStreamParser.ts";

export type { OpenAiResponseStepTerminalState, OpenAiStreamParserOptions } from "./openAiResponseStepStreamParser.ts";

const MAX_OPENAI_SSE_FRAME_CHARACTER_COUNT = 1_048_576;

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

function assertOpenAiSseFrameWithinLimit(frameCharacterCount: number): void {
  if (frameCharacterCount <= MAX_OPENAI_SSE_FRAME_CHARACTER_COUNT) {
    return;
  }

  throw new Error(
    `OpenAI stream SSE frame exceeded ${MAX_OPENAI_SSE_FRAME_CHARACTER_COUNT} characters (${frameCharacterCount} characters).`,
  );
}

async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      buffer += chunk.value;

      while (true) {
        const boundary = nextFrameBoundary(buffer);
        if (!boundary) {
          assertOpenAiSseFrameWithinLimit(buffer.length);
          break;
        }
        assertOpenAiSseFrameWithinLimit(boundary.index);

        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);

        const data = extractData(frame);

        if (data) {
          yield data;
        }
      }
    }

    assertOpenAiSseFrameWithinLimit(buffer.length);
    const data = extractData(buffer);

    if (data) {
      yield data;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed; releaseLock below is still required.
    }
    reader.releaseLock();
  }
}

export async function* parseOpenAiStream(
  response: Response,
  options: OpenAiStreamParserOptions = {},
): AsyncGenerator<ProviderStreamEvent, OpenAiResponseStepTerminalState> {
  if (!response.body) {
    throw new Error("OpenAI stream response body is missing");
  }

  const contentType = response.headers.get("content-type");
  if (contentType !== null && contentType.toLowerCase().split(";")[0]?.trim() !== "text/event-stream") {
    throw new Error(`OpenAI stream response must be text/event-stream, received ${contentType ?? "missing content-type"}`);
  }

  const parser = new OpenAiResponseStepStreamParser(options);
  parser.start({ contentType });

  for await (const data of readSseData(response.body)) {
    if (data === "[DONE]") {
      break;
    }

    for (const providerStreamEvent of parser.parseSseDataFrame(data)) {
      yield providerStreamEvent;
    }
  }

  return parser.complete();
}
