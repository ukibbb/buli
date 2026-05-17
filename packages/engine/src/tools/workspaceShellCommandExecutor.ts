import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type WorkspaceShellCommandExecutionResult = {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
  stdoutWasTruncated?: boolean;
  stderrWasTruncated?: boolean;
  stdoutOmittedCharacterCount?: number;
  stderrOmittedCharacterCount?: number;
};

const DEFAULT_MAXIMUM_CAPTURED_OUTPUT_CHARACTERS = 100_000;
const SHELL_COMMAND_ENVIRONMENT_ALLOWLIST = new Set([
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
]);
const shellCommandEnvironmentByExecutor = new WeakMap<WorkspaceShellCommandExecutor, NodeJS.ProcessEnv>();

export class WorkspaceShellCommandExecutor {
  readonly workspaceRootPath: string;
  readonly shellExecutablePath: string;

  constructor(input: { workspaceRootPath: string; shellExecutablePath?: string; environment?: NodeJS.ProcessEnv }) {
    this.workspaceRootPath = resolve(input.workspaceRootPath);
    this.shellExecutablePath = input.shellExecutablePath ?? process.env["SHELL"] ?? "/bin/zsh";
    shellCommandEnvironmentByExecutor.set(this, createScrubbedShellCommandEnvironment(input.environment ?? process.env));
  }

  async runShellCommand(input: {
    shellCommand: string;
    workingDirectoryPath: string;
    timeoutMilliseconds: number;
    maximumCapturedOutputCharacters?: number;
    abortSignal?: AbortSignal;
  }): Promise<WorkspaceShellCommandExecutionResult> {
    if (input.abortSignal?.aborted) {
      throw new Error("Command interrupted before it started");
    }

    return new Promise<WorkspaceShellCommandExecutionResult>((resolveExecution, rejectExecution) => {
      const childProcess = spawn(this.shellExecutablePath, ["-lc", input.shellCommand], {
        cwd: input.workingDirectoryPath,
        env: shellCommandEnvironmentByExecutor.get(this) ?? createScrubbedShellCommandEnvironment(process.env),
        detached: true,
      });

      const maximumCapturedOutputCharacters = Math.max(
        0,
        input.maximumCapturedOutputCharacters ?? DEFAULT_MAXIMUM_CAPTURED_OUTPUT_CHARACTERS,
      );
      let stdoutCapture = createBoundedShellOutputCapture(maximumCapturedOutputCharacters);
      let stderrCapture = createBoundedShellOutputCapture(maximumCapturedOutputCharacters);
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let forceKillHandle: ReturnType<typeof setTimeout> | undefined;
      let hasSettled = false;
      let hasRequestedProcessGroupTermination = false;
      let terminalFailure: Error | undefined;

      const clearTimeoutHandle = (): void => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
      };

      const settleExecution = (settle: () => void): void => {
        if (hasSettled) {
          return;
        }

        hasSettled = true;
        clearTimeoutHandle();
        if (forceKillHandle) {
          clearTimeout(forceKillHandle);
          forceKillHandle = undefined;
        }
        input.abortSignal?.removeEventListener("abort", interruptShellCommand);
        settle();
      };

      const killShellProcessGroup = (signal: NodeJS.Signals): void => {
        if (!childProcess.pid) {
          return;
        }

        try {
          process.kill(-childProcess.pid, signal);
        } catch {
          childProcess.kill(signal);
        }
      };

      function interruptShellCommand(): void {
        requestShellProcessGroupTermination(new Error("Command interrupted by user"));
      }

      function requestShellProcessGroupTermination(failure: Error): void {
        if (hasSettled) {
          return;
        }

        terminalFailure ??= failure;
        clearTimeoutHandle();
        input.abortSignal?.removeEventListener("abort", interruptShellCommand);

        if (hasRequestedProcessGroupTermination) {
          return;
        }

        hasRequestedProcessGroupTermination = true;
        killShellProcessGroup("SIGTERM");
        forceKillHandle = setTimeout(() => {
          forceKillHandle = undefined;
          killShellProcessGroup("SIGKILL");
        }, 5_000);
      }

      childProcess.stdout.setEncoding("utf8");
      childProcess.stderr.setEncoding("utf8");
      childProcess.stdout.on("data", (chunk: string) => {
        stdoutCapture = appendShellOutputChunk(stdoutCapture, chunk);
      });
      childProcess.stderr.on("data", (chunk: string) => {
        stderrCapture = appendShellOutputChunk(stderrCapture, chunk);
      });

      childProcess.on("error", (error) => {
        settleExecution(() => rejectExecution(error));
      });

      childProcess.on("close", (exitCode) => {
        if (terminalFailure) {
          settleExecution(() => rejectExecution(terminalFailure));
          return;
        }

        settleExecution(() => resolveExecution({
          exitCode: exitCode ?? 1,
          stdoutText: stdoutCapture.capturedText,
          stderrText: stderrCapture.capturedText,
          ...(stdoutCapture.wasTruncated ? { stdoutWasTruncated: true } : {}),
          ...(stderrCapture.wasTruncated ? { stderrWasTruncated: true } : {}),
          ...(stdoutCapture.omittedCharacterCount > 0
            ? { stdoutOmittedCharacterCount: stdoutCapture.omittedCharacterCount }
            : {}),
          ...(stderrCapture.omittedCharacterCount > 0
            ? { stderrOmittedCharacterCount: stderrCapture.omittedCharacterCount }
            : {}),
        }));
      });

      timeoutHandle = setTimeout(() => {
        requestShellProcessGroupTermination(new Error(`Command timed out after ${input.timeoutMilliseconds}ms`));
      }, input.timeoutMilliseconds);

      input.abortSignal?.addEventListener("abort", interruptShellCommand, { once: true });
      if (input.abortSignal?.aborted) {
        interruptShellCommand();
      }
    });
  }
}

