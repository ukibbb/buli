import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPerformanceRunSummary,
  formatPerformanceRunMarkdown,
  type PerformanceRunSummary,
} from "./model/performanceRunSummary.ts";
import type { PerformanceScenarioIterationResult } from "./model/performanceScenario.ts";
import {
  listBuliPerformanceScenarioNames,
  resolveBuliPerformanceScenario,
} from "./scenarios/scenarioRegistry.ts";

type PerformanceProfileCliOptions = Readonly<{
  scenarioName: string;
  implementationLabel: string;
  outputDirectoryPath: string;
  repeatCount: number | undefined;
  warmupCount: number | undefined;
}>;

type PerformanceProfileCliParseResult =
  | Readonly<{ status: "ready"; options: PerformanceProfileCliOptions }>
  | Readonly<{ status: "help"; output: string }>
  | Readonly<{ status: "error"; output: string }>;

const defaultImplementationLabel = "current";

export async function runBuliPerformanceProfile(input: PerformanceProfileCliOptions): Promise<PerformanceRunSummary> {
  const scenario = resolveBuliPerformanceScenario(input.scenarioName);
  const warmupCount = input.warmupCount ?? scenario.defaultWarmupCount;
  const repeatCount = input.repeatCount ?? scenario.defaultRepeatCount;
  const runOutputDirectoryPath = input.outputDirectoryPath;
  const warmupIterations: PerformanceScenarioIterationResult[] = [];
  const measuredIterations: PerformanceScenarioIterationResult[] = [];

  await mkdir(runOutputDirectoryPath, { recursive: true });

  for (let warmupIndex = 0; warmupIndex < warmupCount; warmupIndex += 1) {
    warmupIterations.push(await scenario.runIteration({
      iterationIndex: warmupIndex,
      isWarmup: true,
      runOutputDirectoryPath,
    }));
  }

  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
    measuredIterations.push(await scenario.runIteration({
      iterationIndex: repeatIndex,
      isWarmup: false,
      runOutputDirectoryPath,
    }));
  }

  const performanceRunSummary = buildPerformanceRunSummary({
    scenario,
    implementationLabel: input.implementationLabel,
    measuredAtIso: new Date().toISOString(),
    warmupIterations,
    measuredIterations,
  });
  await writePerformanceRunSummary(runOutputDirectoryPath, performanceRunSummary);
  return performanceRunSummary;
}

async function writePerformanceRunSummary(
  outputDirectoryPath: string,
  performanceRunSummary: PerformanceRunSummary,
): Promise<void> {
  await writeFile(
    join(outputDirectoryPath, "summary.json"),
    `${JSON.stringify(performanceRunSummary, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(outputDirectoryPath, "summary.md"),
    formatPerformanceRunMarkdown(performanceRunSummary),
    "utf8",
  );
}

function parsePerformanceProfileCliOptions(args: readonly string[]): PerformanceProfileCliParseResult {
  if (args.includes("--help") || args.includes("-h")) {
    return { status: "help", output: formatProfileUsage() };
  }

  const scenarioName = readStringOption(args, "--scenario") ?? "prompt-context-large-tree";
  const outputDirectoryPath = readStringOption(args, "--output-dir") ?? createDefaultOutputDirectoryPath(scenarioName);
  const implementationLabel = readStringOption(args, "--implementation-label") ?? defaultImplementationLabel;
  const repeatCountResolution = readPositiveIntegerOption(args, "--repeat");
  if (repeatCountResolution.status === "invalid") {
    return { status: "error", output: "Invalid --repeat. Use a positive integer." };
  }
  const warmupCountResolution = readNonNegativeIntegerOption(args, "--warmups");
  if (warmupCountResolution.status === "invalid") {
    return { status: "error", output: "Invalid --warmups. Use a non-negative integer." };
  }

  try {
    resolveBuliPerformanceScenario(scenarioName);
  } catch (error) {
    return { status: "error", output: error instanceof Error ? error.message : String(error) };
  }

  return {
    status: "ready",
    options: {
      scenarioName,
      implementationLabel,
      outputDirectoryPath,
      repeatCount: repeatCountResolution.value,
      warmupCount: warmupCountResolution.value,
    },
  };
}

async function main(args: readonly string[]): Promise<void> {
  const cliOptions = parsePerformanceProfileCliOptions(args);
  if (cliOptions.status === "help") {
    console.log(cliOptions.output);
    return;
  }
  if (cliOptions.status === "error") {
    console.error(cliOptions.output);
    console.error(formatProfileUsage());
    process.exitCode = 1;
    return;
  }

  const performanceRunSummary = await runBuliPerformanceProfile(cliOptions.options);
  console.log(formatPerformanceRunMarkdown(performanceRunSummary));
  console.log(`Wrote performance profile to ${cliOptions.options.outputDirectoryPath}`);
}

function formatProfileUsage(): string {
  return [
    "Usage: bun run profile -- --scenario <name> [--output-dir <path>] [--implementation-label <label>] [--repeat <n>] [--warmups <n>]",
    `Available scenarios: ${listBuliPerformanceScenarioNames().join(", ")}`,
  ].join("\n");
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

function readPositiveIntegerOption(
  args: readonly string[],
  optionName: string,
): Readonly<{ status: "valid"; value: number | undefined }> | Readonly<{ status: "invalid" }> {
  const optionValue = readStringOption(args, optionName);
  if (optionValue === undefined) {
    return { status: "valid", value: undefined };
  }

  const numericOptionValue = Number(optionValue);
  if (!Number.isInteger(numericOptionValue) || numericOptionValue < 1) {
    return { status: "invalid" };
  }

  return { status: "valid", value: numericOptionValue };
}

function readNonNegativeIntegerOption(
  args: readonly string[],
  optionName: string,
): Readonly<{ status: "valid"; value: number | undefined }> | Readonly<{ status: "invalid" }> {
  const optionValue = readStringOption(args, optionName);
  if (optionValue === undefined) {
    return { status: "valid", value: undefined };
  }

  const numericOptionValue = Number(optionValue);
  if (!Number.isInteger(numericOptionValue) || numericOptionValue < 0) {
    return { status: "invalid" };
  }

  return { status: "valid", value: numericOptionValue };
}

function createDefaultOutputDirectoryPath(scenarioName: string): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return join(process.cwd(), "profile-runs", `${scenarioName}-${timestamp}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
