import {
  type BuliDiagnosticLogFields,
  createStartedToolCallDetailFromRequest,
  type ReadManyToolCallRequest,
  type ReadManyToolCallTarget,
  type ReadToolCallRequest,
  type ToolCallReadDetail,
  type ToolCallReadManyDetail,
  type ToolCallReadManyResult,
} from "@buli/contracts";
import type { ProjectInstructionTracker } from "../projectInstructions.ts";
import { runReadToolCall } from "./readTool.ts";
import type { ToolCallOutcome } from "./toolCallOutcome.ts";

export interface ReadManyToolCallConcurrencyLimiter {
  run<ReadManyChildResult>(
    operation: () => Promise<ReadManyChildResult>,
    diagnosticFields?: BuliDiagnosticLogFields,
  ): Promise<ReadManyChildResult>;
}

type ReadManyChildToolCallOutcome = {
  readTargetIndex: number;
  readToolCallOutcome: ToolCallOutcome;
};

export function createStartedReadManyToolCallDetail(
  readManyToolCallRequest: ReadManyToolCallRequest,
): ToolCallReadManyDetail {
  return createStartedToolCallDetailFromRequest(readManyToolCallRequest);
}

export async function runReadManyToolCall(input: {
  readManyToolCallRequest: ReadManyToolCallRequest;
  parentToolCallId?: string;
  workspaceRootPath: string;
  readOnlyToolCallConcurrencyLimiter: ReadManyToolCallConcurrencyLimiter;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal?: AbortSignal;
}): Promise<ToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const startedToolCallDetail = createStartedReadManyToolCallDetail(input.readManyToolCallRequest);

  try {
    const childToolCallOutcomes = await Promise.all(
      input.readManyToolCallRequest.readTargets.map((readTarget, readTargetIndex) =>
        input.readOnlyToolCallConcurrencyLimiter.run(
          () =>
            runReadManyChildToolCall({
              readTarget,
              readTargetIndex,
              workspaceRootPath: input.workspaceRootPath,
              ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
              ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
            }),
          {
            ...(input.parentToolCallId !== undefined ? { parentToolCallId: input.parentToolCallId } : {}),
            parentToolName: "read_many",
            toolName: "read",
            childIndex: readTargetIndex,
          },
        )
      ),
    );
    const readResults = childToolCallOutcomes.map(createReadManyResultFromChildOutcome);
    const completedReadCount = readResults.filter((readResult) => readResult.readStatus === "completed").length;
    const failedReadCount = readResults.length - completedReadCount;
    const toolCallDetail: ToolCallReadManyDetail = {
      toolName: "read_many",
      requestedReadTargetPaths: input.readManyToolCallRequest.readTargets.map((readTarget) => readTarget.readTargetPath),
      completedReadCount,
      failedReadCount,
      readResults,
    };

    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildReadManyToolResultText({
        childToolCallOutcomes,
        completedReadCount,
        failedReadCount,
      }),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      failureExplanation,
      toolResultText: `Read many failed: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

async function runReadManyChildToolCall(input: {
  readTarget: ReadManyToolCallTarget;
  readTargetIndex: number;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal?: AbortSignal;
}): Promise<ReadManyChildToolCallOutcome> {
  return {
    readTargetIndex: input.readTargetIndex,
    readToolCallOutcome: await runReadToolCall({
      readToolCallRequest: createReadToolCallRequestFromReadManyTarget(input.readTarget),
      workspaceRootPath: input.workspaceRootPath,
      ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    }),
  };
}

function createReadToolCallRequestFromReadManyTarget(readTarget: ReadManyToolCallTarget): ReadToolCallRequest {
  return {
    toolName: "read",
    readTargetPath: readTarget.readTargetPath,
    ...(readTarget.offsetLineNumber !== undefined ? { offsetLineNumber: readTarget.offsetLineNumber } : {}),
    ...(readTarget.maximumLineCount !== undefined ? { maximumLineCount: readTarget.maximumLineCount } : {}),
  };
}

function createReadManyResultFromChildOutcome(
  childToolCallOutcome: ReadManyChildToolCallOutcome,
): ToolCallReadManyResult {
  const readDetail = assertReadToolCallDetail(childToolCallOutcome.readToolCallOutcome.toolCallDetail);
  if (childToolCallOutcome.readToolCallOutcome.outcomeKind === "completed") {
    return {
      readStatus: "completed",
      readDetail,
    };
  }

  return {
    readStatus: "failed",
    readDetail,
    failureExplanation: childToolCallOutcome.readToolCallOutcome.failureExplanation,
  };
}

function assertReadToolCallDetail(toolCallDetail: ToolCallOutcome["toolCallDetail"]): ToolCallReadDetail {
  if (toolCallDetail.toolName === "read") {
    return toolCallDetail;
  }

  throw new Error(`Read many child returned unexpected tool detail: ${toolCallDetail.toolName}`);
}

function buildReadManyToolResultText(input: {
  childToolCallOutcomes: readonly ReadManyChildToolCallOutcome[];
  completedReadCount: number;
  failedReadCount: number;
}): string {
  return [
    "<read_many>",
    `<summary>${input.completedReadCount} completed, ${input.failedReadCount} failed</summary>`,
    ...input.childToolCallOutcomes.map(formatReadManyChildToolResultText),
    "</read_many>",
  ].join("\n");
}

function formatReadManyChildToolResultText(childToolCallOutcome: ReadManyChildToolCallOutcome): string {
  const readDetail = assertReadToolCallDetail(childToolCallOutcome.readToolCallOutcome.toolCallDetail);
  return [
    "<read_many_result>",
    `<index>${childToolCallOutcome.readTargetIndex + 1}</index>`,
    `<status>${childToolCallOutcome.readToolCallOutcome.outcomeKind}</status>`,
    `<path>${readDetail.readFilePath}</path>`,
    childToolCallOutcome.readToolCallOutcome.toolResultText,
    "</read_many_result>",
  ].join("\n");
}
