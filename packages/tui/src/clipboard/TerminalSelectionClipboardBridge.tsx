import type { CliRenderer, Selection } from "@opentui/core";
import { useRenderer, useSelectionHandler } from "@opentui/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ClipboardCopyToast } from "../components/ClipboardCopyToast.tsx";
import { writeNativeClipboardText } from "./writeNativeClipboardText.ts";

export type ClipboardTextWriter = (clipboardText: string) => boolean | Promise<boolean>;

export type TerminalSelectionClipboardBridgeProps = {
  writeClipboardText?: ClipboardTextWriter;
  onClipboardWriteError?: (error: unknown) => void;
  copyConfirmationToastDurationMs?: number;
};

const DEFAULT_COPY_CONFIRMATION_TOAST_DURATION_MS = 2_000;

export function TerminalSelectionClipboardBridge(props: TerminalSelectionClipboardBridgeProps) {
  const renderer = useRenderer();
  const writeClipboardText = props.writeClipboardText ?? writeNativeClipboardText;
  const [isCopyConfirmationToastVisible, setIsCopyConfirmationToastVisible] = useState(false);
  const copyConfirmationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isClipboardBridgeMountedRef = useRef(true);

  const showCopyConfirmationToast = useEffectEvent(() => {
    if (!isClipboardBridgeMountedRef.current) {
      return;
    }

    if (copyConfirmationTimeoutRef.current) {
      clearTimeout(copyConfirmationTimeoutRef.current);
    }

    setIsCopyConfirmationToastVisible(true);
    copyConfirmationTimeoutRef.current = setTimeout(() => {
      copyConfirmationTimeoutRef.current = undefined;
      setIsCopyConfirmationToastVisible(false);
    }, props.copyConfirmationToastDurationMs ?? DEFAULT_COPY_CONFIRMATION_TOAST_DURATION_MS);
  });

  useEffect(() => {
    return () => {
      isClipboardBridgeMountedRef.current = false;
      if (copyConfirmationTimeoutRef.current) {
        clearTimeout(copyConfirmationTimeoutRef.current);
      }
    };
  }, []);

  useSelectionHandler((selection) => {
    void copyOpenTuiSelectionToClipboard({
      renderer,
      selection,
      writeClipboardText,
      ...(props.onClipboardWriteError ? { onClipboardWriteError: props.onClipboardWriteError } : {}),
    }).then((didWriteClipboardText) => {
      if (didWriteClipboardText) {
        showCopyConfirmationToast();
      }
    });
  });

  return <ClipboardCopyToast isVisible={isCopyConfirmationToastVisible} />;
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
