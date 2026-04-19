import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { FencedCodeBlock } from "../../../src/components/primitives/FencedCodeBlock.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

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

  test("standalone_renders_language_label_and_code_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FencedCodeBlock
        languageLabel="typescript"
        codeLines={[
          { lineNumber: 1, lineText: "export const foo = 1;" },
        ]}
      />,
      { width: 60, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("typescript");
    expect(frame).toContain("export const foo = 1;");
    // Sentinel — surfaceOne and borderSubtle tokens must remain stable
    // because the standalone variant binds the chrome to them.
    expect(chatScreenTheme.surfaceOne).toBe("#111118");
    expect(chatScreenTheme.borderSubtle).toBe("#1E1E2E");
  });

  test("embedded_renders_only_code_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FencedCodeBlock
        variant="embedded"
        codeLines={[{ lineNumber: 1, lineText: "embedded line" }]}
      />,
      { width: 60, height: 4 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("embedded line");
  });
});
