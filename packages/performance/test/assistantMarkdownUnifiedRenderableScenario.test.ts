import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PerformanceScenarioIterationResult } from "../src/model/performanceScenario.ts";
import { createAssistantMarkdownUnifiedRenderableScenario } from "../src/scenarios/assistantMarkdownUnifiedRenderableScenario.ts";

test("assistant markdown unified renderable scenario measures streaming block reuse", async () => {
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-assistant-markdown-unified-renderable-profile-"));
  const scenario = createAssistantMarkdownUnifiedRenderableScenario({
    stableBlockCount: 8,
    streamingFragmentCount: 5,
  });

  const iterationResult = await scenario.runIteration({
    iterationIndex: 0,
    isWarmup: false,
    runOutputDirectoryPath,
  });

  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.cold_build.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.initial_streaming_build.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.streaming_updates.p95_duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.streaming_updates.max_duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.completion_promotion.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.final_render_frame.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.streaming_updates.count")).toBe(4);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.stable_block_reference_reuse_count")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.cold_build.block_count")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.completion.block_count")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.markdown_input_bytes")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_unified_renderable.heap_used_delta_bytes")).toBeGreaterThanOrEqual(0);
});

function readMetricValue(iterationResult: PerformanceScenarioIterationResult, metricName: string): number {
  const metric = iterationResult.metrics.find((candidateMetric) => candidateMetric.metricName === metricName);
  if (!metric) {
    throw new Error(`Missing performance metric ${metricName}.`);
  }
  return metric.value;
}
