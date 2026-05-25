import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readPerformanceRunSummary,
  type PerformanceMetricAggregate,
  type PerformanceRunSummary,
} from "./model/performanceRunSummary.ts";

type CompareCliOptions = Readonly<{
  beforeSummaryPath: string;
  afterSummaryPath: string;
  outputPath: string | undefined;
}>;

type CompareCliParseResult =
  | Readonly<{ status: "ready"; options: CompareCliOptions }>
  | Readonly<{ status: "help"; output: string }>
  | Readonly<{ status: "error"; output: string }>;

export async function compareBuliPerformanceProfiles(input: CompareCliOptions): Promise<string> {
  const beforeSummary = await readSummaryFile(input.beforeSummaryPath);
  const afterSummary = await readSummaryFile(input.afterSummaryPath);
  const comparisonMarkdown = formatPerformanceComparisonMarkdown({ beforeSummary, afterSummary });
  if (input.outputPath !== undefined) {
    await writeFile(input.outputPath, comparisonMarkdown, "utf8");
  }

  return comparisonMarkdown;
}

function formatPerformanceComparisonMarkdown(input: {
  beforeSummary: PerformanceRunSummary;
  afterSummary: PerformanceRunSummary;
}): string {
  const beforeMetricByName = new Map(
    input.beforeSummary.aggregateMetrics.map((metric) => [metric.metricName, metric]),
  );
  const afterMetricByName = new Map(
    input.afterSummary.aggregateMetrics.map((metric) => [metric.metricName, metric]),
  );
  const metricNames = [...new Set([...beforeMetricByName.keys(), ...afterMetricByName.keys()])].sort();

  return [
    `# Buli Performance Comparison: ${input.beforeSummary.scenarioName}`,
    "",
    `- Before: \`${input.beforeSummary.implementationLabel}\` from ${input.beforeSummary.measuredAtIso}`,
    `- After: \`${input.afterSummary.implementationLabel}\` from ${input.afterSummary.measuredAtIso}`,
    "",
    "| Metric | Before Mean | After Mean | Delta | Change | Direction |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...metricNames.map((metricName) => formatComparisonRow({
      metricName,
      beforeMetric: beforeMetricByName.get(metricName),
      afterMetric: afterMetricByName.get(metricName),
    })),
    "",
  ].join("\n");
}

function formatComparisonRow(input: {
  metricName: string;
  beforeMetric: PerformanceMetricAggregate | undefined;
  afterMetric: PerformanceMetricAggregate | undefined;
}): string {
  if (!input.beforeMetric || !input.afterMetric) {
    return `| ${input.metricName} | ${formatOptionalMetric(input.beforeMetric)} | ${formatOptionalMetric(input.afterMetric)} | n/a | n/a | changed shape |`;
  }

  const delta = input.afterMetric.mean - input.beforeMetric.mean;
  const percentChange = input.beforeMetric.mean === 0 ? 0 : (delta / input.beforeMetric.mean) * 100;
  const direction = resolveChangeDirection({
    lowerIsBetter: input.beforeMetric.lowerIsBetter,
    delta,
  });
  return `| ${input.metricName} | ${formatNumber(input.beforeMetric.mean)} | ${formatNumber(input.afterMetric.mean)} | ${formatNumber(delta)} | ${formatNumber(percentChange)}% | ${direction} |`;
}

async function readSummaryFile(summaryFilePath: string): Promise<PerformanceRunSummary> {
  return readPerformanceRunSummary(JSON.parse(await readFile(summaryFilePath, "utf8")) as unknown);
}

function parseCompareCliOptions(args: readonly string[]): CompareCliParseResult {
  if (args.includes("--help") || args.includes("-h")) {
    return { status: "help", output: formatCompareUsage() };
  }

  const beforeSummaryPath = readStringOption(args, "--before");
  const afterSummaryPath = readStringOption(args, "--after");
  if (!beforeSummaryPath || !afterSummaryPath) {
    return { status: "error", output: "Both --before and --after are required." };
  }

  return {
    status: "ready",
    options: {
      beforeSummaryPath,
      afterSummaryPath,
      outputPath: readStringOption(args, "--output"),
    },
  };
}

async function main(args: readonly string[]): Promise<void> {
  const cliOptions = parseCompareCliOptions(args);
  if (cliOptions.status === "help") {
    console.log(cliOptions.output);
    return;
  }
  if (cliOptions.status === "error") {
    console.error(cliOptions.output);
    console.error(formatCompareUsage());
    process.exitCode = 1;
    return;
  }

  const comparisonMarkdown = await compareBuliPerformanceProfiles(cliOptions.options);
  console.log(comparisonMarkdown);
  if (cliOptions.options.outputPath !== undefined) {
    console.log(`Wrote performance comparison to ${cliOptions.options.outputPath}`);
  }
}

function formatCompareUsage(): string {
  return "Usage: bun run profile:compare -- --before <summary.json> --after <summary.json> [--output <comparison.md>]";
}

function readStringOption(args: readonly string[], optionName: string): string | undefined {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex === -1) {
    return undefined;
  }

  const optionValue = args[optionIndex + 1];
  if (!optionValue || optionValue.startsWith("--")) {
    return undefined;
  }

  return optionValue;
}

function resolveChangeDirection(input: {
  lowerIsBetter: boolean;
  delta: number;
}): "better" | "same" | "worse" {
  if (input.delta === 0) {
    return "same";
  }

  return input.lowerIsBetter ? input.delta < 0 ? "better" : "worse" : input.delta > 0 ? "better" : "worse";
}

function formatOptionalMetric(metric: PerformanceMetricAggregate | undefined): string {
  return metric ? formatNumber(metric.mean) : "missing";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

if (process.argv[1] === fileURLToPath(import.meta.url) || dirname(process.argv[1] ?? "") === dirname(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2));
}
