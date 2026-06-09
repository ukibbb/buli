import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { JsonFileCodebaseKnowledgeRepository } from "@buli/codebase-knowledge";
import type { BuliDiagnosticLogEvent, BuliDiagnosticLogFields } from "@buli/contracts";
import {
  createDefaultWorkspaceCodebaseKnowledgeIndex,
  defaultWorkspaceCodebaseKnowledgeIndexFilePath,
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

type RuntimeChangedFileRefreshPassMeasurement = Readonly<{
  durationMs: number;
  changedFilesRefreshDurationMs: number;
  requestedChangedFileCount: number;
  refreshedFileCount: number;
  replacedFileRecordCount: number;
  removedFileRecordCount: number;
  outputRecordCount: number;
  fileReadDurationMs: number;
  fileIndexDurationMs: number;
  repositoryReplaceDurationMs: number;
  repositoryRecordsReadDurationMs: number;
  repositoryRecordsJsonParseDurationMs: number;
  repositoryRecordsSchemaParseDurationMs: number;
  repositoryRecordsMapToMemoryDurationMs: number;
  repositoryRecordsMapToDiskDurationMs: number;
  repositoryRecordsJsonStringifyDurationMs: number;
  repositoryRecordsWriteTemporaryFileDurationMs: number;
  repositoryRecordsRenameTemporaryFileDurationMs: number;
  repositoryRecordsFileTextByteLength: number;
  repositoryRecordsSerializedJsonByteLength: number;
  repositoryRecordsSchemaParsedRecordCount: number;
  changedFilesRefreshMemoryDeltaRssBytes: number;
  changedFilesRefreshMemoryDeltaHeapUsedBytes: number;
  changedFilesRefreshMemoryDeltaExternalBytes: number;
  changedFilesRefreshMemoryDeltaArrayBuffersBytes: number;
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
      "Builds a larger synthetic TypeScript/TSX/Python workspace and measures full startup indexing, unchanged restart reuse, runtime changed-file refresh, modified-file reindexing, and mtime-only restart hashing.",
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
      const runtimeRefreshSourceFilePath = readRequiredSourceFilePath({ sourceFilePaths, fileIndex: 2 });
      const heapUsedBeforeIndexing = process.memoryUsage().heapUsed;

      const fullIndexPass = await measureStartupIndexPass({ workspaceRootPath });
      const unchangedRestartPass = await measureStartupIndexPass({ workspaceRootPath });
      const runtimeChangedFileRefreshPass = await measureRuntimeChangedFileRefreshPass({
        workspaceRootPath,
        sourceFilePath: runtimeRefreshSourceFilePath,
      });

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
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.durationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.engine_refresh.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.changedFilesRefreshDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.file_read.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.fileReadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.file_index.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.fileIndexDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository_replace.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryReplaceDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_read.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsReadDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_json_parse.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsJsonParseDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_schema_parse.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsSchemaParseDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_map_to_memory.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsMapToMemoryDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_map_to_disk.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsMapToDiskDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_json_stringify.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsJsonStringifyDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_write_temporary_file.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsWriteTemporaryFileDurationMs,
          }),
          createDurationMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_rename_temporary_file.duration_ms",
            durationMs: runtimeChangedFileRefreshPass.repositoryRecordsRenameTemporaryFileDurationMs,
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
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.requested_changed_file_count",
            count: runtimeChangedFileRefreshPass.requestedChangedFileCount,
            budget: { warnAbove: 1, failAbove: 1 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.refreshed_file_count",
            count: runtimeChangedFileRefreshPass.refreshedFileCount,
            budget: { warnAbove: 1, failAbove: 1 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.replaced_file_record_count",
            count: runtimeChangedFileRefreshPass.replacedFileRecordCount,
            budget: { warnAbove: 1, failAbove: 1 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.removed_file_record_count",
            count: runtimeChangedFileRefreshPass.removedFileRecordCount,
            budget: { warnAbove: 0, failAbove: 0 },
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.output_record_count",
            count: runtimeChangedFileRefreshPass.outputRecordCount,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_schema_parse.record_count",
            count: runtimeChangedFileRefreshPass.repositoryRecordsSchemaParsedRecordCount,
            lowerIsBetter: false,
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
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_file_text_bytes",
            bytes: runtimeChangedFileRefreshPass.repositoryRecordsFileTextByteLength,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.repository.records_serialized_json_bytes",
            bytes: runtimeChangedFileRefreshPass.repositoryRecordsSerializedJsonByteLength,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.memory_delta_rss_bytes",
            bytes: runtimeChangedFileRefreshPass.changedFilesRefreshMemoryDeltaRssBytes,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.memory_delta_heap_used_bytes",
            bytes: runtimeChangedFileRefreshPass.changedFilesRefreshMemoryDeltaHeapUsedBytes,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.memory_delta_external_bytes",
            bytes: runtimeChangedFileRefreshPass.changedFilesRefreshMemoryDeltaExternalBytes,
          }),
          createBytesMetric({
            metricName: "codebase_knowledge_startup_index.changed_file_refresh.memory_delta_array_buffers_bytes",
            bytes: runtimeChangedFileRefreshPass.changedFilesRefreshMemoryDeltaArrayBuffersBytes,
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
  const workspaceCodebaseKnowledgeIndex = createDefaultWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath: input.workspaceRootPath,
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

async function measureRuntimeChangedFileRefreshPass(input: {
  workspaceRootPath: string;
  sourceFilePath: string;
}): Promise<RuntimeChangedFileRefreshPassMeasurement> {
  const diagnosticEvents: BuliDiagnosticLogEvent[] = [];
  const workspaceCodebaseKnowledgeIndex = createDefaultWorkspaceCodebaseKnowledgeIndex({
    workspaceRootPath: input.workspaceRootPath,
    diagnosticLogger: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });

  await workspaceCodebaseKnowledgeIndex.ensureWorkspaceIndexed();
  await writeFile(
    join(input.workspaceRootPath, input.sourceFilePath),
    createSyntheticSourceFileText({ displayPath: input.sourceFilePath, revision: "modified" }),
    "utf8",
  );

  const measuredRefreshPass = await measureDurationMs(() =>
    workspaceCodebaseKnowledgeIndex.refreshChangedFilePaths({ changedFilePaths: [input.sourceFilePath] })
  );
  const changedFilesRefreshFields = readRequiredDiagnosticEvent(
    diagnosticEvents,
    "codebase_knowledge.changed_files_refresh_completed",
  ).fields;
  const changedFileRefreshFields = readRequiredDiagnosticEvent(
    diagnosticEvents,
    "codebase_knowledge.changed_file_refresh_completed",
  ).fields;

  return {
    durationMs: measuredRefreshPass.durationMs,
    changedFilesRefreshDurationMs: readNumberField(changedFilesRefreshFields, "durationMs"),
    requestedChangedFileCount: readNumberField(changedFilesRefreshFields, "requestedChangedFileCount"),
    refreshedFileCount: readNumberField(changedFilesRefreshFields, "refreshedFileCount"),
    replacedFileRecordCount: readNumberField(changedFilesRefreshFields, "replacedFileRecordCount"),
    removedFileRecordCount: readNumberField(changedFilesRefreshFields, "removedFileRecordCount"),
    outputRecordCount: readNumberField(changedFilesRefreshFields, "outputRecordCount"),
    fileReadDurationMs: readNumberField(changedFileRefreshFields, "fileReadDurationMs"),
    fileIndexDurationMs: readNumberField(changedFileRefreshFields, "fileIndexDurationMs"),
    repositoryReplaceDurationMs: readNumberField(changedFileRefreshFields, "repositoryReplaceDurationMs"),
    repositoryRecordsReadDurationMs: sumRepositoryStepDurationMs({ diagnosticEvents, operationName: "load_records", stepName: "read_file" }),
    repositoryRecordsJsonParseDurationMs: sumRepositoryStepDurationMs({ diagnosticEvents, operationName: "load_records", stepName: "json_parse" }),
    repositoryRecordsSchemaParseDurationMs: sumRepositoryStepDurationMs({ diagnosticEvents, operationName: "load_records", stepName: "schema_parse" }),
    repositoryRecordsMapToMemoryDurationMs: sumRepositoryStepDurationMs({
      diagnosticEvents,
      operationName: "load_records",
      stepName: "map_disk_records_to_memory",
    }),
    repositoryRecordsMapToDiskDurationMs: sumRepositoryStepDurationMs({
      diagnosticEvents,
      operationName: "write_records",
      stepName: "map_memory_records_to_disk",
    }),
    repositoryRecordsJsonStringifyDurationMs: sumRepositoryStepDurationMs({
      diagnosticEvents,
      operationName: "write_records",
      stepName: "json_stringify",
    }),
    repositoryRecordsWriteTemporaryFileDurationMs: sumRepositoryStepDurationMs({
      diagnosticEvents,
      operationName: "write_records",
      stepName: "write_temporary_file",
    }),
    repositoryRecordsRenameTemporaryFileDurationMs: sumRepositoryStepDurationMs({
      diagnosticEvents,
      operationName: "write_records",
      stepName: "rename_temporary_file",
    }),
    repositoryRecordsFileTextByteLength: readRepositoryStepNumberField({
      diagnosticEvents,
      operationName: "load_records",
      stepName: "read_file",
      fieldName: "fileTextByteLength",
    }),
    repositoryRecordsSerializedJsonByteLength: readRepositoryStepNumberField({
      diagnosticEvents,
      operationName: "write_records",
      stepName: "json_stringify",
      fieldName: "serializedJsonByteLength",
    }),
    repositoryRecordsSchemaParsedRecordCount: readRepositoryStepNumberField({
      diagnosticEvents,
      operationName: "load_records",
      stepName: "schema_parse",
      fieldName: "recordCount",
    }),
    changedFilesRefreshMemoryDeltaRssBytes: readNumberField(changedFilesRefreshFields, "memoryDeltaRssBytes"),
    changedFilesRefreshMemoryDeltaHeapUsedBytes: readNumberField(changedFilesRefreshFields, "memoryDeltaHeapUsedBytes"),
    changedFilesRefreshMemoryDeltaExternalBytes: readNumberField(changedFilesRefreshFields, "memoryDeltaExternalBytes"),
    changedFilesRefreshMemoryDeltaArrayBuffersBytes: readNumberField(changedFilesRefreshFields, "memoryDeltaArrayBuffersBytes"),
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
  if (config.sourceDirectoryCount < 1 || config.sourceFilesPerDirectory < 3) {
    throw new Error("Codebase knowledge startup index scenario requires at least one directory and three files per directory.");
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

function readRequiredDiagnosticEvent(diagnosticEvents: readonly BuliDiagnosticLogEvent[], eventName: string): BuliDiagnosticLogEvent {
  const diagnosticEvent = diagnosticEvents.find((event) => event.subsystem === "engine" && event.eventName === eventName);
  if (!diagnosticEvent) {
    throw new Error(`Codebase knowledge startup index scenario did not receive diagnostic event ${eventName}.`);
  }
  return diagnosticEvent;
}

function sumRepositoryStepDurationMs(input: {
  diagnosticEvents: readonly BuliDiagnosticLogEvent[];
  operationName: string;
  stepName: string;
}): number {
  return input.diagnosticEvents
    .filter((diagnosticEvent) => isMatchingRepositoryRecordsStepDiagnostic({
      diagnosticEvent,
      operationName: input.operationName,
      stepName: input.stepName,
    }))
    .reduce((totalDurationMs, diagnosticEvent) => totalDurationMs + readNumberField(diagnosticEvent.fields, "durationMs"), 0);
}

function readRepositoryStepNumberField(input: {
  diagnosticEvents: readonly BuliDiagnosticLogEvent[];
  operationName: string;
  stepName: string;
  fieldName: string;
}): number {
  const diagnosticEvent = input.diagnosticEvents.find((candidateEvent) => isMatchingRepositoryRecordsStepDiagnostic({
    diagnosticEvent: candidateEvent,
    operationName: input.operationName,
    stepName: input.stepName,
  }));
  if (!diagnosticEvent) {
    throw new Error(
      `Codebase knowledge startup index scenario did not receive repository diagnostic ${input.operationName}/${input.stepName}.`,
    );
  }
  return readNumberField(diagnosticEvent.fields, input.fieldName);
}

function isMatchingRepositoryRecordsStepDiagnostic(input: {
  diagnosticEvent: BuliDiagnosticLogEvent;
  operationName: string;
  stepName: string;
}): boolean {
  return input.diagnosticEvent.subsystem === "engine" &&
    input.diagnosticEvent.eventName === "codebase_knowledge.repository_step_completed" &&
    input.diagnosticEvent.fields?.["operationName"] === input.operationName &&
    input.diagnosticEvent.fields["stepName"] === input.stepName &&
    input.diagnosticEvent.fields["storedFileRole"] === "records";
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
