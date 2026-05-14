import { decodePasteBytes, stripAnsiSequences, type PasteEvent } from "@opentui/core";

export type OpenTuiPasteEventTextInput = Pick<PasteEvent, "bytes">;

export function normalizeOpenTuiPasteEventText(openTuiPasteEvent: OpenTuiPasteEventTextInput): string {
  return stripAnsiSequences(decodePasteBytes(openTuiPasteEvent.bytes))
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
}
