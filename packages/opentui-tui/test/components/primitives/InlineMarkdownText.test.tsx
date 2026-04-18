import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { InlineMarkdownText } from "../../../src/components/primitives/InlineMarkdownText.tsx";

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
});
