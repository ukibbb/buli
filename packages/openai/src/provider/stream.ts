import type { BuliDiagnosticLogger, ProviderStreamEvent } from "@buli/contracts";
import {
  OpenAiResponseStepStreamParser,
  type OpenAiResponseStepTerminalState,
  type OpenAiStreamParserOptions,
} from "./openAiResponseStepStreamParser.ts";
import { logOpenAiDiagnosticEvent } from "./diagnostics.ts";

export type { OpenAiResponseStepTerminalState, OpenAiStreamParserOptions } from "./openAiResponseStepStreamParser.ts";

const MAX_OPENAI_SSE_FRAME_CHARACTER_COUNT = 1_048_576;

type OpenAiSseReadOptions = Readonly<{
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  abortSignal?: AbortSignal | undefined;
  idleTimeoutMilliseconds?: number | undefined;
}>;

type OpenAiSseTextReader = Readonly<{
  read: () => Promise<OpenAiSseChunkReadResult>;
  cancel: (reason?: unknown) => Promise<void>;
}>;

type OpenAiSseChunkReadResult =
  | Readonly<{ done: false; value: string }>
  | Readonly<{ done: true; value?: string | undefined }>;

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

async function* readSseData(body: ReadableStream<Uint8Array>, options: OpenAiSseReadOptions = {}): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    while (true) {
      const chunk = await readNextOpenAiSseChunk(reader, options);
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

function readNextOpenAiSseChunk(
  reader: OpenAiSseTextReader,
  options: OpenAiSseReadOptions,
): Promise<OpenAiSseChunkReadResult> {
  const idleTimeoutMilliseconds = options.idleTimeoutMilliseconds;
  if (options.abortSignal?.aborted) {
    return Promise.reject(createOpenAiStreamAbortError(options.abortSignal));
  }
  if (idleTimeoutMilliseconds !== undefined && (!Number.isFinite(idleTimeoutMilliseconds) || idleTimeoutMilliseconds <= 0)) {
    return Promise.reject(new Error("OpenAI stream idle timeout must be a positive finite number of milliseconds"));
  }

  return new Promise<OpenAiSseChunkReadResult>((resolveRead, rejectRead) => {
    let didSettle = false;
    let idleTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const settleRead = <ReadResult>(settle: (value: ReadResult) => void, value: ReadResult): void => {
      if (didSettle) {
        return;
      }

      didSettle = true;
      if (idleTimeoutHandle !== undefined) {
        clearTimeout(idleTimeoutHandle);
      }
      if (abortListener) {
        options.abortSignal?.removeEventListener("abort", abortListener);
      }
      settle(value);
    };

    abortListener = (): void => {
      const abortError = createOpenAiStreamAbortError(options.abortSignal);
      cancelOpenAiSseReader(reader, abortError);
      settleRead(rejectRead, abortError);
    };

    options.abortSignal?.addEventListener("abort", abortListener, { once: true });
    if (idleTimeoutMilliseconds !== undefined) {
      idleTimeoutHandle = setTimeout(() => {
        const timeoutError = createOpenAiStreamIdleTimeoutError(idleTimeoutMilliseconds);
        logOpenAiDiagnosticEvent(options.diagnosticLogger, "stream.idle_timeout", {
          idleTimeoutMilliseconds,
        });
        cancelOpenAiSseReader(reader, timeoutError);
        settleRead(rejectRead, timeoutError);
      }, idleTimeoutMilliseconds);
    }

    reader.read().then(
      (readResult) => settleRead(resolveRead, readResult),
      (error: unknown) => settleRead(rejectRead, toError(error)),
    );

    if (options.abortSignal?.aborted) {
      abortListener();
    }
  });
}

function cancelOpenAiSseReader(reader: OpenAiSseTextReader, reason: Error): void {
  void reader.cancel(reason).catch(() => {});
}

function createOpenAiStreamIdleTimeoutError(idleTimeoutMilliseconds: number): Error {
  const timeoutError = new Error(`OpenAI stream stalled for ${idleTimeoutMilliseconds}ms without receiving data`);
  timeoutError.name = "TimeoutError";
  return timeoutError;
}

function createOpenAiStreamAbortError(abortSignal: AbortSignal | undefined): Error {
  const abortReason = abortSignal ? readAbortSignalReason(abortSignal) : undefined;
  if (abortReason instanceof Error) {
    return abortReason;
  }

  const abortError = new Error(typeof abortReason === "string" ? abortReason : "OpenAI stream aborted");
  abortError.name = "AbortError";
  return abortError;
}

function readAbortSignalReason(abortSignal: AbortSignal): unknown {
  return (abortSignal as { readonly reason?: unknown }).reason;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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

  for await (const data of readSseData(response.body, options)) {
    if (data === "[DONE]") {
      break;
    }

    for (const providerStreamEvent of parser.parseSseDataFrame(data)) {
      yield providerStreamEvent;
    }
  }

  return parser.complete();
}
