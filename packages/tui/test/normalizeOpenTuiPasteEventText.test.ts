import { expect, test } from "bun:test";
import {
  normalizeOpenTuiPasteEventText,
  readOpenTuiNonTextPasteMetadata,
} from "../src/behavior/normalizeOpenTuiPasteEventText.ts";

const textEncoder = new TextEncoder();

function createOpenTuiPasteEventInput(input: {
  pastedText: string;
  metadata?: { kind?: "text" | "binary" | "unknown"; mimeType?: string } | undefined;
}) {
  return {
    bytes: textEncoder.encode(input.pastedText),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

test("normalizeOpenTuiPasteEventText strips terminal control sequences", () => {
  expect(normalizeOpenTuiPasteEventText(
    createOpenTuiPasteEventInput({ pastedText: "\x1B[31mred\x1B[0m" }),
  )).toBe("red");
});

test("normalizeOpenTuiPasteEventText normalizes CRLF and CR line endings", () => {
  expect(normalizeOpenTuiPasteEventText(
    createOpenTuiPasteEventInput({ pastedText: "first\r\nsecond\rthird" }),
  )).toBe("first\nsecond\nthird");
});

test("normalizeOpenTuiPasteEventText keeps empty pasted text empty", () => {
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput({ pastedText: "" }))).toBe("");
});

test("normalizeOpenTuiPasteEventText decodes text paste metadata", () => {
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput({
    pastedText: "hello",
    metadata: { kind: "text", mimeType: "text/plain" },
  }))).toBe("hello");
});

test("normalizeOpenTuiPasteEventText ignores binary and unknown paste metadata", () => {
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput({
    pastedText: "not text",
    metadata: { kind: "binary", mimeType: "application/octet-stream" },
  }))).toBe("");
  expect(normalizeOpenTuiPasteEventText(createOpenTuiPasteEventInput({
    pastedText: "maybe text",
    metadata: { kind: "unknown" },
  }))).toBe("");
});

test("readOpenTuiNonTextPasteMetadata returns safe non-text metadata", () => {
  expect(readOpenTuiNonTextPasteMetadata(createOpenTuiPasteEventInput({
    pastedText: "binary bytes",
    metadata: { kind: "binary", mimeType: "image/png" },
  }))).toEqual({ pasteKind: "binary", mimeType: "image/png" });
  expect(readOpenTuiNonTextPasteMetadata(createOpenTuiPasteEventInput({
    pastedText: "plain text",
    metadata: { kind: "text", mimeType: "text/plain" },
  }))).toBeUndefined();
});
