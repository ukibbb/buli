import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type WorkspaceShellCommandExecutionResult = {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
};

export class WorkspaceShellCommandExecutor {
  readonly workspaceRootPath: string;
  readonly shellExecutablePath: string;

  constructor(input: { workspaceRootPath: string; shellExecutablePath?: string }) {
    this.workspaceRootPath = resolve(input.workspaceRootPath);
    this.shellExecutablePath = input.shellExecutablePath ?? process.env.SHELL ?? "/bin/zsh";
  }

  async runShellCommand(input: {
    shellCommand: string;
    workingDirectoryPath: string;
    timeoutMilliseconds: number;
    abortSignal?: AbortSignal;
  }): Promise<WorkspaceShellCommandExecutionResult> {
    if (input.abortSignal?.aborted) {
      throw new Error("Command interrupted before it started");
    }

    return new Promise<WorkspaceShellCommandExecutionResult>((resolveExecution, rejectExecution) => {
      const childProcess = spawn(this.shellExecutablePath, ["-lc", input.shellCommand], {
        cwd: input.workingDirectoryPath,
        env: process.env,
        detached: true,
      });

      let stdoutText = "";
      let stderrText = "";
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
        stdoutText += chunk;
      });
      childProcess.stderr.on("data", (chunk: string) => {
        stderrText += chunk;
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
          stdoutText,
          stderrText,
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
