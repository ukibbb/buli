import { decodePasteBytes, stripAnsiSequences, type PasteEvent } from "@opentui/core";

export type OpenTuiPasteEventTextInput = Pick<PasteEvent, "bytes" | "metadata">;

export type OpenTuiNonTextPasteMetadata = {
  pasteKind: "binary" | "unknown";
  mimeType: string | undefined;
};

export function readOpenTuiNonTextPasteMetadata(
  openTuiPasteEvent: OpenTuiPasteEventTextInput,
): OpenTuiNonTextPasteMetadata | undefined {
  const pasteKind = openTuiPasteEvent.metadata?.kind;
  if (pasteKind === "binary" || pasteKind === "unknown") {
    return {
      pasteKind,
      mimeType: openTuiPasteEvent.metadata?.mimeType,
    };
  }

  return undefined;
}

export function normalizeOpenTuiPasteEventText(openTuiPasteEvent: OpenTuiPasteEventTextInput): string {
  if (readOpenTuiNonTextPasteMetadata(openTuiPasteEvent)) {
    return "";
  }

  return stripAnsiSequences(decodePasteBytes(openTuiPasteEvent.bytes))
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
}
