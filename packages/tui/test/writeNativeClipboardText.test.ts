import { describe, expect, test } from "bun:test";
import {
  resolveNativeClipboardTextWriteCommands,
  writeNativeClipboardText,
  type NativeClipboardTextCommand,
} from "../src/clipboard/writeNativeClipboardText.ts";

describe("resolveNativeClipboardTextWriteCommands", () => {
  test("uses pbcopy on macOS", () => {
    expect(resolveNativeClipboardTextWriteCommands({ platform: "darwin", environment: {} })).toEqual([
      { command: "pbcopy", args: [] },
    ]);
  });

  test("uses PowerShell Set-Clipboard on Windows", () => {
    expect(resolveNativeClipboardTextWriteCommands({ platform: "win32", environment: {} })).toEqual([
      expect.objectContaining({ command: "powershell.exe" }),
    ]);
  });

  test("uses Wayland before X11 commands on Linux when both displays exist", () => {
    expect(
      resolveNativeClipboardTextWriteCommands({
        platform: "linux",
        environment: { WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" },
      }),
    ).toEqual([
      { command: "wl-copy", args: [] },
      { command: "xclip", args: ["-selection", "clipboard"] },
      { command: "xsel", args: ["--clipboard", "--input"] },
    ]);
  });

  test("uses Termux clipboard before graphical Linux commands", () => {
    expect(
      resolveNativeClipboardTextWriteCommands({
        platform: "linux",
        environment: { TERMUX_VERSION: "0.118", WAYLAND_DISPLAY: "wayland-1" },
      }),
    ).toEqual([
      { command: "termux-clipboard-set", args: [] },
      { command: "wl-copy", args: [] },
    ]);
  });
});

test("writeNativeClipboardText stops after the first successful command", async () => {
  const attemptedCommands: NativeClipboardTextCommand[] = [];

  const didWriteClipboardText = await writeNativeClipboardText("selected text", {
    platform: "linux",
    environment: { WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" },
    runCommand: async (clipboardTextCommand) => {
      attemptedCommands.push(clipboardTextCommand);
      return clipboardTextCommand.command === "xclip";
    },
  });

  expect(didWriteClipboardText).toBe(true);
  expect(attemptedCommands).toEqual([
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
  ]);
});

test("writeNativeClipboardText reports failure when no command succeeds", async () => {
  const didWriteClipboardText = await writeNativeClipboardText("selected text", {
    platform: "linux",
    environment: { DISPLAY: ":0" },
    runCommand: async () => false,
  });

  expect(didWriteClipboardText).toBe(false);
});
