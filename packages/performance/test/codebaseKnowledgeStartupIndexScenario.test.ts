import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PerformanceScenarioIterationResult } from "../src/model/performanceScenario.ts";
import { createCodebaseKnowledgeStartupIndexScenario } from "../src/scenarios/codebaseKnowledgeStartupIndexScenario.ts";

test("codebase knowledge startup index scenario measures incremental parsing behavior", async () => {
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-codebase-knowledge-startup-profile-"));
  const scenario = createCodebaseKnowledgeStartupIndexScenario({
    sourceDirectoryCount: 2,
    sourceFilesPerDirectory: 3,
  });

  const iterationResult = await scenario.runIteration({
    iterationIndex: 0,
    isWarmup: false,
    runOutputDirectoryPath,
  });

  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.full.parsed_file_count")).toBe(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.full.records_loaded_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.full.snapshot_read.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.full.workspace_scan.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.full.scanned_file_count")).toBeGreaterThanOrEqual(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.full.indexable_file_count")).toBe(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.snapshot_read.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.records_load.duration_ms")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.records_loaded_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.workspace_scan.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.reused_from_stats_file_count")).toBe(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.parsed_file_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.snapshot_write.duration_ms")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.unchanged_restart.snapshot_write_skipped_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.requested_changed_file_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.refreshed_file_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.replaced_file_record_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.removed_file_record_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.output_record_count")).toBeGreaterThan(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.engine_refresh.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.file_read.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.file_index.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.repository.records_read.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.repository.records_json_parse.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.repository.records_json_stringify.duration_ms")).toBeGreaterThanOrEqual(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.repository.records_schema_parse.record_count")).toBeGreaterThan(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.repository.records_file_text_bytes")).toBeGreaterThan(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.repository.records_serialized_json_bytes")).toBeGreaterThan(0);
  expect(Number.isFinite(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.memory_delta_rss_bytes"))).toBe(true);
  expect(Number.isFinite(readMetricValue(iterationResult, "codebase_knowledge_startup_index.changed_file_refresh.memory_delta_heap_used_bytes"))).toBe(true);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.modified_file_restart.parsed_file_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.modified_file_restart.records_loaded_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.modified_file_restart.snapshot_write_skipped_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.mtime_only_restart.hashed_file_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.mtime_only_restart.reused_after_hash_file_count")).toBe(1);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.mtime_only_restart.records_load.duration_ms")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.mtime_only_restart.records_loaded_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.mtime_only_restart.parsed_file_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.mtime_only_restart.snapshot_write_skipped_count")).toBe(0);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.indexed_file_count")).toBe(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.knowledge_record_count")).toBeGreaterThan(6);
  expect(readMetricValue(iterationResult, "codebase_knowledge_startup_index.index_file_size_bytes")).toBeGreaterThan(0);
});

function readMetricValue(iterationResult: PerformanceScenarioIterationResult, metricName: string): number {
  const metric = iterationResult.metrics.find((candidateMetric) => candidateMetric.metricName === metricName);
  if (!metric) {
    throw new Error(`Missing performance metric ${metricName}.`);
  }
  return metric.value;
}
