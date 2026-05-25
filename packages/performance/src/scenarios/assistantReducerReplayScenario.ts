import type { AssistantResponseEvent } from "@buli/contracts";
import {
  applyAssistantResponseEventsToChatSessionState,
  createInitialChatSessionState,
  type ChatSessionState,
} from "@buli/chat-session-state";
import {
  createCountMetric,
  createDurationMetric,
  createBytesMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

const reducerReplayUpdateEventCount = 1_000;
const reducerReplayBatchSize = 50;

export const assistantReducerReplayScenario: PerformanceScenario = {
  scenarioName: "assistant-reducer-replay",
  description:
    "Replays a deterministic streaming assistant turn through the chat-session reducer in fixed-size batches.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 10,
  async runIteration(input) {
    const assistantResponseEventBatches = createAssistantResponseEventBatches();
    const heapUsedBeforeReplay = process.memoryUsage().heapUsed;
    const replayResult = await measureDurationMs(() => replayAssistantResponseEventBatches(assistantResponseEventBatches));
    const heapUsedAfterReplay = process.memoryUsage().heapUsed;
    const batchDurationsMs = replayResult.measuredValue.batchDurationsMs;

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: [
        createDurationMetric({
          metricName: "assistant_reducer_replay.total.duration_ms",
          durationMs: replayResult.durationMs,
          budget: { warnAbove: 20, failAbove: 50 },
        }),
        createDurationMetric({
          metricName: "assistant_reducer_replay.batch.p95_duration_ms",
          durationMs: calculatePercentile(batchDurationsMs, 95),
          budget: { warnAbove: 2, failAbove: 8 },
        }),
        createDurationMetric({
          metricName: "assistant_reducer_replay.batch.max_duration_ms",
          durationMs: Math.max(...batchDurationsMs),
          budget: { warnAbove: 4, failAbove: 12 },
        }),
        createCountMetric({
          metricName: "assistant_reducer_replay.assistant_event_count",
          count: assistantResponseEventBatches.flat().length,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "assistant_reducer_replay.batch_count",
          count: assistantResponseEventBatches.length,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "assistant_reducer_replay.final_message_part_count",
          count: replayResult.measuredValue.finalChatSessionState.conversationMessagePartCount,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "assistant_reducer_replay.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterReplay - heapUsedBeforeReplay),
          budget: { warnAbove: 8_000_000, failAbove: 16_000_000 },
        }),
      ],
    };
  },
};

type AssistantReducerReplayResult = Readonly<{
  finalChatSessionState: ChatSessionState;
  batchDurationsMs: readonly number[];
}>;

async function replayAssistantResponseEventBatches(
  assistantResponseEventBatches: readonly (readonly AssistantResponseEvent[])[],
): Promise<AssistantReducerReplayResult> {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.5" });
  const batchDurationsMs: number[] = [];

  for (const assistantResponseEventBatch of assistantResponseEventBatches) {
    const batchReplay = await measureDurationMs(() =>
      applyAssistantResponseEventsToChatSessionState(chatSessionState, assistantResponseEventBatch)
    );
    batchDurationsMs.push(batchReplay.durationMs);
    chatSessionState = batchReplay.measuredValue;
  }

  return { finalChatSessionState: chatSessionState, batchDurationsMs };
}

function createAssistantResponseEventBatches(): readonly (readonly AssistantResponseEvent[])[] {
  const assistantResponseEvents: AssistantResponseEvent[] = [
    { type: "assistant_turn_started", messageId: "assistant-profile-1", startedAtMs: 1 },
    {
      type: "assistant_message_part_added",
      messageId: "assistant-profile-1",
      part: {
        id: "assistant-text-profile-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: "",
      },
    },
  ];

  let accumulatedMarkdownText = "";
  for (let updateIndex = 0; updateIndex < reducerReplayUpdateEventCount; updateIndex += 1) {
    accumulatedMarkdownText += `Chunk ${updateIndex}\n\n- detail\n`;
    assistantResponseEvents.push({
      type: "assistant_message_part_updated",
      messageId: "assistant-profile-1",
      part: {
        id: "assistant-text-profile-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownText: accumulatedMarkdownText,
      },
    });
  }

  assistantResponseEvents.push({
    type: "assistant_message_completed",
    messageId: "assistant-profile-1",
    usage: { total: 1_500, input: 500, output: 1_000, reasoning: 0, cache: { read: 0, write: 0 } },
  });

  const assistantResponseEventBatches: AssistantResponseEvent[][] = [];
  for (let startIndex = 0; startIndex < assistantResponseEvents.length; startIndex += reducerReplayBatchSize) {
    assistantResponseEventBatches.push(assistantResponseEvents.slice(startIndex, startIndex + reducerReplayBatchSize));
  }

  return assistantResponseEventBatches;
}

function calculatePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sortedValues = [...values].sort((leftValue, rightValue) => leftValue - rightValue);
  const percentileIndex = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, percentileIndex))] ?? 0;
}
