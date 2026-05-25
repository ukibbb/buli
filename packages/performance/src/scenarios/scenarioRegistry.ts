import type { PerformanceScenario } from "../model/performanceScenario.ts";
import { assistantReducerReplayScenario } from "./assistantReducerReplayScenario.ts";
import { openAiStreamReplayScenario } from "./openAiStreamReplayScenario.ts";
import { promptContextLargeTreeScenario } from "./promptContextLargeTreeScenario.ts";
import { transcriptViewModelScenario } from "./transcriptViewModelScenario.ts";

export const buliPerformanceScenarios = [
  promptContextLargeTreeScenario,
  transcriptViewModelScenario,
  openAiStreamReplayScenario,
  assistantReducerReplayScenario,
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
