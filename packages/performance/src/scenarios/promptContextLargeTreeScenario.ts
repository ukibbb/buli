import type { BuliDiagnosticLogEvent } from "@buli/contracts";
import { PromptContextCandidateCatalog } from "@buli/engine";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createCountMetric,
  createDurationMetric,
  createBytesMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

const promptContextDirectoryCount = 40;
const promptContextFileCountPerDirectory = 50;
const promptContextSearchEntryBudget = 2_000;

export const promptContextLargeTreeScenario: PerformanceScenario = {
  scenarioName: "prompt-context-large-tree",
  description:
    "Builds a synthetic workspace and measures fuzzy prompt-context scan cost, cache-hit cost, and path-query cost.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 5,
  async runIteration(input) {
    const workspaceRootPath = join(input.runOutputDirectoryPath, "workspaces", `prompt-context-${input.iterationIndex}`);
    await createPromptContextWorkspace(workspaceRootPath);

    const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
    const promptContextCandidateCatalog = new PromptContextCandidateCatalog({
      promptContextBrowseRootPath: workspaceRootPath,
      promptContextStartingDirectoryPath: workspaceRootPath,
      maximumSearchEntryCount: promptContextSearchEntryBudget,
      diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    });

    const heapUsedBeforeQueries = process.memoryUsage().heapUsed;
    const fuzzyMiss = await measureDurationMs(() =>
      promptContextCandidateCatalog.listPromptContextCandidates("not-found-profile-token")
    );
    const fuzzyCacheHit = await measureDurationMs(() =>
      promptContextCandidateCatalog.listPromptContextCandidates("not-found-profile-token")
    );
    const pathQuery = await measureDurationMs(() =>
      promptContextCandidateCatalog.listPromptContextCandidates("directory-001/")
    );
    const heapUsedAfterQueries = process.memoryUsage().heapUsed;

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      diagnosticEvents,
      metrics: [
        createDurationMetric({
          metricName: "prompt_context.fuzzy_miss.duration_ms",
          durationMs: fuzzyMiss.durationMs,
          budget: { warnAbove: 50, failAbove: 100 },
        }),
        createDurationMetric({
          metricName: "prompt_context.fuzzy_cache_hit.duration_ms",
          durationMs: fuzzyCacheHit.durationMs,
          budget: { warnAbove: 2, failAbove: 10 },
        }),
        createDurationMetric({
          metricName: "prompt_context.path_query.duration_ms",
          durationMs: pathQuery.durationMs,
          budget: { warnAbove: 5, failAbove: 20 },
        }),
        createCountMetric({
          metricName: "prompt_context.fuzzy_miss.candidate_count",
          count: fuzzyMiss.measuredValue.length,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "prompt_context.fuzzy_miss.scanned_entry_count",
          count: readPromptContextScannedEntryCount(diagnosticEvents, "miss"),
          budget: { warnAbove: promptContextSearchEntryBudget, failAbove: promptContextSearchEntryBudget },
        }),
        createCountMetric({
          metricName: "prompt_context.path_query.candidate_count",
          count: pathQuery.measuredValue.length,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "prompt_context.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterQueries - heapUsedBeforeQueries),
          budget: { warnAbove: 8_000_000, failAbove: 16_000_000 },
        }),
      ],
    };
  },
};

async function createPromptContextWorkspace(workspaceRootPath: string): Promise<void> {
  await mkdir(workspaceRootPath, { recursive: true });

  for (let directoryIndex = 0; directoryIndex < promptContextDirectoryCount; directoryIndex += 1) {
    const directoryPath = join(workspaceRootPath, `directory-${directoryIndex.toString().padStart(3, "0")}`);
    await mkdir(directoryPath, { recursive: true });
    await Promise.all(
      Array.from({ length: promptContextFileCountPerDirectory }, (_value, fileIndex) =>
        writeFile(
          join(directoryPath, `entry-${fileIndex.toString().padStart(3, "0")}.txt`),
          `profile fixture ${directoryIndex}:${fileIndex}\n`,
          "utf8",
        )
      ),
    );
  }
}

function readPromptContextScannedEntryCount(
  diagnosticEvents: readonly BuliDiagnosticLogEvent[],
  cacheStatus: "miss" | "hit",
): number {
  const diagnosticEvent = diagnosticEvents.findLast((event) =>
    event.subsystem === "engine" &&
    event.eventName === "prompt_context.candidates_loaded" &&
    event.fields?.["cacheStatus"] === cacheStatus
  );
  const scannedEntryCount = diagnosticEvent?.fields?.["scannedEntryCount"];
  return typeof scannedEntryCount === "number" ? scannedEntryCount : 0;
}
