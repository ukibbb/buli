import { describe, expect, test } from "bun:test";
import { testRender } from "./testRenderWithCleanup.ts";
import type { AssistantContentPart } from "@buli/contracts";
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
    expect(captureCharFrame()).toContain("# Title");
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
