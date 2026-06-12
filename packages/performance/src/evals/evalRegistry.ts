import type { PerformanceScenario } from "../model/performanceScenario.ts";
import { debuggingEval } from "./tasks/debuggingEval.ts";
import { fileExplorationEval } from "./tasks/fileExplorationEval.ts";
import { longToolChainEval } from "./tasks/longToolChainEval.ts";
import { multiFileEditEval } from "./tasks/multiFileEditEval.ts";
import { subagentDelegationEval } from "./tasks/subagentDelegationEval.ts";

export const buliTaskCompletionEvals = [
  fileExplorationEval,
  multiFileEditEval,
  debuggingEval,
  longToolChainEval,
  subagentDelegationEval,
] as const satisfies readonly PerformanceScenario[];

export function listBuliTaskCompletionEvalNames(): readonly string[] {
  return buliTaskCompletionEvals.map((taskCompletionEval) => taskCompletionEval.scenarioName);
}

export function resolveBuliTaskCompletionEval(evalName: string): PerformanceScenario {
  const taskCompletionEval = buliTaskCompletionEvals.find((candidateEval) => candidateEval.scenarioName === evalName);
  if (!taskCompletionEval) {
    throw new Error(`Unknown eval "${evalName}". Available evals: ${listBuliTaskCompletionEvalNames().join(", ")}`);
  }
  return taskCompletionEval;
}
