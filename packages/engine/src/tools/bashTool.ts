import {
  MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
  createStartedToolCallDetailFromRequest,
  type BashToolCallRequest,
  type BuliDiagnosticLogger,
  type ToolCallBashDetail,
  type ToolCallBashOutputLine,
} from "@buli/contracts";
import { logEngineDiagnosticEvent } from "../runtimeDiagnostics.ts";
import { WorkspaceShellCommandExecutor } from "./workspaceShellCommandExecutor.ts";
import { resolveExistingWorkspacePath } from "./workspacePath.ts";

const DEFAULT_BASH_TIMEOUT_MILLISECONDS = 120_000;
const DEFAULT_BASH_CAPTURED_OUTPUT_CHARACTER_COUNT = 100_000;

export type CompletedBashToolCallOutcome = {
  outcomeKind: "completed";
  toolCallDetail: ToolCallBashDetail;
  toolResultText: string;
  durationMilliseconds: number;
};

export type FailedBashToolCallOutcome = {
  outcomeKind: "failed";
  toolCallDetail: ToolCallBashDetail;
  toolResultText: string;
  failureExplanation: string;
  durationMilliseconds: number;
};

export type BashToolCallOutcome = CompletedBashToolCallOutcome | FailedBashToolCallOutcome;

export function createStartedBashToolCallDetail(bashToolCallRequest: BashToolCallRequest): ToolCallBashDetail {
  return createStartedToolCallDetailFromRequest(bashToolCallRequest);
}

export async function runApprovedBashToolCall(input: {
  bashToolCallRequest: BashToolCallRequest;
  workspaceRootPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  abortSignal?: AbortSignal;
}): Promise<BashToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const timeoutMilliseconds = normalizeBashToolTimeoutMilliseconds(input.bashToolCallRequest.timeoutMilliseconds);
  const startedToolCallDetail = createStartedBashToolCallDetail({
    ...input.bashToolCallRequest,
    timeoutMilliseconds,
  });

  try {
    const workingDirectoryPath = await resolveBashWorkingDirectoryPath({
      workspaceRootPath: input.workspaceRootPath,
      requestedWorkingDirectoryPath: input.bashToolCallRequest.workingDirectoryPath,
    });
    const resolvedStartedToolCallDetail = createStartedBashToolCallDetail({
      ...input.bashToolCallRequest,
      workingDirectoryPath,
      timeoutMilliseconds,
    });
    logEngineDiagnosticEvent(input.diagnosticLogger, "bash_tool.execution_started", {
      shellCommandLength: input.bashToolCallRequest.shellCommand.length,
      commandDescriptionLength: input.bashToolCallRequest.commandDescription.length,
      workingDirectoryPath,
      timeoutMilliseconds,
    });
    const workspaceShellCommandExecutionResult = await input.workspaceShellCommandExecutor.runShellCommand({
      shellCommand: input.bashToolCallRequest.shellCommand,
      workingDirectoryPath,
      timeoutMilliseconds,
      maximumCapturedOutputCharacters: DEFAULT_BASH_CAPTURED_OUTPUT_CHARACTER_COUNT,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const outputLines = buildBashOutputLines({
      shellCommand: input.bashToolCallRequest.shellCommand,
      stdoutText: workspaceShellCommandExecutionResult.stdoutText,
      stderrText: workspaceShellCommandExecutionResult.stderrText,
      stdoutWasTruncated: workspaceShellCommandExecutionResult.stdoutWasTruncated,
      stderrWasTruncated: workspaceShellCommandExecutionResult.stderrWasTruncated,
      stdoutOmittedCharacterCount: workspaceShellCommandExecutionResult.stdoutOmittedCharacterCount,
      stderrOmittedCharacterCount: workspaceShellCommandExecutionResult.stderrOmittedCharacterCount,
    });
    const toolCallDetail: ToolCallBashDetail = {
      ...resolvedStartedToolCallDetail,
      exitCode: workspaceShellCommandExecutionResult.exitCode,
      outputLines,
    };
    const durationMilliseconds = Date.now() - startedAtMilliseconds;
    logEngineDiagnosticEvent(input.diagnosticLogger, "bash_tool.execution_completed", {
      workingDirectoryPath,
      timeoutMilliseconds,
      durationMilliseconds,
      exitCode: workspaceShellCommandExecutionResult.exitCode,
      stdoutLength: workspaceShellCommandExecutionResult.stdoutText.length,
      stderrLength: workspaceShellCommandExecutionResult.stderrText.length,
      renderedOutputLineCount: outputLines.length,
      stdoutWasTruncated: workspaceShellCommandExecutionResult.stdoutWasTruncated ?? false,
      stderrWasTruncated: workspaceShellCommandExecutionResult.stderrWasTruncated ?? false,
    });
    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildModelVisibleBashToolResultText({
        workingDirectoryPath,
        shellCommand: input.bashToolCallRequest.shellCommand,
        exitCode: workspaceShellCommandExecutionResult.exitCode,
        stdoutText: workspaceShellCommandExecutionResult.stdoutText,
        stderrText: workspaceShellCommandExecutionResult.stderrText,
        stdoutWasTruncated: workspaceShellCommandExecutionResult.stdoutWasTruncated,
        stderrWasTruncated: workspaceShellCommandExecutionResult.stderrWasTruncated,
        stdoutOmittedCharacterCount: workspaceShellCommandExecutionResult.stdoutOmittedCharacterCount,
        stderrOmittedCharacterCount: workspaceShellCommandExecutionResult.stderrOmittedCharacterCount,
      }),
      durationMilliseconds,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    const durationMilliseconds = Date.now() - startedAtMilliseconds;
    logEngineDiagnosticEvent(input.diagnosticLogger, "bash_tool.execution_failed", {
      requestedWorkingDirectoryPath: input.bashToolCallRequest.workingDirectoryPath ?? null,
      timeoutMilliseconds,
      durationMilliseconds,
      failureExplanation,
    });
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      failureExplanation,
      toolResultText: `Command execution failed before completion: ${failureExplanation}`,
      durationMilliseconds,
    };
  }
}

