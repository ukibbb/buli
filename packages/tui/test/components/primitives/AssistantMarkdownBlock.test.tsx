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
    expect(frame).toContain("▌");
    expect(frame).toContain("Done");
    expect(frame).toContain("Here is");
    expect(frame).toContain("code");
    expect(frame).toContain("first");
    expect(frame).toContain("second");
    expect(frame).toContain("╭─ ts");
    expect(frame).toContain("╰");
    expect(frame).toContain("const x = 1;");
  });

  test("renders_third_level_headings_without_the_hollow_diamond_decoration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["# Done", "", "## Scope", "", "### 1. The scope is huge", "", "#### Follow-up"].join("\n")}
      />,
      { width: 72, height: 12 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("▌ Done");
    expect(frame).toContain("◆ Scope");
    expect(frame).toContain("1. The scope is huge");
    expect(frame).toContain("• Follow-up");
    expect(frame).not.toContain("◇ 1. The scope is huge");
  });

  test("renders_streaming_markdown_tail", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock horizontalRuleColor="#10B981" isStreaming={true} markdownText="Still **typing" />,
      { width: 60, height: 8 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("Still");
  });

  test("hides_incomplete_streaming_structural_markers", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={true}
        markdownText={["Ready", "", "```ts"].join("\n")}
      />,
      { width: 60, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Ready");
    expect(frame).not.toContain("```ts");
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

  test("renders_blockquotes_with_a_quote_rail", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["> Keep this constraint visible.", "> Second line."].join("\n")}
      />,
      { width: 72, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("│ Keep this constraint visible.");
    expect(frame).toContain("│ Second line.");
  });

  test("renders_github_style_callouts_as_colored_terminal_blocks", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["> [!WARNING]", "> Review the diff before approving."].join("\n")}
      />,
      { width: 72, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("▌ WARNING");
    expect(frame).toContain("├");
    expect(frame).toContain("│ Review the diff before approving.");
  });

  test("renders_task_lists_with_checkbox_glyphs", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["- [x] Read the file", "- [ ] Update the tests"].join("\n")}
      />,
      { width: 72, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("☑ Read the file");
    expect(frame).toContain("☐ Update the tests");
    expect(frame).not.toContain("[x]");
    expect(frame).not.toContain("[ ]");
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

  test("renders_nested_lists_with_depth_markers_and_indentation", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["- parent", "  - child", "    - grandchild"].join("\n")}
      />,
      { width: 72, height: 10 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("• parent");
    expect(frame).toContain("  ◦ child");
    expect(frame).toContain("    ▪ grandchild");
  });

  test("renders_diff_fences_with_change_rails", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["```diff", "@@ -1 +1 @@", "-old line", "+new line", "```"].join("\n")}
      />,
      { width: 96, height: 12 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("╭─ diff changes");
    expect(frame).toContain("│ @@ -1 +1 @@");
    expect(frame).toContain("│ -old line");
    expect(frame).toContain("│ +new line");
  });

  test("renders_code_fence_filename_labels_from_info_strings", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["```ts title=src/app.ts", "const app = true;", "```"].join("\n")}
      />,
      { width: 96, height: 10 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("╭─ ts · src/app.ts");
  });

  test("renders_plain_text_fences_as_unlabeled_terminal_cards", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "near-term mantra:",
          "",
          "```text",
          "Better tutor behavior.",
          "Better context.",
          "Better proposal review.",
          "Visible evidence.",
          "No silent durable mutation.",
          "```",
        ].join("\n")}
      />,
      { width: 96, height: 14 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("near-term mantra:");
    expect(frame).toContain("Better tutor behavior.");
    expect(frame).toContain("Better context.");
    expect(frame).toContain("╭");
    expect(frame).toContain("┃ Better tutor behavior.");
    expect(frame).toContain("╰");
    expect(frame).not.toContain("╭─ text");
  });

  test("aligns_ordered_list_markers_by_digit_width", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["9. ninth", "10. tenth"].join("\n")}
      />,
      { width: 72, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain(" 9. ninth");
    expect(frame).toContain("10. tenth");
  });

  test("keeps_decorated_blocks_readable_in_narrow_terminals", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "# Narrow",
          "",
          "---",
          "",
          "```ts title=src/narrow.ts",
          "const narrow = true;",
          "```",
        ].join("\n")}
      />,
      { width: 32, height: 16 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Narrow");
    expect(frame).toContain("╭─ ts");
    expect(frame).toContain("const narrow");
    expect(frame).not.toContain("---");
  });
});
