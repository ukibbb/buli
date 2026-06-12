import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buliTaskCompletionEvals,
  listBuliTaskCompletionEvalNames,
  resolveBuliTaskCompletionEval,
} from "./evals/evalRegistry.ts";
import {
  buildPerformanceRunSummary,
  formatPerformanceRunMarkdown,
  type PerformanceRunSummary,
} from "./model/performanceRunSummary.ts";
import type { PerformanceScenario, PerformanceScenarioIterationResult } from "./model/performanceScenario.ts";

type EvalRunCliOptions = Readonly<{
  evalNames: readonly string[];
  implementationLabel: string;
  outputDirectoryPath: string;
  repeatCount: number | undefined;
}>;

export type EvalRunOutcome = Readonly<{
  evalName: string;
  summary: PerformanceRunSummary;
  hasFailedMetric: boolean;
}>;

export async function runBuliTaskCompletionEvals(input: EvalRunCliOptions): Promise<readonly EvalRunOutcome[]> {
  const evalRunOutcomes: EvalRunOutcome[] = [];
  for (const evalName of input.evalNames) {
    const taskCompletionEval = resolveBuliTaskCompletionEval(evalName);
    const evalOutputDirectoryPath = join(input.outputDirectoryPath, evalName);
    await mkdir(evalOutputDirectoryPath, { recursive: true });
    const summary = await runSingleEval({
      taskCompletionEval,
      implementationLabel: input.implementationLabel,
      evalOutputDirectoryPath,
      repeatCount: input.repeatCount,
    });
    evalRunOutcomes.push({
      evalName,
      summary,
      hasFailedMetric: summary.aggregateMetrics.some((aggregateMetric) => aggregateMetric.budgetStatus === "failed"),
    });
  }
  return evalRunOutcomes;
}

async function runSingleEval(input: {
  taskCompletionEval: PerformanceScenario;
  implementationLabel: string;
  evalOutputDirectoryPath: string;
  repeatCount: number | undefined;
}): Promise<PerformanceRunSummary> {
  const repeatCount = input.repeatCount ?? input.taskCompletionEval.defaultRepeatCount;
  const measuredIterations: PerformanceScenarioIterationResult[] = [];
  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
    measuredIterations.push(await input.taskCompletionEval.runIteration({
      iterationIndex: repeatIndex,
      isWarmup: false,
      runOutputDirectoryPath: input.evalOutputDirectoryPath,
    }));
  }

  const summary = buildPerformanceRunSummary({
    scenario: input.taskCompletionEval,
    implementationLabel: input.implementationLabel,
    measuredAtIso: new Date().toISOString(),
    warmupIterations: [],
    measuredIterations,
  });
  await writeFile(join(input.evalOutputDirectoryPath, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(input.evalOutputDirectoryPath, "summary.md"), formatPerformanceRunMarkdown(summary), "utf8");
  return summary;
}

function parseEvalRunCliOptions(args: readonly string[]):
  | Readonly<{ status: "ready"; options: EvalRunCliOptions }>
  | Readonly<{ status: "help"; output: string }>
  | Readonly<{ status: "error"; output: string }> {
  if (args.includes("--help") || args.includes("-h")) {
    return { status: "help", output: formatEvalUsage() };
  }

  const requestedEvalName = readStringOption(args, "--eval");
  const evalNames = requestedEvalName === undefined ? listBuliTaskCompletionEvalNames() : [requestedEvalName];
  if (requestedEvalName !== undefined && !listBuliTaskCompletionEvalNames().includes(requestedEvalName)) {
    return { status: "error", output: `Unknown eval "${requestedEvalName}". Available evals: ${listBuliTaskCompletionEvalNames().join(", ")}` };
  }
  const repeatOptionText = readStringOption(args, "--repeat");
  const repeatCount = repeatOptionText === undefined ? undefined : Number(repeatOptionText);
  if (repeatCount !== undefined && (!Number.isInteger(repeatCount) || repeatCount < 1)) {
    return { status: "error", output: "Invalid --repeat. Use a positive integer." };
  }

  return {
    status: "ready",
    options: {
      evalNames,
      implementationLabel: readStringOption(args, "--implementation-label") ?? "current",
      outputDirectoryPath: readStringOption(args, "--output-dir") ??
        join(process.cwd(), "profile-runs", "evals", new Date().toISOString().replaceAll(":", "-")),
      repeatCount,
    },
  };
}

async function main(args: readonly string[]): Promise<void> {
  const cliOptions = parseEvalRunCliOptions(args);
  if (cliOptions.status === "help") {
    console.log(cliOptions.output);
    return;
  }
  if (cliOptions.status === "error") {
    console.error(cliOptions.output);
    console.error(formatEvalUsage());
    process.exitCode = 1;
    return;
  }

  const evalRunOutcomes = await runBuliTaskCompletionEvals(cliOptions.options);
  for (const evalRunOutcome of evalRunOutcomes) {
    console.log(formatPerformanceRunMarkdown(evalRunOutcome.summary));
  }
  const failedEvalNames = evalRunOutcomes.filter((outcome) => outcome.hasFailedMetric).map((outcome) => outcome.evalName);
  console.log(`Wrote eval summaries to ${cliOptions.options.outputDirectoryPath}`);
  if (failedEvalNames.length > 0) {
    console.error(`FAILED evals: ${failedEvalNames.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASSED all ${evalRunOutcomes.length} evals.`);
}

function formatEvalUsage(): string {
  return [
    "Usage: bun run eval -- [--eval <name>] [--output-dir <path>] [--implementation-label <label>] [--repeat <n>]",
    `Available evals: ${buliTaskCompletionEvals.map((taskCompletionEval) => taskCompletionEval.scenarioName).join(", ")}`,
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
