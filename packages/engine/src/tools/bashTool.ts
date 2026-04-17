import { resolve, sep } from "node:path";
import type {
  BashToolCallRequest,
  ToolCallBashDetail,
  ToolCallBashOutputLine,
} from "@buli/contracts";
import { WorkspaceShellCommandExecutor } from "./workspaceShellCommandExecutor.ts";

const DEFAULT_BASH_TIMEOUT_MILLISECONDS = 120_000;
const MAX_MODEL_VISIBLE_OUTPUT_CHARACTERS = 12_000;
const MAX_RENDERED_OUTPUT_LINES = 120;

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
  return {
    toolName: "bash",
    commandLine: bashToolCallRequest.shellCommand,
    commandDescription: bashToolCallRequest.commandDescription,
    workingDirectoryPath: bashToolCallRequest.workingDirectoryPath,
    timeoutMilliseconds: bashToolCallRequest.timeoutMilliseconds,
  };
}

export async function runApprovedBashToolCall(input: {
  bashToolCallRequest: BashToolCallRequest;
  workspaceRootPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
}): Promise<BashToolCallOutcome> {
  const startedAtMilliseconds = Date.now();
  const workingDirectoryPath = resolveBashWorkingDirectoryPath({
    workspaceRootPath: input.workspaceRootPath,
    requestedWorkingDirectoryPath: input.bashToolCallRequest.workingDirectoryPath,
  });
  const timeoutMilliseconds = input.bashToolCallRequest.timeoutMilliseconds ?? DEFAULT_BASH_TIMEOUT_MILLISECONDS;
  const startedToolCallDetail = createStartedBashToolCallDetail({
    ...input.bashToolCallRequest,
    workingDirectoryPath,
    timeoutMilliseconds,
  });

  try {
    const workspaceShellCommandExecutionResult = await input.workspaceShellCommandExecutor.runShellCommand({
      shellCommand: input.bashToolCallRequest.shellCommand,
      workingDirectoryPath,
      timeoutMilliseconds,
    });
    const outputLines = buildBashOutputLines({
      shellCommand: input.bashToolCallRequest.shellCommand,
      stdoutText: workspaceShellCommandExecutionResult.stdoutText,
      stderrText: workspaceShellCommandExecutionResult.stderrText,
    });
    const toolCallDetail: ToolCallBashDetail = {
      ...startedToolCallDetail,
      exitCode: workspaceShellCommandExecutionResult.exitCode,
      outputLines,
    };
    return {
      outcomeKind: "completed",
      toolCallDetail,
      toolResultText: buildModelVisibleBashToolResultText({
        workingDirectoryPath,
        shellCommand: input.bashToolCallRequest.shellCommand,
        exitCode: workspaceShellCommandExecutionResult.exitCode,
        stdoutText: workspaceShellCommandExecutionResult.stdoutText,
        stderrText: workspaceShellCommandExecutionResult.stderrText,
      }),
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  } catch (error) {
    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      outcomeKind: "failed",
      toolCallDetail: startedToolCallDetail,
      failureExplanation,
      toolResultText: `Command execution failed before completion: ${failureExplanation}`,
      durationMilliseconds: Date.now() - startedAtMilliseconds,
    };
  }
}

function resolveBashWorkingDirectoryPath(input: {
  workspaceRootPath: string;
  requestedWorkingDirectoryPath: string | undefined;
}): string {
  const workspaceRootPath = resolve(input.workspaceRootPath);
  const resolvedWorkingDirectoryPath = input.requestedWorkingDirectoryPath
    ? resolve(workspaceRootPath, input.requestedWorkingDirectoryPath)
    : workspaceRootPath;

  if (
    resolvedWorkingDirectoryPath !== workspaceRootPath &&
    !resolvedWorkingDirectoryPath.startsWith(`${workspaceRootPath}${sep}`)
  ) {
    throw new Error(`Working directory must stay inside the workspace root: ${workspaceRootPath}`);
  }

  return resolvedWorkingDirectoryPath;
}

function buildBashOutputLines(input: {
  shellCommand: string;
  stdoutText: string;
  stderrText: string;
}): ToolCallBashOutputLine[] {
  const outputLines: ToolCallBashOutputLine[] = [{ lineKind: "prompt", lineText: `$ ${input.shellCommand}` }];

  for (const stdoutLine of splitIntoDisplayLines(input.stdoutText)) {
    outputLines.push({ lineKind: "stdout", lineText: stdoutLine });
  }
  for (const stderrLine of splitIntoDisplayLines(input.stderrText)) {
    outputLines.push({ lineKind: "stderr", lineText: stderrLine });
  }

  if (outputLines.length <= MAX_RENDERED_OUTPUT_LINES) {
    return outputLines;
  }

  return [
    ...outputLines.slice(0, MAX_RENDERED_OUTPUT_LINES),
    {
      lineKind: "stderr",
      lineText: `… output truncated after ${MAX_RENDERED_OUTPUT_LINES} lines`,
    },
  ];
}

function buildModelVisibleBashToolResultText(input: {
  workingDirectoryPath: string;
  shellCommand: string;
  exitCode: number;
  stdoutText: string;
  stderrText: string;
}): string {
  const rawResultText = [
    `Command: ${input.shellCommand}`,
    `Working directory: ${input.workingDirectoryPath}`,
    `Exit code: ${input.exitCode}`,
    "Stdout:",
    input.stdoutText || "<empty>",
    "Stderr:",
    input.stderrText || "<empty>",
  ].join("\n");

  if (rawResultText.length <= MAX_MODEL_VISIBLE_OUTPUT_CHARACTERS) {
    return rawResultText;
  }

  return `${rawResultText.slice(0, MAX_MODEL_VISIBLE_OUTPUT_CHARACTERS)}\n\n[Output truncated]`;
}

function splitIntoDisplayLines(outputText: string): string[] {
  const normalizedOutputText = outputText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const splitLines = normalizedOutputText.split("\n");
  if (splitLines.at(-1) === "") {
    splitLines.pop();
  }
  return splitLines;
}
