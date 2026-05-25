import type { BuliDiagnosticLogEvent } from "@buli/contracts";

export type PerformanceMetricUnit = "milliseconds" | "bytes" | "count";

export type PerformanceMetricBudget = Readonly<{
  warnAbove?: number | undefined;
  failAbove?: number | undefined;
}>;

export type PerformanceMetric = Readonly<{
  metricName: string;
  unit: PerformanceMetricUnit;
  value: number;
  lowerIsBetter: boolean;
  budget?: PerformanceMetricBudget | undefined;
}>;

export type PerformanceScenarioIterationResult = Readonly<{
  iterationLabel: string;
  metrics: readonly PerformanceMetric[];
  diagnosticEvents?: readonly BuliDiagnosticLogEvent[] | undefined;
}>;

export type PerformanceScenarioIterationInput = Readonly<{
  iterationIndex: number;
  isWarmup: boolean;
  runOutputDirectoryPath: string;
}>;

export type PerformanceScenario = Readonly<{
  scenarioName: string;
  description: string;
  defaultWarmupCount: number;
  defaultRepeatCount: number;
  runIteration: (input: PerformanceScenarioIterationInput) => Promise<PerformanceScenarioIterationResult>;
}>;

export type MeasuredDuration<MeasuredValue> = Readonly<{
  durationMs: number;
  measuredValue: MeasuredValue;
}>;

export async function measureDurationMs<MeasuredValue>(
  measureOperation: () => Promise<MeasuredValue> | MeasuredValue,
): Promise<MeasuredDuration<MeasuredValue>> {
  const operationStartedAtMs = performance.now();
  const measuredValue = await measureOperation();
  return {
    durationMs: performance.now() - operationStartedAtMs,
    measuredValue,
  };
}

export function createDurationMetric(input: {
  metricName: string;
  durationMs: number;
  budget?: PerformanceMetricBudget | undefined;
}): PerformanceMetric {
  return {
    metricName: input.metricName,
    unit: "milliseconds",
    value: input.durationMs,
    lowerIsBetter: true,
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
  };
}

export function createCountMetric(input: {
  metricName: string;
  count: number;
  lowerIsBetter?: boolean | undefined;
  budget?: PerformanceMetricBudget | undefined;
}): PerformanceMetric {
  return {
    metricName: input.metricName,
    unit: "count",
    value: input.count,
    lowerIsBetter: input.lowerIsBetter ?? true,
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
  };
}

export function createBytesMetric(input: {
  metricName: string;
  bytes: number;
  lowerIsBetter?: boolean | undefined;
  budget?: PerformanceMetricBudget | undefined;
}): PerformanceMetric {
  return {
    metricName: input.metricName,
    unit: "bytes",
    value: input.bytes,
    lowerIsBetter: input.lowerIsBetter ?? true,
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
  };
}
