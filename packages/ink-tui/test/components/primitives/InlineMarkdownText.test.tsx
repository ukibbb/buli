import { expect, test } from "bun:test";
import { renderToString } from "ink";
import { InlineMarkdownText } from "../../../src/components/primitives/InlineMarkdownText.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

function ansi24BitFg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function ansi24BitBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

test("InlineMarkdownText code span renders surfaceTwo background and accentCyan foreground", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "plain", spanText: "Mount " },
      { spanKind: "code", spanText: "@buli/library" },
      { spanKind: "plain", spanText: " to stream a page." },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitBg(chatScreenTheme.surfaceTwo));
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain("@buli/library");
});

test("InlineMarkdownText strike span renders textMuted with ANSI strikethrough escape", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "plain", spanText: "old endpoint " },
      { spanKind: "strike", spanText: "/api/library" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textMuted));
  expect(ansiOutput).toContain("/api/library");
  // Chalk emits \x1b[9m for strikethrough.
  expect(ansiOutput).toContain("\x1b[9m");
});

test("InlineMarkdownText link span renders accentCyan with OSC 8 hyperlink wrapper", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "plain", spanText: "Read the spec at " },
      { spanKind: "link", spanText: "commonmark.org", hrefUrl: "https://commonmark.org" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentCyan));
  expect(ansiOutput).toContain("commonmark.org");
  // OSC 8 hyperlink wrapper.
  expect(ansiOutput).toContain("\u001b]8;;https://commonmark.org\u001b\\");
});

test("InlineMarkdownText highlight span renders in accentAmber", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "plain", spanText: "The important bit is " },
      { spanKind: "highlight", spanText: "sessions are cookie-based" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.accentAmber));
  expect(ansiOutput).toContain("sessions are cookie-based");
});

test("InlineMarkdownText subscript span renders in textSecondary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "plain", spanText: "Formula: x" },
      { spanKind: "subscript", spanText: "n" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textSecondary));
  expect(ansiOutput).toContain("n");
});

test("InlineMarkdownText superscript span renders in textSecondary", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "plain", spanText: "Formula: x" },
      { spanKind: "superscript", spanText: "2" },
    ]} />,
  );
  expect(ansiOutput).toContain(ansi24BitFg(chatScreenTheme.textSecondary));
  expect(ansiOutput).toContain("2");
});

test("InlineMarkdownText link span appends ↗ glyph for https:// URLs", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "link", spanText: "commonmark.org", hrefUrl: "https://commonmark.org" },
    ]} />,
  );
  expect(ansiOutput).toContain("↗");
  expect(ansiOutput).toContain("commonmark.org");
});

test("InlineMarkdownText link span appends ↗ glyph for http:// URLs", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "link", spanText: "old api", hrefUrl: "http://example.test" },
    ]} />,
  );
  expect(ansiOutput).toContain("↗");
});

test("InlineMarkdownText link span does NOT append ↗ glyph for relative URLs", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "link", spanText: "internal anchor", hrefUrl: "#section" },
    ]} />,
  );
  expect(ansiOutput).not.toContain("↗");
  expect(ansiOutput).toContain("internal anchor");
});

test("InlineMarkdownText link span does NOT append ↗ glyph for in-document paths", () => {
  const ansiOutput = renderToString(
    <InlineMarkdownText spans={[
      { spanKind: "link", spanText: "local file", hrefUrl: "./doc.md" },
    ]} />,
  );
  expect(ansiOutput).not.toContain("↗");
});
