import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import type { UserPromptImageAttachment } from "@buli/contracts";

type ClipboardCommandResult = {
  exitCode: number | null;
  stdout: Buffer;
};

export async function readNativeClipboardImageAttachment(): Promise<UserPromptImageAttachment | undefined> {
  const os = platform();
  if (os === "darwin") {
    return readMacOsClipboardImageAttachment();
  }

  if (os === "win32" || release().includes("WSL")) {
    return readWindowsClipboardImageAttachment();
  }

  if (os === "linux") {
    return readLinuxClipboardImageAttachment();
  }

  return undefined;
}

export function createUserPromptImageAttachmentFromPngBytes(input: {
  pngBytes: Buffer;
  fileName?: string;
}): UserPromptImageAttachment | undefined {
  if (input.pngBytes.byteLength === 0) {
    return undefined;
  }

  return {
    attachmentId: `clipboard-image-${randomUUID()}`,
    mimeType: "image/png",
    dataUrl: `data:image/png;base64,${input.pngBytes.toString("base64")}`,
    fileName: input.fileName ?? "clipboard.png",
  };
}

async function readMacOsClipboardImageAttachment(): Promise<UserPromptImageAttachment | undefined> {
  const temporaryClipboardDirectoryPath = await mkdtemp(join(tmpdir(), "buli-clipboard-"));
  const temporaryClipboardPngFilePath = join(temporaryClipboardDirectoryPath, "clipboard.png");
  try {
    const osascriptResult = await runClipboardCommand("osascript", [
      "-e",
      "set imageData to the clipboard as \"PNGf\"",
      "-e",
      `set fileRef to open for access POSIX file ${appleScriptStringLiteral(temporaryClipboardPngFilePath)} with write permission`,
      "-e",
      "set eof fileRef to 0",
      "-e",
      "write imageData to fileRef",
      "-e",
      "close access fileRef",
    ]);
    if (!osascriptResult || osascriptResult.exitCode !== 0) {
      return undefined;
    }

    return createUserPromptImageAttachmentFromPngBytes({
      pngBytes: await readFile(temporaryClipboardPngFilePath),
      fileName: "clipboard.png",
    });
  } catch {
    return undefined;
  } finally {
    await rm(temporaryClipboardDirectoryPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function readWindowsClipboardImageAttachment(): Promise<UserPromptImageAttachment | undefined> {
  const powershellScript = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$image = [System.Windows.Forms.Clipboard]::GetImage();",
    "if ($image) {",
    "  $memoryStream = New-Object System.IO.MemoryStream;",
    "  $image.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png);",
    "  [System.Convert]::ToBase64String($memoryStream.ToArray());",
    "}",
  ].join(" ");
  const powershellResult = await runClipboardCommand("powershell.exe", [
    "-NonInteractive",
    "-NoProfile",
    "-Command",
    powershellScript,
  ]);
  if (!powershellResult || powershellResult.exitCode !== 0) {
    return undefined;
  }

  const base64Image = powershellResult.stdout.toString("utf8").trim();
  if (!base64Image) {
    return undefined;
  }

  return createUserPromptImageAttachmentFromPngBytes({
    pngBytes: Buffer.from(base64Image, "base64"),
    fileName: "clipboard.png",
  });
}

async function readLinuxClipboardImageAttachment(): Promise<UserPromptImageAttachment | undefined> {
  const waylandResult = await runClipboardCommand("wl-paste", ["-t", "image/png"]);
  if (waylandResult && waylandResult.exitCode === 0 && waylandResult.stdout.byteLength > 0) {
    return createUserPromptImageAttachmentFromPngBytes({ pngBytes: waylandResult.stdout, fileName: "clipboard.png" });
  }

  const x11Result = await runClipboardCommand("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]);
  if (x11Result && x11Result.exitCode === 0 && x11Result.stdout.byteLength > 0) {
    return createUserPromptImageAttachmentFromPngBytes({ pngBytes: x11Result.stdout, fileName: "clipboard.png" });
  }

  return undefined;
}

function appleScriptStringLiteral(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function runClipboardCommand(command: string, args: readonly string[]): Promise<ClipboardCommandResult | undefined> {
  return new Promise((resolve) => {
    const childProcess = spawn(command, [...args], { stdio: ["ignore", "pipe", "ignore"] });
    const stdoutChunks: Buffer[] = [];

    childProcess.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    childProcess.on("error", () => {
      resolve(undefined);
    });
    childProcess.on("close", (exitCode) => {
      resolve({ exitCode, stdout: Buffer.concat(stdoutChunks) });
    });
  });
}
