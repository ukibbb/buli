import { describe, expect, test } from "bun:test";
import { testRender } from "./testRenderWithCleanup.ts";
import type { AssistantContentPart } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { RenderAssistantResponseTree } from "../src/richText/renderAssistantResponseTree.tsx";

describe("RenderAssistantResponseTree", () => {
  test("renders_paragraph_content_part_with_inline_text", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "paragraph", inlineSpans: [{ spanKind: "plain", spanText: "hello" }] },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("hello");
  });

  test("renders_heading_level_1_with_prefix_and_bold_text", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Title" }] },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain(">_ Title");
  });

  test("heading level 1 uses accentCyan >_ prefix and textPrimary body", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "heading", headingLevel: 1, inlineSpans: [{ spanKind: "plain", spanText: "Designing for the terminal lover" }] },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain(">_");
    expect(frame).toContain("Designing for the terminal lover");
    expect(chatScreenTheme.accentCyan).toBe("#22D3EE");
    expect(chatScreenTheme.textPrimary).toBe("#FFFFFF");
  });

  test("heading level 2 uses accentGreen ## prefix", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "heading", headingLevel: 2, inlineSpans: [{ spanKind: "plain", spanText: "Typography that feels quiet" }] },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("##");
    expect(chatScreenTheme.accentGreen).toBe("#10B981");
  });

  test("heading level 3 uses accentAmber ### prefix and textSecondary body", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "heading", headingLevel: 3, inlineSpans: [{ spanKind: "plain", spanText: "Inline rhythm and pacing" }] },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("###");
    expect(chatScreenTheme.accentAmber).toBe("#F59E0B");
    expect(chatScreenTheme.textSecondary).toBe("#94A3B8");
  });

  test("horizontal_rule renders centered § glyph with border lines", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "horizontal_rule" },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("§");
    expect(chatScreenTheme.border).toBe("#2A2A3A");
    expect(chatScreenTheme.textDim).toBe("#475569");
  });

  test("renders_fenced_code_block_with_each_code_line", async () => {
    const parts: readonly AssistantContentPart[] = [
      { kind: "fenced_code_block", languageLabel: "ts", codeLines: ["const x = 1;", "console.log(x);"] },
    ];
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={parts} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("const x = 1;");
    expect(frame).toContain("console.log(x);");
  });

  test("renders_empty_content_parts_as_empty_output", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <RenderAssistantResponseTree assistantContentParts={[]} />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    expect(captureCharFrame()).toBeDefined();
  });
});
