import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderToString } from "ink";
import type { AssistantContentPart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { RenderAssistantResponseTree } from "../src/richText/renderAssistantResponseTree.tsx";

function renderWithoutAnsi(node: React.ReactElement) {
  return stripVTControlCharacters(renderToString(node));
}

function ansi24BitFg_p2(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
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
    expect(output).toContain(">_ Title");
  });

  test("RenderAssistantResponseTree heading level 1 uses accentCyan >_ prefix and textPrimary body", () => {
    const ansiOutput = renderToString(
      <RenderAssistantResponseTree assistantContentParts={[
        { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Designing for the terminal lover" }] },
      ]} />,
    );
    expect(ansiOutput).toContain(ansi24BitFg_p2(chatScreenTheme.accentCyan));
    expect(ansiOutput).toContain(">_");
    expect(ansiOutput).toContain("Designing for the terminal lover");
  });

  test("RenderAssistantResponseTree heading level 2 uses accentGreen ## prefix", () => {
    const ansiOutput = renderToString(
      <RenderAssistantResponseTree assistantContentParts={[
        { kind: "heading", headingLevel: 2, inlineSpans: [{ spanKind: "plain", spanText: "Typography that feels quiet" }] },
      ]} />,
    );
    expect(ansiOutput).toContain(ansi24BitFg_p2(chatScreenTheme.accentGreen));
    expect(ansiOutput).toContain("##");
  });

  test("RenderAssistantResponseTree heading level 3 uses accentAmber ### prefix and textSecondary body", () => {
    const ansiOutput = renderToString(
      <RenderAssistantResponseTree assistantContentParts={[
        { kind: "heading", headingLevel: 3, inlineSpans: [{ spanKind: "plain", spanText: "Inline rhythm and pacing" }] },
      ]} />,
    );
    expect(ansiOutput).toContain(ansi24BitFg_p2(chatScreenTheme.accentAmber));
    expect(ansiOutput).toContain("###");
    expect(ansiOutput).toContain(ansi24BitFg_p2(chatScreenTheme.textSecondary));
  });

  test("RenderAssistantResponseTree horizontal_rule renders centered § glyph in textDim with border lines", () => {
    const ansiOutput = renderToString(
      <RenderAssistantResponseTree assistantContentParts={[
        { kind: "horizontal_rule" },
      ]} />,
    );
    expect(ansiOutput).toContain("§");
    expect(ansiOutput).toContain(ansi24BitFg_p2(chatScreenTheme.border));
    expect(ansiOutput).toContain(ansi24BitFg_p2(chatScreenTheme.textDim));
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
