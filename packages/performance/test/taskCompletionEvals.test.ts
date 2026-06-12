import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listBuliTaskCompletionEvalNames, resolveBuliTaskCompletionEval } from "../src/evals/evalRegistry.ts";

test("task-completion eval registry exposes the five design-doc eval categories", () => {
  expect(listBuliTaskCompletionEvalNames()).toEqual([
    "eval-file-exploration",
    "eval-multi-file-edit",
    "eval-debugging",
    "eval-long-tool-chain",
    "eval-subagent-delegation",
  ]);
});

test("file-exploration eval completes against the scripted OpenAI provider", async () => {
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-eval-test-"));
  try {
    const iterationResult = await resolveBuliTaskCompletionEval("eval-file-exploration").runIteration({
      iterationIndex: 0,
      isWarmup: false,
      runOutputDirectoryPath,
    });
    const failureMetric = iterationResult.metrics.find(
      (metric) => metric.metricName === "eval.file-exploration.task_completion_failure_count",
    );
    expect(failureMetric?.value).toBe(0);
  } finally {
    await rm(runOutputDirectoryPath, { recursive: true, force: true });
  }
});

test("multi-file-edit eval completes edits through the real engine tools", async () => {
  const runOutputDirectoryPath = await mkdtemp(join(tmpdir(), "buli-eval-test-"));
  try {
    const iterationResult = await resolveBuliTaskCompletionEval("eval-multi-file-edit").runIteration({
      iterationIndex: 0,
      isWarmup: false,
      runOutputDirectoryPath,
    });
    const failureMetric = iterationResult.metrics.find(
      (metric) => metric.metricName === "eval.multi-file-edit.task_completion_failure_count",
    );
    expect(failureMetric?.value).toBe(0);
  } finally {
    await rm(runOutputDirectoryPath, { recursive: true, force: true });
  }
});
