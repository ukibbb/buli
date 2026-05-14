import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { FencedCodeBlock, resolveOpenTuiCodeFiletype } from "../../../src/components/primitives/FencedCodeBlock.tsx";
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

  test("renders_plain_unnumbered_code_blocks_through_the_assistant_code_path", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FencedCodeBlock
        languageLabel="ts"
        codeLines={[
          { lineText: "const answer = 42;" },
          { lineText: "console.log(answer);" },
        ]}
      />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("// ts");
    expect(frame).toContain("const answer = 42;");
    expect(frame).toContain("console.log(answer);");
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
    // Sentinel — standalone code blocks share the app's black canvas while
    // borderSubtle keeps their frame visible.
    expect(chatScreenTheme.surfaceOne).toBe("#000000");
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

  test("embedded_truncates_long_code_rows_instead_of_wrapping_them", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <FencedCodeBlock
        variant="embedded"
        codeLines={[{ lineNumber: 1, lineText: "const path = 'packages/tui/src/components/ConversationMessageList.tsx';" }]}
      />,
      { width: 34, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("const path");
    expect(frame).not.toContain("ConversationMessageList.tsx");
  });

  test("normalizes_markdown_fence_info_strings_with_OpenTUI_filetype_resolution", () => {
    expect(resolveOpenTuiCodeFiletype(undefined, "TSX title=Button.tsx")).toBe("typescriptreact");
    expect(resolveOpenTuiCodeFiletype(undefined, ".jsx")).toBe("javascriptreact");
    expect(resolveOpenTuiCodeFiletype(undefined, "Dockerfile")).toBe("dockerfile");
  });

  test("prefers_file_path_over_language_label_for_OpenTUI_filetype_resolution", () => {
    expect(resolveOpenTuiCodeFiletype("packages/tui/src/index.ts", undefined)).toBe("typescript");
    expect(resolveOpenTuiCodeFiletype("Dockerfile", undefined)).toBe("dockerfile");
    // Falls back to the language label when the path produces no match.
    expect(resolveOpenTuiCodeFiletype("path/with/no/extension", "ts")).toBe("typescript");
    // Final fallback is the "text" filetype.
    expect(resolveOpenTuiCodeFiletype(undefined, undefined)).toBe("text");
  });
});
