import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  buildPerformanceRunSummary,
  formatPerformanceRunMarkdown,
} from "../src/model/performanceRunSummary.ts";
import type { PerformanceMetric, PerformanceScenario } from "../src/model/performanceScenario.ts";
import { listBuliPerformanceScenarioNames, resolveBuliPerformanceScenario } from "../src/scenarios/scenarioRegistry.ts";

const performanceScenarioStub: PerformanceScenario = {
  scenarioName: "scenario-a",
  description: "Measures scenario A.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 2,
  runIteration: async () => ({ iterationLabel: "unused", metrics: [] }),
};

test("buildPerformanceRunSummary aggregates measured iteration metrics", () => {
  const performanceRunSummary = buildPerformanceRunSummary({
    scenario: performanceScenarioStub,
    implementationLabel: "baseline",
    measuredAtIso: "2026-05-25T00:00:00.000Z",
    warmupIterations: [
      {
        iterationLabel: "warmup-0",
        metrics: [{ metricName: "duration", unit: "milliseconds", value: 100, lowerIsBetter: true }],
      },
    ],
    measuredIterations: [
      {
        iterationLabel: "repeat-0",
        metrics: [
          {
            metricName: "duration",
            unit: "milliseconds",
            value: 10,
            lowerIsBetter: true,
            budget: { warnAbove: 20, failAbove: 40 },
          },
        ],
      },
      {
        iterationLabel: "repeat-1",
        metrics: [
          {
            metricName: "duration",
            unit: "milliseconds",
            value: 30,
            lowerIsBetter: true,
            budget: { warnAbove: 20, failAbove: 40 },
          },
        ],
      },
    ],
  });

  expect(performanceRunSummary.aggregateMetrics).toEqual([
    {
      metricName: "duration",
      unit: "milliseconds",
      lowerIsBetter: true,
      sampleCount: 2,
      min: 10,
      max: 30,
      mean: 20,
      median: 10,
      p95: 30,
      budgetStatus: "warned",
      budget: { warnAbove: 20, failAbove: 40 },
    },
  ]);
  expect(performanceRunSummary.warmupIterations).toHaveLength(1);
  expect(performanceRunSummary.measuredIterations).toHaveLength(2);
});

test("formatPerformanceRunMarkdown renders aggregate metric table", () => {
  const performanceRunSummary = buildPerformanceRunSummary({
    scenario: performanceScenarioStub,
    implementationLabel: "rewrite",
    measuredAtIso: "2026-05-25T00:00:00.000Z",
    warmupIterations: [],
    measuredIterations: [
      {
        iterationLabel: "repeat-0",
        metrics: [{ metricName: "duration", unit: "milliseconds", value: 4.25, lowerIsBetter: true }],
      },
    ],
  });

  expect(formatPerformanceRunMarkdown(performanceRunSummary)).toContain("| duration | milliseconds | 4.250 | 4.250 | 4.250 | 4.250 | passed |");
});

test("scenario registry exposes storage and context-growth profiling scenarios", () => {
  expect(listBuliPerformanceScenarioNames()).toContain("sqlite-session-large-history");
  expect(listBuliPerformanceScenarioNames()).toContain("tool-output-context-growth");
  expect(listBuliPerformanceScenarioNames()).toContain("codebase-knowledge-startup-index");
  expect(listBuliPerformanceScenarioNames()).toContain("assistant-markdown-render-sections");
});

test("task-subagent runtime scenario reports checkpoint compliance metrics", async () => {
  const scenario = resolveBuliPerformanceScenario("task-subagent-runtime");
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-task-subagent-runtime-scenario-"));

  const iterationResult = await scenario.runIteration({
    iterationIndex: 0,
    isWarmup: false,
    runOutputDirectoryPath,
  });

  const parentVisibleFailedTaskResultMetric = readPerformanceMetric(
    iterationResult.metrics,
    "task_subagent_runtime.parent_visible_failed_task_result_count",
  );
  const requestedToolsAfterCheckpointFailureMetric = readPerformanceMetric(
    iterationResult.metrics,
    "task_subagent_runtime.requested_tools_after_checkpoint_failure_count",
  );
  const checkpointCompletedTaskResultMetric = readPerformanceMetric(
    iterationResult.metrics,
    "task_subagent_runtime.checkpoint_completed_task_result_count",
  );

  expect(parentVisibleFailedTaskResultMetric.value).toBe(0);
  expect(parentVisibleFailedTaskResultMetric.budget).toEqual({ warnAbove: 0, failAbove: 0 });
  expect(requestedToolsAfterCheckpointFailureMetric.value).toBe(0);
  expect(requestedToolsAfterCheckpointFailureMetric.budget).toEqual({ warnAbove: 0, failAbove: 0 });
  expect(checkpointCompletedTaskResultMetric.value).toBe(1);
  expect(checkpointCompletedTaskResultMetric.lowerIsBetter).toBe(false);
});

function readPerformanceMetric(metrics: readonly PerformanceMetric[], metricName: string): PerformanceMetric {
  const metric = metrics.find((candidateMetric) => candidateMetric.metricName === metricName);
  if (!metric) {
    throw new Error(`Expected performance metric ${metricName}. Present metrics: ${metrics.map((candidateMetric) => candidateMetric.metricName).join(", ")}.`);
  }

  return metric;
}
