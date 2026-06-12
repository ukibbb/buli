import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createBytesMetric, createCountMetric, type PerformanceMetric } from "../model/performanceScenario.ts";
import { summarizeEvalRequestByteTotals } from "./evalRequestInspection.ts";
import type { ScriptedOpenAiEvalRequestRecord } from "./scriptedOpenAiEvalRuntime.ts";

export type EvalIterationPaths = Readonly<{
  workspaceRootPath: string;
  evalStateDirectoryPath: string;
}>;

export async function createEvalIterationPaths(input: {
  evalName: string;
  runOutputDirectoryPath: string;
  iterationIndex: number;
  isWarmup: boolean;
}): Promise<EvalIterationPaths> {
  const iterationDirectoryPath = resolve(
    input.runOutputDirectoryPath,
    input.evalName,
    `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
  );
  const workspaceRootPath = resolve(iterationDirectoryPath, "workspace");
  const evalStateDirectoryPath = resolve(iterationDirectoryPath, "state");
  await mkdir(workspaceRootPath, { recursive: true });
  await mkdir(evalStateDirectoryPath, { recursive: true });
  return { workspaceRootPath, evalStateDirectoryPath };
}

export function createEvalSecretToken(tokenPrefix: string): string {
  return `${tokenPrefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** Filler that pushes a tool result above the duplicate-reference minimum so compaction policies apply to it. */
export function createEvalLargeFillerText(lineCount: number): string {
  const fillerLines: string[] = [];
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    fillerLines.push(`filler line ${lineIndex} keeps this evidence above the duplicate reference minimum character count.`);
  }
  return fillerLines.join("\n");
}

export function createEvalOutcomeMetrics(input: {
  evalName: string;
  taskCompletionFailureCount: number;
  recoveryToolCallCount: number;
  requestRecords: readonly ScriptedOpenAiEvalRequestRecord[];
}): PerformanceMetric[] {
  const requestByteTotals = summarizeEvalRequestByteTotals(input.requestRecords);
  return [
    createCountMetric({
      metricName: `eval.${input.evalName}.task_completion_failure_count`,
      count: input.taskCompletionFailureCount,
      budget: { failAbove: 0 },
    }),
    createCountMetric({
      metricName: `eval.${input.evalName}.recovery_tool_call_count`,
      count: input.recoveryToolCallCount,
      budget: { warnAbove: 0, failAbove: 4 },
    }),
    createCountMetric({
      metricName: `eval.${input.evalName}.response_request_count`,
      count: input.requestRecords.length,
      lowerIsBetter: true,
    }),
    createBytesMetric({
      metricName: `eval.${input.evalName}.max_request_body_bytes`,
      bytes: requestByteTotals.maxRequestBodyTextLength,
    }),
    createBytesMetric({
      metricName: `eval.${input.evalName}.total_request_body_bytes`,
      bytes: requestByteTotals.totalRequestBodyTextLength,
    }),
    createBytesMetric({
      metricName: `eval.${input.evalName}.total_function_output_bytes_sent`,
      bytes: requestByteTotals.totalFunctionCallOutputTextLength,
    }),
  ];
}

export function readEvalSecretTokenFromVisibleText(visibleText: string | undefined, tokenPrefix: string): string | undefined {
  if (visibleText === undefined) {
    return undefined;
  }
  const tokenMatch = visibleText.match(new RegExp(`${tokenPrefix}_[a-f0-9]{12}`));
  return tokenMatch?.[0];
}

export function buildReadToolArgumentsJsonText(input: { filePath: string; inspectionQuestion: string }): string {
  return JSON.stringify({
    filePath: input.filePath,
    offset: null,
    limit: null,
    inspectionQuestion: input.inspectionQuestion,
  });
}

export function buildEditToolArgumentsJsonText(input: { filePath: string; oldString: string; newString: string }): string {
  return JSON.stringify({
    filePath: input.filePath,
    oldString: input.oldString,
    newString: input.newString,
  });
}
