import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import React from "react";
import type { AssistantContentPart } from "@buli/contracts";
import { RenderAssistantResponseTree } from "../src/richText/renderAssistantResponseTree.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

describe("RenderAssistantResponseTree", () => {
  test("renders_paragraph_content_part_with_inline_text", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "hello" }] },
    ];
    const output = renderWithoutAnsi(<RenderAssistantResponseTree assistantContentParts={parts} />);
    expect(output).toContain("hello");
  });

  test("renders_heading_level_1_with_prefix_and_bold_text", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Title" }] },
    ];
    const output = renderWithoutAnsi(<RenderAssistantResponseTree assistantContentParts={parts} />);
    expect(output).toContain("# Title");
  });

  test("renders_fenced_code_block_with_each_code_line", () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "fenced_code_block", languageLabel: "ts", codeLines: ["const x = 1;", "console.log(x);"] },
    ];
    const output = renderWithoutAnsi(<RenderAssistantResponseTree assistantContentParts={parts} />);
    expect(output).toContain("const x = 1;");
    expect(output).toContain("console.log(x);");
  });

  test("renders_empty_content_parts_as_empty_output", () => {
    const output = renderWithoutAnsi(<RenderAssistantResponseTree assistantContentParts={[]} />);
    expect(output).toBeDefined();
  });
});