export function createScrubbedShellCommandEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const shellCommandEnvironment: NodeJS.ProcessEnv = {};
  for (const environmentVariableName of SHELL_COMMAND_ENVIRONMENT_ALLOWLIST) {
    const environmentVariableValue = environment[environmentVariableName];
    if (environmentVariableValue !== undefined) {
      shellCommandEnvironment[environmentVariableName] = environmentVariableValue;
    }
  }

  return shellCommandEnvironment;
}

type BoundedShellOutputCapture = {
  capturedText: string;
  capturedCharacterCount: number;
  omittedCharacterCount: number;
  maximumCharacterCount: number;
  wasTruncated: boolean;
};

function createBoundedShellOutputCapture(maximumCharacterCount: number): BoundedShellOutputCapture {
  return {
    capturedText: "",
    capturedCharacterCount: 0,
    omittedCharacterCount: 0,
    maximumCharacterCount,
    wasTruncated: false,
  };
}

function appendShellOutputChunk(
  shellOutputCapture: BoundedShellOutputCapture,
  chunk: string,
): BoundedShellOutputCapture {
  const remainingCharacterCount = shellOutputCapture.maximumCharacterCount - shellOutputCapture.capturedCharacterCount;
  if (remainingCharacterCount <= 0) {
    return {
      ...shellOutputCapture,
      omittedCharacterCount: shellOutputCapture.omittedCharacterCount + chunk.length,
      wasTruncated: true,
    };
  }

  if (chunk.length <= remainingCharacterCount) {
    return {
      ...shellOutputCapture,
      capturedText: `${shellOutputCapture.capturedText}${chunk}`,
      capturedCharacterCount: shellOutputCapture.capturedCharacterCount + chunk.length,
    };
  }

  return {
    ...shellOutputCapture,
    capturedText: `${shellOutputCapture.capturedText}${chunk.slice(0, remainingCharacterCount)}`,
    capturedCharacterCount: shellOutputCapture.maximumCharacterCount,
    omittedCharacterCount: shellOutputCapture.omittedCharacterCount + chunk.length - remainingCharacterCount,
    wasTruncated: true,
  };
}
