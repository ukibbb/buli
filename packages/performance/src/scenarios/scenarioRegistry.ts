import type { PerformanceScenario } from "../model/performanceScenario.ts";
import { assistantReducerReplayScenario } from "./assistantReducerReplayScenario.ts";
import { openAiStreamReplayScenario } from "./openAiStreamReplayScenario.ts";
import { promptContextLargeTreeScenario } from "./promptContextLargeTreeScenario.ts";
import { sqliteSessionLargeHistoryScenario } from "./sqliteSessionLargeHistoryScenario.ts";
import { taskSubagentRuntimeScenario } from "./taskSubagentRuntimeScenario.ts";
import { toolOutputContextGrowthScenario } from "./toolOutputContextGrowthScenario.ts";
import { transcriptViewModelScenario } from "./transcriptViewModelScenario.ts";

export const buliPerformanceScenarios = [
  promptContextLargeTreeScenario,
  transcriptViewModelScenario,
  openAiStreamReplayScenario,
  assistantReducerReplayScenario,
  taskSubagentRuntimeScenario,
  sqliteSessionLargeHistoryScenario,
  toolOutputContextGrowthScenario,
] as const satisfies readonly PerformanceScenario[];

export function listBuliPerformanceScenarioNames(): readonly string[] {
  return buliPerformanceScenarios.map((scenario) => scenario.scenarioName);
}

export function resolveBuliPerformanceScenario(scenarioName: string): PerformanceScenario {
  const scenario = buliPerformanceScenarios.find((candidateScenario) => candidateScenario.scenarioName === scenarioName);
  if (!scenario) {
    throw new Error(`Unknown performance scenario \`${scenarioName}\`. Available scenarios: ${listBuliPerformanceScenarioNames().join(", ")}.`);
  }

  return scenario;
}
