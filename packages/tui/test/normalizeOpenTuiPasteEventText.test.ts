import { expect, test } from "bun:test";
import { normalizeOpenTuiPasteEventText } from "../src/behavior/normalizeOpenTuiPasteEventText.ts";

const textEncoder = new TextEncoder();

function createOpenTuiPasteEventInput(pastedText: string) {
  return {
    bytes: textEncoder.encode(pastedText),
  };
}

test("normalizeOpenTuiPasteEventText strips terminal control sequences", () => {
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput("\x1B[31mred\x1B[0m"))).toBe("red");
});

test("normalizeOpenTuiPasteEventText normalizes CRLF and CR line endings", () => {
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput("first\r\nsecond\rthird"))).toBe(
    "first\nsecond\nthird",
  );
});

test("normalizeOpenTuiPasteEventText keeps empty pasted text empty", () => {
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput(""))).toBe("");
});
