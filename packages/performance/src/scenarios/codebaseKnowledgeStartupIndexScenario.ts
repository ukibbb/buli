import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createTreeSitterCodebaseStructureIndexer,
  JsonFileCodebaseKnowledgeRepository,
} from "@buli/codebase-knowledge";
import type { BuliDiagnosticLogEvent, BuliDiagnosticLogFields } from "@buli/contracts";
import {
  defaultWorkspaceCodebaseKnowledgeIndexFilePath,
  TreeSitterWorkspaceCodebaseKnowledgeIndex,
} from "@buli/engine";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

export type CodebaseKnowledgeStartupIndexScenarioConfig = Readonly<{
  sourceDirectoryCount: number;
  sourceFilesPerDirectory: number;
}>;

type StartupIndexPassMeasurement = Readonly<{
  durationMs: number;
  snapshotReadDurationMs: number;
  recordsLoadDurationMs: number;
  recordsLoadedCount: number;
  workspaceScanDurationMs: number;
  scannedFileCount: number;
  indexableFileCount: number;
  reusedFromStatsFileCount: number;
  hashedFileCount: number;
  reusedAfterHashFileCount: number;
  parsedFileCount: number;
  snapshotWriteDurationMs: number;
  snapshotWriteSkippedCount: number;
}>;

const defaultScenarioConfig: CodebaseKnowledgeStartupIndexScenarioConfig = {
  sourceDirectoryCount: 24,
  sourceFilesPerDirectory: 25,
};

export const codebaseKnowledgeStartupIndexScenario = createCodebaseKnowledgeStartupIndexScenario();

