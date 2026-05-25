import type { ProviderStreamEvent } from "@buli/contracts";
import {
  createCountMetric,
  createDurationMetric,
  createBytesMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";
import { parseOpenAiStream } from "../../../openai/src/provider/stream.ts";

const replayTextDeltaFrameCount = 2_000;
const replayTextDelta = "streamed-profile-token ";

export const openAiStreamReplayScenario: PerformanceScenario = {
  scenarioName: "openai-stream-replay",
  description:
    "Parses a deterministic OpenAI SSE replay to measure provider stream parsing and event projection throughput.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 8,
  async runIteration(input) {
    const openAiSseReplayText = buildOpenAiTextDeltaSseReplay();
    const heapUsedBeforeParse = process.memoryUsage().heapUsed;
    const parsedStream = await measureDurationMs(() => parseOpenAiReplay(openAiSseReplayText));
    const heapUsedAfterParse = process.memoryUsage().heapUsed;
    const parsedTextCharacterCount = parsedStream.measuredValue.providerStreamEvents.reduce(
      (characterCount, providerStreamEvent) =>
        characterCount + (providerStreamEvent.type === "text_chunk" ? providerStreamEvent.text.length : 0),
      0,
    );

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: [
        createDurationMetric({
          metricName: "openai_stream_replay.parse.duration_ms",
          durationMs: parsedStream.durationMs,
          budget: { warnAbove: 30, failAbove: 75 },
        }),
        createCountMetric({
          metricName: "openai_stream_replay.sse_frame_count",
          count: replayTextDeltaFrameCount + 1,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "openai_stream_replay.provider_event_count",
          count: parsedStream.measuredValue.providerStreamEvents.length,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "openai_stream_replay.text_character_count",
          count: parsedTextCharacterCount,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "openai_stream_replay.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterParse - heapUsedBeforeParse),
          budget: { warnAbove: 12_000_000, failAbove: 24_000_000 },
        }),
      ],
    };
  },
};

type ParsedOpenAiReplay = Readonly<{
  providerStreamEvents: readonly ProviderStreamEvent[];
}>;

async function parseOpenAiReplay(openAiSseReplayText: string): Promise<ParsedOpenAiReplay> {
  const providerStreamEvents: ProviderStreamEvent[] = [];
  const openAiStreamIterator = parseOpenAiStream(new Response(openAiSseReplayText, {
    headers: { "content-type": "text/event-stream" },
  }))[Symbol.asyncIterator]();

  while (true) {
    const nextProviderStreamEvent = await openAiStreamIterator.next();
    if (nextProviderStreamEvent.done) {
      return { providerStreamEvents };
    }

    providerStreamEvents.push(nextProviderStreamEvent.value);
  }
}

function buildOpenAiTextDeltaSseReplay(): string {
  const frames: string[] = [];
  for (let frameIndex = 0; frameIndex < replayTextDeltaFrameCount; frameIndex += 1) {
    frames.push(createSseDataFrame({
      type: "response.output_text.delta",
      item_id: "message-item-1",
      delta: replayTextDelta,
    }));
  }
  frames.push(createSseDataFrame({
    type: "response.completed",
    response: {
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens: replayTextDeltaFrameCount,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: replayTextDeltaFrameCount + 100,
      },
    },
  }));
  return frames.join("");
}

function createSseDataFrame(openAiStreamEvent: Readonly<Record<string, unknown>>): string {
  return `data: ${JSON.stringify(openAiStreamEvent)}\n\n`;
}