function normalizeBashToolTimeoutMilliseconds(requestedTimeoutMilliseconds: number | undefined): number {
  return Math.max(
    1,
    Math.min(
      requestedTimeoutMilliseconds ?? DEFAULT_BASH_TIMEOUT_MILLISECONDS,
      MAX_BASH_TOOL_TIMEOUT_MILLISECONDS,
    ),
  );
}

async function resolveBashWorkingDirectoryPath(input: {
  workspaceRootPath: string;
  requestedWorkingDirectoryPath: string | undefined;
}): Promise<string> {
  const resolvedWorkingDirectory = await resolveExistingWorkspacePath({
    workspaceRootPath: input.workspaceRootPath,
    requestedPath: input.requestedWorkingDirectoryPath ?? ".",
  });
  if (!resolvedWorkingDirectory.stats.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${resolvedWorkingDirectory.displayPath}`);
  }

  return resolvedWorkingDirectory.absolutePath;
}

function buildBashOutputLines(input: {
  shellCommand: string;
  stdoutText: string;
  stderrText: string;
  stdoutWasTruncated?: boolean | undefined;
  stderrWasTruncated?: boolean | undefined;
  stdoutOmittedCharacterCount?: number | undefined;
  stderrOmittedCharacterCount?: number | undefined;
}): ToolCallBashOutputLine[] {
  const outputLines: ToolCallBashOutputLine[] = [{ lineKind: "prompt", lineText: `$ ${input.shellCommand}` }];

  for (const stdoutLine of splitIntoDisplayLines(input.stdoutText)) {
    outputLines.push({ lineKind: "stdout", lineText: stdoutLine });
  }
  for (const stderrLine of splitIntoDisplayLines(input.stderrText)) {
    outputLines.push({ lineKind: "stderr", lineText: stderrLine });
  }
  if (input.stdoutWasTruncated) {
    outputLines.push({
      lineKind: "stderr",
      lineText: `stdout truncated; omitted ${input.stdoutOmittedCharacterCount ?? 0} characters`,
    });
  }
  if (input.stderrWasTruncated) {
    outputLines.push({
      lineKind: "stderr",
      lineText: `stderr truncated; omitted ${input.stderrOmittedCharacterCount ?? 0} characters`,
    });
  }

  return outputLines;
}

function buildModelVisibleBashToolResultText(input: {
  workingDirectoryPath: string;
  shellCommand: string;
  exitCode: number;
  stdoutText: string;
  stderrText: string;
  stdoutWasTruncated?: boolean | undefined;
  stderrWasTruncated?: boolean | undefined;
  stdoutOmittedCharacterCount?: number | undefined;
  stderrOmittedCharacterCount?: number | undefined;
}): string {
  const stdoutTruncationText = input.stdoutWasTruncated
    ? `\n[stdout truncated; omitted ${input.stdoutOmittedCharacterCount ?? 0} characters]`
    : "";
  const stderrTruncationText = input.stderrWasTruncated
    ? `\n[stderr truncated; omitted ${input.stderrOmittedCharacterCount ?? 0} characters]`
    : "";
  return [
    `Command: ${input.shellCommand}`,
    `Working directory: ${input.workingDirectoryPath}`,
    `Exit code: ${input.exitCode}`,
    "Stdout:",
    `${input.stdoutText || "<empty>"}${stdoutTruncationText}`,
    "Stderr:",
    `${input.stderrText || "<empty>"}${stderrTruncationText}`,
  ].join("\n");
}

function splitIntoDisplayLines(outputText: string): string[] {
  const normalizedOutputText = outputText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const splitLines = normalizedOutputText.split("\n");
  if (splitLines.at(-1) === "") {
    splitLines.pop();
  }
  return splitLines;
}
