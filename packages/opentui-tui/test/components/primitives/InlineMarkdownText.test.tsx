import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { InlineMarkdownText } from "../../../src/components/primitives/InlineMarkdownText.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("InlineMarkdownText", () => {
  test("renders_plain_span_literally", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[{ spanKind: "plain", spanText: "hello" }]} />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("hello");
  });

  test("renders_bold_span", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[{ spanKind: "bold", spanText: "world" }]} />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("world");
  });

  test("renders_code_span_with_padding", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[{ spanKind: "code", spanText: "npm" }]} />,
      { width: 40, height: 5 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("npm");
  });

  test("renders code span text and locks surfaceTwo + accentCyan tokens", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[
        { spanKind: "plain", spanText: "Mount " },
        { spanKind: "code", spanText: "@buli/library" },
      ]} />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("@buli/library");
    expect(chatScreenTheme.surfaceTwo).toBe("#16161F");
    expect(chatScreenTheme.accentCyan).toBe("#22D3EE");
  });

  test("renders strike span text and locks textMuted token", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[
        { spanKind: "plain", spanText: "old endpoint " },
        { spanKind: "strike", spanText: "/api/library" },
      ]} />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("/api/library");
    expect(chatScreenTheme.textMuted).toBe("#64748B");
  });

  test("renders link span text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[
        { spanKind: "link", spanText: "commonmark.org", hrefUrl: "https://commonmark.org" },
      ]} />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("commonmark.org");
  });

  test("renders highlight subscript and superscript spans (opentui)", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[
        { spanKind: "highlight", spanText: "important" },
        { spanKind: "subscript", spanText: "sub" },
        { spanKind: "superscript", spanText: "sup" },
      ]} />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("important");
    expect(frame).toContain("sub");
    expect(frame).toContain("sup");
    expect(chatScreenTheme.accentAmber).toBe("#F59E0B");
    expect(chatScreenTheme.textSecondary).toBe("#94A3B8");
  });

  test("link with https URL appends ↗ glyph (opentui)", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[
        { spanKind: "link", spanText: "commonmark.org", hrefUrl: "https://commonmark.org" },
      ]} />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("↗");
  });

  test("link with relative URL does not append ↗ glyph (opentui)", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InlineMarkdownText spans={[
        { spanKind: "link", spanText: "internal anchor", hrefUrl: "#section" },
      ]} />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    expect(captureCharFrame()).not.toContain("↗");
  });
});
