import type { CliRenderer, Selection } from "@opentui/core";
import { useRenderer, useSelectionHandler } from "@opentui/react";
import { writeNativeClipboardText } from "./writeNativeClipboardText.ts";

export type ClipboardTextWriter = (clipboardText: string) => boolean | Promise<boolean>;

export type TerminalSelectionClipboardBridgeProps = {
  writeClipboardText?: ClipboardTextWriter;
  onClipboardWriteError?: (error: unknown) => void;
};

export function TerminalSelectionClipboardBridge(props: TerminalSelectionClipboardBridgeProps) {
  const renderer = useRenderer();
  const writeClipboardText = props.writeClipboardText ?? writeNativeClipboardText;

  useSelectionHandler((selection) => {
    void copyOpenTuiSelectionToClipboard({
      renderer,
      selection,
      writeClipboardText,
      ...(props.onClipboardWriteError ? { onClipboardWriteError: props.onClipboardWriteError } : {}),
    });
  });

  return null;
}

export async function copyOpenTuiSelectionToClipboard(input: {
  renderer: Pick<CliRenderer, "clearSelection" | "copyToClipboardOSC52">;
  selection: Pick<Selection, "getSelectedText">;
  writeClipboardText: ClipboardTextWriter;
  onClipboardWriteError?: (error: unknown) => void;
}): Promise<boolean> {
  const selectedText = input.selection.getSelectedText();
  if (!selectedText) {
    return false;
  }

  let didWriteOsc52ClipboardText = false;
  try {
    didWriteOsc52ClipboardText = input.renderer.copyToClipboardOSC52(selectedText);
  } finally {
    input.renderer.clearSelection();
  }

  try {
    const didWriteNativeClipboardText = await input.writeClipboardText(selectedText);
    return didWriteOsc52ClipboardText || didWriteNativeClipboardText;
  } catch (error) {
    input.onClipboardWriteError?.(error);
    return didWriteOsc52ClipboardText;
  }
}
