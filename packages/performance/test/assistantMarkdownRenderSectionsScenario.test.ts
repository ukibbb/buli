import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PerformanceScenarioIterationResult } from "../src/model/performanceScenario.ts";
import { createAssistantMarkdownRenderSectionsScenario } from "../src/scenarios/assistantMarkdownRenderSectionsScenario.ts";

test("assistant markdown render sections scenario measures streaming reuse", async () => {
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-assistant-markdown-render-sections-profile-"));
  const scenario = createAssistantMarkdownRenderSectionsScenario({
    stableBlockCount: 8,
    streamingFragmentCount: 5,
  });

  const iterationResult = await scenario.runIteration({
    iterationIndex: 0,
    isWarmup: false,
    runOutputDirectoryPath,
  });

  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.cold_build.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.initial_streaming_build.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.streaming_updates.p95_duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.streaming_updates.max_duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.completion_promotion.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.streaming_updates.count")).toBe(4);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.stable_section_reference_reuse_count")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.streaming_tail_section_count")).toBe(5);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.cold_build.section_count")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.completion.section_count")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.markdown_input_bytes")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "assistant_markdown_render_sections.heap_used_delta_bytes")).toBeGreaterThanOrEqual(0);
});

function readMetricValue(iterationResult: PerformanceScenarioIterationResult, metricName: string): number {
  const metric = iterationResult.metrics.find((candidateMetric) => candidateMetric.metricName === metricName);
  if (!metric) {
    throw new Error(`Missing performance metric ${metricName}.`);
  }
  return metric.value;
}
