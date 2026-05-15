import { describe, expect, test } from "bun:test";
import { AssistantMarkdownBlock } from "../../../src/components/primitives/AssistantMarkdownBlock.tsx";
import { testRender } from "../../testRenderWithCleanup.ts";

describe("AssistantMarkdownBlock", () => {
  test("renders_heading_paragraph_list_and_code_fence_with_OpenTUI_markdown", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "# Done",
          "",
          "Here is `code`.",
          "",
          "- first",
          "- second",
          "",
          "```ts",
          "const x = 1;",
          "```",
        ].join("\n")}
      />,
      { width: 80, height: 20 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Done");
    expect(frame).toContain("Here is");
    expect(frame).toContain("code");
    expect(frame).toContain("first");
    expect(frame).toContain("second");
    expect(frame).toContain("const x = 1;");
  });

  test("renders_streaming_markdown_tail", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock horizontalRuleColor="#10B981" isStreaming={true} markdownText="Still **typing" />,
      { width: 60, height: 8 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("Still");
  });

  test("renders_horizontal_rules_as_terminal_dividers", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "Intro",
          "",
          "---",
          "",
          "## Implementation mode",
        ].join("\n")}
      />,
      { width: 72, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Intro");
    expect(frame).toContain("Implementation mode");
    expect(frame).toContain("─");
    expect(frame).not.toContain("---");
  });

  test("renders_markdown_tables_as_compact_visible_grids", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "Meaning:",
          "",
          "| Key | Behavior |",
          "| --- | --- |",
          "| Enter | submit |",
          "| Shift+Enter | newline |",
        ].join("\n")}
      />,
      { width: 80, height: 20 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    const renderedRows = frame.split("\n");
    const headerRowIndex = renderedRows.findIndex((renderedRow) =>
      renderedRow.includes("Key") && renderedRow.includes("Behavior")
    );
    const firstDataRowIndex = renderedRows.findIndex((renderedRow) =>
      renderedRow.includes("Enter") && renderedRow.includes("submit")
    );
    expect(frame).toContain("Meaning:");
    expect(frame).toContain("│");
    expect(frame).toContain("─");
    expect(headerRowIndex).toBeGreaterThanOrEqual(0);
    expect(firstDataRowIndex).toBeGreaterThanOrEqual(0);
    expect(firstDataRowIndex - headerRowIndex).toBeLessThanOrEqual(2);
  });
});
