import {
  encodeProviderProtocolFrameAsJsonLine,
  streamProviderProtocolProviderFramesFromJsonLines,
  type ProviderProtocolHostFrame,
  type ProviderProtocolProviderFrame,
} from "@buli/contracts";
import type { ProviderProtocolClientTransport } from "@buli/engine";

export type ProviderProtocolSubprocessEnvironment = Readonly<Record<string, string | undefined>>;

export type ProviderProtocolSubprocess = Readonly<{
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  writeStdin: (chunk: Uint8Array) => Promise<void>;
  closeStdin: () => Promise<void>;
  kill: () => void;
}>;

export type ProviderProtocolSubprocessSpawnInput = Readonly<{
  command: readonly string[];
  environment: ProviderProtocolSubprocessEnvironment;
  workingDirectoryPath?: string | undefined;
}>;

export type ProviderProtocolSubprocessSpawner = (
  input: ProviderProtocolSubprocessSpawnInput,
) => ProviderProtocolSubprocess;

export type ProviderProtocolSubprocessTransportInput = Readonly<{
  command: readonly string[];
  environment?: ProviderProtocolSubprocessEnvironment | undefined;
  workingDirectoryPath?: string | undefined;
  spawnSubprocess?: ProviderProtocolSubprocessSpawner | undefined;
  gracefulShutdownTimeoutMilliseconds?: number | undefined;
}>;

const DEFAULT_GRACEFUL_SUBPROCESS_SHUTDOWN_TIMEOUT_MILLISECONDS = 250;

export class ProviderProtocolSubprocessTransport implements ProviderProtocolClientTransport {
  private readonly subprocess: ProviderProtocolSubprocess;
  private readonly gracefulShutdownTimeoutMilliseconds: number;
  private hasStartedReceivingProviderFrames = false;
  private hasDisposed = false;

  constructor(input: ProviderProtocolSubprocessTransportInput) {
    const spawnSubprocess = input.spawnSubprocess ?? spawnBunProviderProtocolSubprocess;
    this.subprocess = spawnSubprocess({
      command: input.command,
      environment: input.environment ?? {},
      ...(input.workingDirectoryPath !== undefined ? { workingDirectoryPath: input.workingDirectoryPath } : {}),
    });
    this.gracefulShutdownTimeoutMilliseconds = input.gracefulShutdownTimeoutMilliseconds ??
      DEFAULT_GRACEFUL_SUBPROCESS_SHUTDOWN_TIMEOUT_MILLISECONDS;
  }

  receiveProviderFrames(): AsyncIterable<ProviderProtocolProviderFrame> {
    if (this.hasStartedReceivingProviderFrames) {
      throw new Error("Provider protocol subprocess stdout can only be consumed once.");
    }

    this.hasStartedReceivingProviderFrames = true;
    return streamProviderProtocolProviderFramesFromJsonLines(streamReadableByteChunks(this.subprocess.stdout));
  }

  async sendHostFrame(frame: ProviderProtocolHostFrame): Promise<void> {
    if (this.hasDisposed) {
      throw new Error("Cannot send provider protocol host frame after subprocess transport disposal.");
    }

    await this.subprocess.writeStdin(new TextEncoder().encode(encodeProviderProtocolFrameAsJsonLine(frame)));
  }

  async dispose(): Promise<void> {
    if (this.hasDisposed) {
      return;
    }

    this.hasDisposed = true;
    try {
      await this.subprocess.closeStdin();
    } catch {
      // The provider host may have already exited; shutdown continues below.
    }

    const didExitGracefully = await waitForSubprocessExit({
      exited: this.subprocess.exited,
      timeoutMilliseconds: this.gracefulShutdownTimeoutMilliseconds,
    });
    if (didExitGracefully) {
      return;
    }

    this.subprocess.kill();
    await waitForSubprocessExit({
      exited: this.subprocess.exited,
      timeoutMilliseconds: this.gracefulShutdownTimeoutMilliseconds,
    });
  }
}

function spawnBunProviderProtocolSubprocess(input: ProviderProtocolSubprocessSpawnInput): ProviderProtocolSubprocess {
  const command = toNonEmptyCommand(input.command);
  const subprocess = Bun.spawn(command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: normalizeProviderProtocolSubprocessEnvironment(input.environment),
    ...(input.workingDirectoryPath !== undefined ? { cwd: input.workingDirectoryPath } : {}),
  });

  if (!subprocess.stdin || !subprocess.stdout) {
    throw new Error("Provider protocol subprocess did not expose piped stdin and stdout.");
  }

  return {
    stdout: subprocess.stdout,
    exited: subprocess.exited,
    writeStdin: async (chunk) => {
      subprocess.stdin.write(chunk);
      await subprocess.stdin.flush();
    },
    closeStdin: async () => {
      subprocess.stdin.end();
    },
    kill: () => subprocess.kill(),
  };
}

function toNonEmptyCommand(command: readonly string[]): [string, ...string[]] {
  const executablePath = command[0];
  if (!executablePath) {
    throw new Error("Provider protocol subprocess command cannot be empty.");
  }

  return [executablePath, ...command.slice(1)];
}

function normalizeProviderProtocolSubprocessEnvironment(
  environment: ProviderProtocolSubprocessEnvironment,
): Record<string, string> {
  const normalizedEnvironment: Record<string, string> = {};
  for (const [environmentVariableName, environmentVariableValue] of Object.entries(environment)) {
    if (environmentVariableValue === undefined) {
      continue;
    }

    normalizedEnvironment[environmentVariableName] = environmentVariableValue;
  }

  return normalizedEnvironment;
}

async function* streamReadableByteChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const readResult = await reader.read();
      if (readResult.done) {
        return;
      }

      yield readResult.value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function waitForSubprocessExit(input: {
  exited: Promise<number>;
  timeoutMilliseconds: number;
}): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const exitResult = await Promise.race([
    input.exited.then(() => "exited" as const, () => "exited" as const),
    new Promise<"timed_out">((resolve) => {
      timeoutId = setTimeout(() => resolve("timed_out"), input.timeoutMilliseconds);
    }),
  ]);

  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  return exitResult === "exited";
}
