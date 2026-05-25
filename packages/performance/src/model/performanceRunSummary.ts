import type {
  PerformanceMetric,
  PerformanceMetricBudget,
  PerformanceMetricUnit,
  PerformanceScenario,
  PerformanceScenarioIterationResult,
} from "./performanceScenario.ts";

export type PerformanceBudgetStatus = "passed" | "warned" | "failed";

export type PerformanceMetricAggregate = Readonly<{
  metricName: string;
  unit: PerformanceMetricUnit;
  lowerIsBetter: boolean;
  sampleCount: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  budgetStatus: PerformanceBudgetStatus;
  budget?: PerformanceMetricBudget | undefined;
}>;

export type PerformanceRunIterationSummary = Readonly<{
  iterationLabel: string;
  metrics: readonly PerformanceMetric[];
}>;

export type PerformanceRunSummary = Readonly<{
  schemaVersion: 1;
  scenarioName: string;
  scenarioDescription: string;
  implementationLabel: string;
  measuredAtIso: string;
  warmupCount: number;
  repeatCount: number;
  warmupIterations: readonly PerformanceRunIterationSummary[];
  measuredIterations: readonly PerformanceRunIterationSummary[];
  aggregateMetrics: readonly PerformanceMetricAggregate[];
}>;

export function buildPerformanceRunSummary(input: {
  scenario: PerformanceScenario;
  implementationLabel: string;
  measuredAtIso: string;
  warmupIterations: readonly PerformanceScenarioIterationResult[];
  measuredIterations: readonly PerformanceScenarioIterationResult[];
}): PerformanceRunSummary {
  return {
    schemaVersion: 1,
    scenarioName: input.scenario.scenarioName,
    scenarioDescription: input.scenario.description,
    implementationLabel: input.implementationLabel,
    measuredAtIso: input.measuredAtIso,
    warmupCount: input.warmupIterations.length,
    repeatCount: input.measuredIterations.length,
    warmupIterations: input.warmupIterations.map(toRunIterationSummary),
    measuredIterations: input.measuredIterations.map(toRunIterationSummary),
    aggregateMetrics: aggregatePerformanceMetrics(input.measuredIterations.flatMap((iteration) => iteration.metrics)),
  };
}

export function aggregatePerformanceMetrics(metrics: readonly PerformanceMetric[]): PerformanceMetricAggregate[] {
  const metricsByName = new Map<string, PerformanceMetric[]>();
  for (const metric of metrics) {
    const metricsWithName = metricsByName.get(metric.metricName) ?? [];
    metricsWithName.push(metric);
    metricsByName.set(metric.metricName, metricsWithName);
  }

  return [...metricsByName.entries()].map(([metricName, groupedMetrics]) => {
    const firstMetric = groupedMetrics[0];
    if (!firstMetric) {
      throw new Error(`Cannot aggregate empty metric group ${metricName}.`);
    }
    const sortedMetricValues = groupedMetrics.map((metric) => metric.value).sort((leftValue, rightValue) => leftValue - rightValue);
    const budget = firstMetric.budget;
    return {
      metricName,
      unit: firstMetric.unit,
      lowerIsBetter: firstMetric.lowerIsBetter,
      sampleCount: sortedMetricValues.length,
      min: sortedMetricValues[0] ?? 0,
      max: sortedMetricValues.at(-1) ?? 0,
      mean: calculateMean(sortedMetricValues),
      median: calculatePercentile(sortedMetricValues, 50),
      p95: calculatePercentile(sortedMetricValues, 95),
      budgetStatus: resolveBudgetStatus({ value: calculatePercentile(sortedMetricValues, 95), budget }),
      ...(budget !== undefined ? { budget } : {}),
    };
  }).sort((leftMetric, rightMetric) => leftMetric.metricName.localeCompare(rightMetric.metricName));
}

export function formatPerformanceRunMarkdown(summary: PerformanceRunSummary): string {
  const metricRows = summary.aggregateMetrics.map((metric) => [
    metric.metricName,
    metric.unit,
    formatMetricValue(metric.mean),
    formatMetricValue(metric.p95),
    formatMetricValue(metric.min),
    formatMetricValue(metric.max),
    metric.budgetStatus,
  ]);

  return [
    `# Buli Performance Profile: ${summary.scenarioName}`,
    "",
    `- Implementation: \`${summary.implementationLabel}\``,
    `- Measured at: ${summary.measuredAtIso}`,
    `- Warmups: ${summary.warmupCount}`,
    `- Repeats: ${summary.repeatCount}`,
    "",
    summary.scenarioDescription,
    "",
    "| Metric | Unit | Mean | P95 | Min | Max | Budget |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...metricRows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");
}

export function readPerformanceRunSummary(value: unknown): PerformanceRunSummary {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || typeof value["scenarioName"] !== "string") {
    throw new Error("Invalid Buli performance run summary JSON.");
  }

  return value as PerformanceRunSummary;
}

function toRunIterationSummary(iteration: PerformanceScenarioIterationResult): PerformanceRunIterationSummary {
  return {
    iterationLabel: iteration.iterationLabel,
    metrics: iteration.metrics,
  };
}

function calculateMean(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  return sortedValues.reduce((total, value) => total + value, 0) / sortedValues.length;
}

function calculatePercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? 0;
  }

  const percentileIndex = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, percentileIndex))] ?? 0;
}

function resolveBudgetStatus(input: {
  value: number;
  budget: PerformanceMetricBudget | undefined;
}): PerformanceBudgetStatus {
  if (input.budget?.failAbove !== undefined && input.value > input.budget.failAbove) {
    return "failed";
  }
  if (input.budget?.warnAbove !== undefined && input.value > input.budget.warnAbove) {
    return "warned";
  }

  return "passed";
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
