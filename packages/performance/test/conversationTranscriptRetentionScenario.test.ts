import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PerformanceScenarioIterationResult } from "../src/model/performanceScenario.ts";
import { createConversationTranscriptRetentionScenario } from "../src/scenarios/conversationTranscriptRetentionScenario.ts";

test("conversation transcript retention scenario measures frame time per transcript size", async () => {
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-conversation-transcript-retention-profile-"));
  const scenario = createConversationTranscriptRetentionScenario({
    transcriptMessageCountSteps: [3, 6],
  });

  const iterationResult = await scenario.runIteration({
    iterationIndex: 0,
    isWarmup: false,
    runOutputDirectoryPath,
  });

  expect(readMetricValue(iterationResult, "conversation_transcript_retention.settle_frame_at_3_messages.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "conversation_transcript_retention.steady_frame_at_3_messages.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "conversation_transcript_retention.settle_frame_at_6_messages.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "conversation_transcript_retention.steady_frame_at_6_messages.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "conversation_transcript_retention.total_mount.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "conversation_transcript_retention.transcript_message_count")).toBe(6);
  expect(readMetricValue(iterationResult, "conversation_transcript_retention.heap_used_delta_bytes")).toBeGreaterThanOrEqual(0);
});

function readMetricValue(iterationResult: PerformanceScenarioIterationResult, metricName: string): number {
  const metric = iterationResult.metrics.find((candidateMetric) => candidateMetric.metricName === metricName);
  if (!metric) {
    throw new Error(`Missing performance metric ${metricName}.`);
  }
  return metric.value;
}
