import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { FencedCodeBlock } from "../../../src/components/primitives/FencedCodeBlock.tsx";

describe("FencedCodeBlock", () => {
  test("renders_language_label_and_code_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FencedCodeBlock
        languageLabel="ts"
        codeLines={[
          { lineNumber: 1, lineText: "const x = 1;" },
          { lineNumber: 2, lineText: "return x;" },
        ]}
      />,
      { width: 60, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("// ts");
    expect(frame).toContain("const x = 1;");
    expect(frame).toContain("return x;");
  });

  test("renders_syntax_highlight_spans", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FencedCodeBlock
        codeLines={[
          {
            lineText: "const x = 1;",
            syntaxHighlightSpans: [
              { spanStyle: "keyword", spanText: "const" },
              { spanStyle: "identifier", spanText: " x = " },
              { spanStyle: "number", spanText: "1" },
            ],
          },
        ]}
      />,
      { width: 60, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("const");
    expect(frame).toContain("x = ");
    expect(frame).toContain("1");
  });
});
