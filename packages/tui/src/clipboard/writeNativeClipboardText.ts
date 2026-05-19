import { spawn } from "node:child_process";
import { platform as currentPlatform } from "node:os";

export type NativeClipboardTextCommand = {
  command: string;
  args: readonly string[];
};

export type NativeClipboardTextCommandRunner = (
  clipboardTextCommand: NativeClipboardTextCommand,
  clipboardText: string,
) => Promise<boolean>;

export type NativeClipboardTextWriteOptions = {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  runCommand?: NativeClipboardTextCommandRunner;
};

const DEFAULT_CLIPBOARD_WRITE_TIMEOUT_MS = 2_000;

export function resolveNativeClipboardTextWriteCommands(input: {
  platform: NodeJS.Platform;
  environment: NodeJS.ProcessEnv;
}): NativeClipboardTextCommand[] {
  if (input.platform === "darwin") {
    return [{ command: "pbcopy", args: [] }];
  }

  if (input.platform === "win32") {
    return [
      {
        command: "powershell.exe",
        args: [
          "-NonInteractive",
          "-NoProfile",
          "-Command",
          "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
        ],
      },
    ];
  }

  if (input.platform !== "linux") {
    return [];
  }

  const clipboardTextCommands: NativeClipboardTextCommand[] = [];
  if (input.environment["TERMUX_VERSION"]) {
    clipboardTextCommands.push({ command: "termux-clipboard-set", args: [] });
  }
  if (input.environment["WAYLAND_DISPLAY"]) {
    clipboardTextCommands.push({ command: "wl-copy", args: [] });
  }
  if (input.environment["DISPLAY"]) {
    clipboardTextCommands.push(
      { command: "xclip", args: ["-selection", "clipboard"] },
      { command: "xsel", args: ["--clipboard", "--input"] },
    );
  }

  return clipboardTextCommands;
}

export async function writeNativeClipboardText(
  clipboardText: string,
  options: NativeClipboardTextWriteOptions = {},
): Promise<boolean> {
  const runCommand = options.runCommand ?? runNativeClipboardTextCommand;
  const clipboardTextCommands = resolveNativeClipboardTextWriteCommands({
    platform: options.platform ?? currentPlatform(),
    environment: options.environment ?? process.env,
  });

  for (const clipboardTextCommand of clipboardTextCommands) {
    if (await runCommand(clipboardTextCommand, clipboardText)) {
      return true;
    }
  }

  return false;
}

function runNativeClipboardTextCommand(
  clipboardTextCommand: NativeClipboardTextCommand,
  clipboardText: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let hasSettled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (didWriteClipboardText: boolean): void => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve(didWriteClipboardText);
    };
    const childProcess = spawnClipboardTextCommand(clipboardTextCommand);
    if (!childProcess) {
      settle(false);
      return;
    }
    const childProcessStdin = childProcess.stdin;
    if (!childProcessStdin) {
      settle(false);
      return;
    }

    timeout = setTimeout(() => {
      childProcess.kill();
      settle(false);
    }, DEFAULT_CLIPBOARD_WRITE_TIMEOUT_MS);

    childProcessStdin.on("error", () => undefined);
    childProcess.on("error", () => settle(false));
    childProcess.on("close", (exitCode) => settle(exitCode === 0));
    childProcessStdin.end(clipboardText);
  });
}

function spawnClipboardTextCommand(clipboardTextCommand: NativeClipboardTextCommand): ReturnType<typeof spawn> | undefined {
  try {
    return spawn(clipboardTextCommand.command, [...clipboardTextCommand.args], {
      stdio: ["pipe", "ignore", "ignore"],
    });
  } catch {
    return undefined;
  }
}
