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
  }): Promise<WorkspaceShellCommandExecutionResult> {
    return new Promise<WorkspaceShellCommandExecutionResult>((resolveExecution, rejectExecution) => {
      const childProcess = spawn(this.shellExecutablePath, ["-lc", input.shellCommand], {
        cwd: input.workingDirectoryPath,
        env: process.env,
      });

      let stdoutText = "";
      let stderrText = "";
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      childProcess.stdout.setEncoding("utf8");
      childProcess.stderr.setEncoding("utf8");
      childProcess.stdout.on("data", (chunk: string) => {
        stdoutText += chunk;
      });
      childProcess.stderr.on("data", (chunk: string) => {
        stderrText += chunk;
      });

      childProcess.on("error", (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        rejectExecution(error);
      });

      childProcess.on("close", (exitCode) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolveExecution({
          exitCode: exitCode ?? 1,
          stdoutText,
          stderrText,
        });
      });

      timeoutHandle = setTimeout(() => {
        childProcess.kill("SIGTERM");
        rejectExecution(new Error(`Command timed out after ${input.timeoutMilliseconds}ms`));
      }, input.timeoutMilliseconds);
    });
  }
}