export function createCodebaseKnowledgeStartupIndexScenario(
  config: CodebaseKnowledgeStartupIndexScenarioConfig = defaultScenarioConfig,
): PerformanceScenario {
  validateScenarioConfig(config);

  return {
    scenarioName: "codebase-knowledge-startup-index",
    description:
      "Builds a larger synthetic TypeScript/TSX/Python workspace and measures full startup indexing, unchanged restart reuse, modified-file reindexing, and mtime-only restart hashing.",
    defaultWarmupCount: 1,
    defaultRepeatCount: 3,
    async runIteration(input) {
      const scenarioDirectoryPath = join(
        input.runOutputDirectoryPath,
        "codebase-knowledge-startup-index",
        `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      );
      await rm(scenarioDirectoryPath, { recursive: true, force: true });
      const workspaceRootPath = join(scenarioDirectoryPath, "workspace");
      const sourceFilePaths = await createSyntheticCodebaseWorkspace({ workspaceRootPath, config });
      const modifiedSourceFilePath = readRequiredSourceFilePath({ sourceFilePaths, fileIndex: 0 });
      const mtimeOnlySourceFilePath = readRequiredSourceFilePath({ sourceFilePaths, fileIndex: 1 });
      const heapUsedBeforeIndexing = process.memoryUsage().heapUsed;

      const fullIndexPass = await measureStartupIndexPass({ workspaceRootPath });
      const unchangedRestartPass = await measureStartupIndexPass({ workspaceRootPath });

      await writeFile(
        join(workspaceRootPath, modifiedSourceFilePath),
        createSyntheticSourceFileText({ displayPath: modifiedSourceFilePath, revision: "modified" }),
        "utf8",
      );
      const modifiedFileRestartPass = await measureStartupIndexPass({ workspaceRootPath });

      const mtimeOnlySourceFileAbsolutePath = join(workspaceRootPath, mtimeOnlySourceFilePath);
      const changedModifiedTime = new Date(Date.now() + 60_000 + input.iterationIndex);
      await utimes(mtimeOnlySourceFileAbsolutePath, changedModifiedTime, changedModifiedTime);
      const mtimeOnlyRestartPass = await measureStartupIndexPass({ workspaceRootPath });

      const heapUsedAfterIndexing = process.memoryUsage().heapUsed;
      const repositorySnapshot = await new JsonFileCodebaseKnowledgeRepository({
        indexFilePath: defaultWorkspaceCodebaseKnowledgeIndexFilePath({ workspaceRootPath }),
      }).readSnapshot();
      const indexFileStats = await stat(defaultWorkspaceCodebaseKnowledgeIndexFilePath({ workspaceRootPath }));

      return {
        iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
        metrics: [
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.full.duration_ms",
            durationMs: fullIndexPass.durationMs,
            budget: { warnAbove: 5_000, failAbove: 15_000 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.duration_ms",
            durationMs: unchangedRestartPass.durationMs,
            budget: { warnAbove: 300, failAbove: 1_500 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.duration_ms",
            durationMs: modifiedFileRestartPass.durationMs,
            budget: { warnAbove: 2_000, failAbove: 6_000 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.duration_ms",
            durationMs: mtimeOnlyRestartPass.durationMs,
            budget: { warnAbove: 500, failAbove: 2_000 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.full.snapshot_read.duration_ms",
            durationMs: fullIndexPass.snapshotReadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.snapshot_read.duration_ms",
            durationMs: unchangedRestartPass.snapshotReadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.snapshot_read.duration_ms",
            durationMs: modifiedFileRestartPass.snapshotReadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.snapshot_read.duration_ms",
            durationMs: mtimeOnlyRestartPass.snapshotReadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.full.records_load.duration_ms",
            durationMs: fullIndexPass.recordsLoadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.records_load.duration_ms",
            durationMs: unchangedRestartPass.recordsLoadDurationMs,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.records_load.duration_ms",
            durationMs: modifiedFileRestartPass.recordsLoadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.records_load.duration_ms",
            durationMs: mtimeOnlyRestartPass.recordsLoadDurationMs,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.full.workspace_scan.duration_ms",
            durationMs: fullIndexPass.workspaceScanDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.workspace_scan.duration_ms",
            durationMs: unchangedRestartPass.workspaceScanDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.workspace_scan.duration_ms",
            durationMs: modifiedFileRestartPass.workspaceScanDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.workspace_scan.duration_ms",
            durationMs: mtimeOnlyRestartPass.workspaceScanDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.full.snapshot_write.duration_ms",
            durationMs: fullIndexPass.snapshotWriteDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.snapshot_write.duration_ms",
            durationMs: unchangedRestartPass.snapshotWriteDurationMs,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.snapshot_write.duration_ms",
            durationMs: modifiedFileRestartPass.snapshotWriteDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.snapshot_write.duration_ms",
            durationMs: mtimeOnlyRestartPass.snapshotWriteDurationMs,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.full.scanned_file_count",
            count: fullIndexPass.scannedFileCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.full.indexable_file_count",
            count: fullIndexPass.indexableFileCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.full.parsed_file_count",
            count: fullIndexPass.parsedFileCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.full.records_loaded_count",
            count: fullIndexPass.recordsLoadedCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.reused_from_stats_file_count",
            count: unchangedRestartPass.reusedFromStatsFileCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.records_loaded_count",
            count: unchangedRestartPass.recordsLoadedCount,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.parsed_file_count",
            count: unchangedRestartPass.parsedFileCount,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.unchanged_restart.snapshot_write_skipped_count",
            count: unchangedRestartPass.snapshotWriteSkippedCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.parsed_file_count",
            count: modifiedFileRestartPass.parsedFileCount,
            budget: { warnAbove: 1, failAbove: 1 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.snapshot_write_skipped_count",
            count: modifiedFileRestartPass.snapshotWriteSkippedCount,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.modified_file_restart.records_loaded_count",
            count: modifiedFileRestartPass.recordsLoadedCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.hashed_file_count",
            count: mtimeOnlyRestartPass.hashedFileCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.reused_after_hash_file_count",
            count: mtimeOnlyRestartPass.reusedAfterHashFileCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.records_loaded_count",
            count: mtimeOnlyRestartPass.recordsLoadedCount,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.parsed_file_count",
            count: mtimeOnlyRestartPass.parsedFileCount,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.mtime_only_restart.snapshot_write_skipped_count",
            count: mtimeOnlyRestartPass.snapshotWriteSkippedCount,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.indexed_file_count",
            count: repositorySnapshot.indexedFiles.length,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.knowledge_record_count",
            count: repositorySnapshot.records.length,
            lowerIsBetter: false,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.index_file_size_bytes",
            bytes: indexFileStats.size,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.heap_used_delta_bytes",
            bytes: Math.max(0, heapUsedAfterIndexing - heapUsedBeforeIndexing),
            budget: { warnAbove: 150_000_000, failAbove: 300_000_000 },
          }),
        ],
      };
    },
  };
}

async function measureStartupIndexPass(input: { workspaceRootPath: string }): Promise<StartupIndexPassMeasurement> {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const workspaceCodebaseKnowledgeIndex = new TreeSitterWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath: input.workspaceRootPath,
    codebaseKnowledgeRepository: new JsonFileCodebaseKnowledgeRepository({
      indexFilePath: defaultWorkspaceCodebaseKnowledgeIndexFilePath({ workspaceRootPath: input.workspaceRootPath }),
    }),
    createStructureIndexer: createTreeSitterCodebaseStructureIndexer,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const measuredIndexingPass = await measureDurationMs(() => workspaceCodebaseKnowledgeIndex.ensureWorkspaceIndexed());
  const workspaceIndexDiagnosticFields = readWorkspaceIndexCompletedDiagnostic(diagnosticEvents).fields;
  return {
    durationMs: measuredIndexingPass.durationMs,
    snapshotReadDurationMs: readNumberField(workspaceIndexDiagnosticFields, "snapshotReadDurationMs"),
    recordsLoadDurationMs: readNumberField(workspaceIndexDiagnosticFields, "recordsLoadDurationMs"),
    recordsLoadedCount: readBooleanField(workspaceIndexDiagnosticFields, "recordsLoaded") ? 1 : 0,
    workspaceScanDurationMs: readNumberField(workspaceIndexDiagnosticFields, "workspaceScanDurationMs"),
    scannedFileCount: readNumberField(workspaceIndexDiagnosticFields, "scannedFileCount"),
    indexableFileCount: readNumberField(workspaceIndexDiagnosticFields, "indexableFileCount"),
    reusedFromStatsFileCount: readNumberField(workspaceIndexDiagnosticFields, "reusedFromStatsFileCount"),
    hashedFileCount: readNumberField(workspaceIndexDiagnosticFields, "hashedFileCount"),
    reusedAfterHashFileCount: readNumberField(workspaceIndexDiagnosticFields, "reusedAfterHashFileCount"),
    parsedFileCount: readNumberField(workspaceIndexDiagnosticFields, "parsedFileCount"),
    snapshotWriteDurationMs: readNumberField(workspaceIndexDiagnosticFields, "snapshotWriteDurationMs"),
    snapshotWriteSkippedCount: readBooleanField(workspaceIndexDiagnosticFields, "snapshotWriteSkipped") ? 1 : 0,
  };
}

async function createSyntheticCodebaseWorkspace(input: {
  workspaceRootPath: string;
  config: CodebaseKnowledgeStartupIndexScenarioConfig;
}): Promise<readonly string[]> {
  const sourceFilePaths: string[] = [];
  for (let sourceDirectoryIndex = 0; sourceDirectoryIndex < input.config.sourceDirectoryCount; sourceDirectoryIndex += 1) {
    for (let sourceFileIndex = 0; sourceFileIndex < input.config.sourceFilesPerDirectory; sourceFileIndex += 1) {
      const sourceFilePath = createSyntheticSourceFilePath({ sourceDirectoryIndex, sourceFileIndex });
      sourceFilePaths.push(sourceFilePath);
      const absoluteSourceFilePath = join(input.workspaceRootPath, sourceFilePath);
      await mkdir(dirname(absoluteSourceFilePath), { recursive: true });
      await writeFile(
        absoluteSourceFilePath,
        createSyntheticSourceFileText({ displayPath: sourceFilePath, revision: "initial" }),
        "utf8",
      );
    }
  }

  return sourceFilePaths;
}

function createSyntheticSourceFilePath(input: { sourceDirectoryIndex: number; sourceFileIndex: number }): string {
  const directoryName = `module-${input.sourceDirectoryIndex.toString().padStart(3, "0")}`;
  const fileNameStem = `feature-${input.sourceFileIndex.toString().padStart(3, "0")}`;
  switch (input.sourceFileIndex % 3) {
    case 0:
      return `src/${directoryName}/${fileNameStem}.ts`;
    case 1:
      return `src/${directoryName}/${fileNameStem}.tsx`;
    default:
      return `src/${directoryName}/${fileNameStem}.py`;
  }
}

function createSyntheticSourceFileText(input: { displayPath: string; revision: "initial" | "modified" }): string {
  const sourceIdentifier = createSourceIdentifier(input.displayPath);
  if (input.displayPath.endsWith(".py")) {
    return createSyntheticPythonSourceFileText({ sourceIdentifier, revision: input.revision });
  }
  if (input.displayPath.endsWith(".tsx")) {
    return createSyntheticTsxSourceFileText({ sourceIdentifier, revision: input.revision });
  }
  return createSyntheticTypeScriptSourceFileText({ sourceIdentifier, revision: input.revision });
}

function createSyntheticTypeScriptSourceFileText(input: { sourceIdentifier: string; revision: "initial" | "modified" }): string {
  return [
    `export type Generated${input.sourceIdentifier} = {`,
    "  value: number;",
    "  label: string;",
    "};",
    "",
    `export function createGenerated${input.sourceIdentifier}(): Generated${input.sourceIdentifier} {`,
    `  return { value: ${input.revision === "initial" ? 1 : 2}, label: "${input.sourceIdentifier}" };`,
    "}",
    "",
    `export const generated${input.sourceIdentifier}Value = createGenerated${input.sourceIdentifier}();`,
    "",
  ].join("\n");
}

function createSyntheticTsxSourceFileText(input: { sourceIdentifier: string; revision: "initial" | "modified" }): string {
  return [
    `export interface Generated${input.sourceIdentifier}Props {`,
    "  title: string;",
    "  count: number;",
    "}",
    "",
    `export function Generated${input.sourceIdentifier}Card(props: Generated${input.sourceIdentifier}Props) {`,
    `  const revisionLabel = "${input.revision}";`,
    "  return <section data-revision={revisionLabel}><h2>{props.title}</h2><span>{props.count}</span></section>;",
    "}",
    "",
  ].join("\n");
}

function createSyntheticPythonSourceFileText(input: { sourceIdentifier: string; revision: "initial" | "modified" }): string {
  const snakeCaseIdentifier = input.sourceIdentifier.toLowerCase();
  return [
    "from dataclasses import dataclass",
    "",
    "",
    "@dataclass",
    `class Generated${input.sourceIdentifier}:`,
    "    label: str",
    "    value: int",
    "",
    "",
    `def create_generated_${snakeCaseIdentifier}() -> Generated${input.sourceIdentifier}:`,
    `    return Generated${input.sourceIdentifier}(label="${input.revision}", value=${input.revision === "initial" ? 1 : 2})`,
    "",
  ].join("\n");
}

function createSourceIdentifier(displayPath: string): string {
  return displayPath
    .replace(/^src\//, "")
    .replace(/\.[^.]+$/, "")
    .split(/[/-]/)
    .map((pathSegment) => pathSegment.charAt(0).toUpperCase() + pathSegment.slice(1))
    .join("");
}

function readRequiredSourceFilePath(input: { sourceFilePaths: readonly string[]; fileIndex: number }): string {
  const sourceFilePath = input.sourceFilePaths[input.fileIndex];
  if (!sourceFilePath) {
    throw new Error(`Codebase knowledge startup index scenario requires at least ${input.fileIndex + 1} source files.`);
  }
  return sourceFilePath;
}

function validateScenarioConfig(config: CodebaseKnowledgeStartupIndexScenarioConfig): void {
  if (config.sourceDirectoryCount < 1 || config.sourceFilesPerDirectory < 2) {
    throw new Error("Codebase knowledge startup index scenario requires at least one directory and two files per directory.");
  }
}

function readWorkspaceIndexCompletedDiagnostic(diagnosticEvents: readonly BuliDiagnosticLogEvent[]): BuliDiagnosticLogEvent {
  const diagnosticEvent = diagnosticEvents.find((event) =>
    event.subsystem === "engine" && event.eventName === "codebase_knowledge.workspace_index_completed"
  );
  if (!diagnosticEvent) {
    throw new Error("Codebase knowledge startup index scenario did not receive workspace index diagnostics.");
  }
  return diagnosticEvent;
}

function readNumberField(fields: BuliDiagnosticLogFields | undefined, fieldName: string): number {
  const fieldValue = fields?.[fieldName];
  if (typeof fieldValue !== "number") {
    throw new Error(`Expected numeric codebase knowledge startup diagnostic field ${fieldName}.`);
  }
  return fieldValue;
}

function readBooleanField(fields: BuliDiagnosticLogFields | undefined, fieldName: string): boolean {
  const fieldValue = fields?.[fieldName];
  if (typeof fieldValue !== "boolean") {
    throw new Error(`Expected boolean codebase knowledge startup diagnostic field ${fieldName}.`);
  }
  return fieldValue;
}
