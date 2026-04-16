import { describe, expect, test } from "bun:test";
import { InlineSpanSchema } from "../src/inlineSpan.ts";

describe("InlineSpanSchema", () => {
  test("parses_inline_plain_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "plain", spanText: "hello world" });
    expect(parsed).toEqual({ spanKind: "plain", spanText: "hello world" });
  });

  test("parses_inline_bold_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "bold", spanText: "strong" });
    expect(parsed).toEqual({ spanKind: "bold", spanText: "strong" });
  });

  test("parses_inline_italic_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "italic", spanText: "emph" });
    expect(parsed).toEqual({ spanKind: "italic", spanText: "emph" });
  });

  test("parses_inline_strike_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "strike", spanText: "gone" });
    expect(parsed).toEqual({ spanKind: "strike", spanText: "gone" });
  });

  test("parses_inline_code_span_with_literal_text", () => {
    const parsed = InlineSpanSchema.parse({ spanKind: "code", spanText: "identifier" });
    expect(parsed).toEqual({ spanKind: "code", spanText: "identifier" });
  });

  test("parses_inline_link_span_with_href_url_and_span_text", () => {
    const parsed = InlineSpanSchema.parse({
      spanKind: "link",
      spanText: "click here",
      hrefUrl: "https://example.com",
    });
    expect(parsed).toEqual({
      spanKind: "link",
      spanText: "click here",
      hrefUrl: "https://example.com",
    });
  });

  test("rejects_unknown_inline_span_kind", () => {
    expect(() => InlineSpanSchema.parse({ spanKind: "rainbow", spanText: "x" })).toThrow();
  });

  test("rejects_link_span_without_href_url", () => {
    expect(() =>
      InlineSpanSchema.parse({ spanKind: "link", spanText: "click" }),
    ).toThrow();
  });
});
