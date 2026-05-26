import { expect, test } from "bun:test";
import {
  buildPerformanceRunSummary,
  formatPerformanceRunMarkdown,
} from "../src/model/performanceRunSummary.ts";
import type { PerformanceScenario } from "../src/model/performanceScenario.ts";
import { listBuliPerformanceScenarioNames } from "../src/scenarios/scenarioRegistry.ts";

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
});
