import { describe, expect, test } from "bun:test";
import { RGBA, SyntaxStyle, type MarkdownRenderable } from "@opentui/core";
import { act, useRef, useState } from "react";
import { AssistantMarkdownBlock } from "../../../src/components/primitives/AssistantMarkdownBlock.tsx";
import { testRender } from "../../testRenderWithCleanup.ts";

const markdownStreamingStabilitySyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#E5E7EB") },
});

async function renderSettledMarkdownFrame(renderOnce: () => Promise<void>): Promise<void> {
  await renderOnce();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await renderOnce();
}

describe("AssistantMarkdownBlock", () => {
  test("OpenTUI_top_level_markdown_reuses_stable_blocks_while_streaming_tail_changes", async () => {
    let updateMarkdownContent: ((nextMarkdownText: string) => void) | undefined;
    let readMarkdownRenderable: (() => MarkdownRenderable | null) | undefined;

    function NativeMarkdownStreamingStabilityProbe() {
      const markdownRef = useRef<MarkdownRenderable | null>(null);
      const [markdownContent, setMarkdownContent] = useState(
        ["First stable block", "", "Second stable block", "", "Streaming tail"].join("\n"),
      );
      updateMarkdownContent = (nextMarkdownText) => setMarkdownContent(nextMarkdownText);
      readMarkdownRenderable = () => markdownRef.current;

      return (
        <markdown
          content={markdownContent}
          internalBlockMode="top-level"
          ref={markdownRef}
          streaming={true}
          syntaxStyle={markdownStreamingStabilitySyntaxStyle}
          width="100%"
        />
      );
    }

    const { renderOnce } = await testRender(<NativeMarkdownStreamingStabilityProbe />, { width: 80, height: 12 });
    await renderOnce();

    const readMountedMarkdownRenderable = (): MarkdownRenderable => {
      const markdownRenderable = readMarkdownRenderable?.();
      if (!markdownRenderable) {
        throw new Error("Native markdown renderable was not mounted.");
      }
      return markdownRenderable;
    };
    const updateMountedMarkdownContent = async (nextMarkdownText: string): Promise<void> => {
      if (!updateMarkdownContent) {
        throw new Error("Native markdown content updater was not mounted.");
      }
      const mountedUpdateMarkdownContent = updateMarkdownContent;
      await act(async () => {
        mountedUpdateMarkdownContent(nextMarkdownText);
      });
    };

    const firstStableBlockRenderable = readMountedMarkdownRenderable()._blockStates[0]?.renderable;
    if (!firstStableBlockRenderable) {
      throw new Error("Native markdown did not create the first top-level block.");
    }

    await updateMountedMarkdownContent(
      ["First stable block", "", "Second stable block", "", "Streaming tail keeps growing"].join("\n"),
    );
    await renderOnce();

    const updatedMarkdownRenderable = readMountedMarkdownRenderable();
    expect(updatedMarkdownRenderable._stableBlockCount).toBeGreaterThanOrEqual(1);
    expect(updatedMarkdownRenderable._blockStates[0]?.renderable).toBe(firstStableBlockRenderable);
  });

  test("renders_heading_paragraph_list_and_code_fence_with_native_code_block", async () => {
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

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("▌");
    expect(frame).toContain("Done");
    expect(frame).toContain("Here is");
    expect(frame).toContain("code");
    expect(frame).toContain("first");
    expect(frame).toContain("second");
    expect(frame).not.toContain("ts");
    expect(frame).not.toContain("// ts");
    expect(frame).not.toContain("╰");
    expect(frame).toContain("const x = 1;");
  });

  test("keeps_one_blank_row_between_paragraphs_and_ordered_lists", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["Main risks I see", "", "1. RuntimeConversation loses state", "2. Tests miss coverage"].join("\n")}
      />,
      { width: 80, height: 10 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const renderedRows = captureCharFrame().split("\n");
    const paragraphRowIndex = renderedRows.findIndex((renderedRow) => renderedRow.includes("Main risks I see"));
    const firstListRowIndex = renderedRows.findIndex((renderedRow) => renderedRow.includes("1. RuntimeConversation"));
    expect(paragraphRowIndex).toBeGreaterThanOrEqual(0);
    expect(firstListRowIndex).toBeGreaterThanOrEqual(0);
    expect(firstListRowIndex - paragraphRowIndex).toBeGreaterThanOrEqual(2);
    expect(firstListRowIndex - paragraphRowIndex).toBeLessThanOrEqual(3);
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

    await renderSettledMarkdownFrame(renderOnce);

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

    await renderSettledMarkdownFrame(renderOnce);

    expect(captureCharFrame()).toContain("Still");
  });

  test("conceals_inline_code_and_bold_inside_list_items", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["- Use `read` for files", "1. **Prompt-only tightening**"].join("\n")}
      />,
      { width: 80, height: 10 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("read");
    expect(frame).toContain("Prompt-only tightening");
    expect(frame).not.toContain("`read`");
    expect(frame).not.toContain("**Prompt-only tightening**");
  });

  test("conceals_inline_code_inside_blockquotes", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText="> Use `read` before answering."
      />,
      { width: 80, height: 8 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("read");
    expect(frame).not.toContain("`read`");
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

    await renderSettledMarkdownFrame(renderOnce);

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

    await renderSettledMarkdownFrame(renderOnce);

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
        markdownText="> Keep this constraint visible across wrapped terminal rows so the rail stays full height."
      />,
      { width: 48, height: 10 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    const visibleRows = frame.split("\n").filter((renderedRow) => renderedRow.trim().length > 0);
    expect(frame).toContain("Keep this constraint visible");
    expect(frame).toContain("rail stays full height");
    expect(visibleRows.length).toBeGreaterThanOrEqual(2);
    expect(visibleRows.every((visibleRow) => visibleRow.trimStart().startsWith("│"))).toBe(true);
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

    await renderSettledMarkdownFrame(renderOnce);

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

    await renderSettledMarkdownFrame(renderOnce);

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

    await renderSettledMarkdownFrame(renderOnce);

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

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("- parent");
    expect(frame).toContain("  - child");
    expect(frame).toContain("    - grandchild");
    expect(frame).not.toContain("• parent");
    expect(frame).not.toContain("◦ child");
    expect(frame).not.toContain("▪ grandchild");
  });

  test("renders_partial_diff_fences_as_lightweight_patch_snippets", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["```diff", "@@ -1 +1 @@", "-old line", "+new line", "```"].join("\n")}
      />,
      { width: 96, height: 12 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("patch snippet");
    expect(frame).toContain("@@ -1 +1 @@");
    expect(frame).toContain("-old line");
    expect(frame).toContain("+new line");
    expect(frame).not.toContain("// diff");
    expect(frame).not.toContain("╭");
    expect(frame).not.toContain("diff changes");
  });

  test("renders_bash_fences_as_compact_command_snippets", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["Verification:", "", "```bash", "bun --filter @buli/engine test", "bun --filter @buli/engine typecheck", "```"].join("\n")}
      />,
      { width: 96, height: 12 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("Verification:");
    expect(frame).toContain("$ bun --filter @buli/engine test");
    expect(frame).toContain("$ bun --filter @buli/engine typecheck");
    expect(frame).not.toContain("// bash");
    expect(frame).not.toContain("╭");
  });

  test("renders_raw_unified_diffs_as_structured_diff_blocks", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "Apply this change:",
          "",
          "diff --git a/src/example.ts b/src/example.ts",
          "--- a/src/example.ts",
          "+++ b/src/example.ts",
          "@@ -1,2 +1,2 @@",
          " const stable = true;",
          "-const value = 1;",
          "+const value = 2;",
          "",
          "Then run the tests.",
        ].join("\n")}
      />,
      { width: 96, height: 18 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("Apply this change:");
    expect(frame).toContain("patch");
    expect(frame).toContain("src/example.ts");
    expect(frame).toContain("+1");
    expect(frame).toContain("-1");
    expect(frame).toContain("const value");
    expect(frame).toContain("Then run the tests.");
    expect(frame).not.toContain("diff --git");
    expect(frame).not.toContain("+++ b/src/example.ts");
  });

  test("renders_invalid_raw_diff_blocks_as_diff_snippets_instead_of_prose", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "Malformed but still useful:",
          "",
          "diff --git a/src/loose.ts b/src/loose.ts",
          "@@",
          "+const loose = true;",
          "",
          "Continue after it.",
        ].join("\n")}
      />,
      { width: 96, height: 14 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    const additionLine = frame.split("\n").find((line) => line.includes("const loose")) ?? "";
    expect(frame).toContain("Malformed but still useful:");
    expect(frame).toContain("patch src/loose.ts +1 -0");
    expect(additionLine).toContain("+");
    expect(additionLine).toContain("const loose = true;");
    expect(frame).toContain("Continue after it.");
    expect(frame).not.toContain("// diff");
    expect(frame).not.toContain("diff --git a/src/loose.ts b/src/loose.ts");
    expect(frame).not.toContain("Error parsing diff");
  });

  test("renders_file_backed_invalid_diff_snippets_as_compact_structured_diffs", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "Proposed patch:",
          "",
          "diff --git a/src/example.ts b/src/example.ts",
          "@@",
          "-const removedWidget = 1;",
          "+const addedWidget = 2;",
          "",
          "Done.",
        ].join("\n")}
      />,
      { width: 96, height: 14 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    const removalLine = frame.split("\n").find((line) => line.includes("removedWidget")) ?? "";
    const additionLine = frame.split("\n").find((line) => line.includes("addedWidget")) ?? "";

    expect(frame).toContain("patch src/example.ts +1 -1");
    expect(removalLine).toContain("-");
    expect(additionLine).toContain("+");
    expect(frame).not.toContain("diff --git a/src/example.ts b/src/example.ts");
    expect(frame).not.toContain("@@");
  });

  test("renders_file_labeled_partial_diff_fences_as_file_patches", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={["```diff title=src/example.ts", "@@", "-const removedWidget = 1;", "+const addedWidget = 2;", "```"].join("\n")}
      />,
      { width: 96, height: 12 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    const removalLine = frame.split("\n").find((line) => line.includes("removedWidget")) ?? "";
    const additionLine = frame.split("\n").find((line) => line.includes("addedWidget")) ?? "";
    expect(frame).toContain("patch src/example.ts +1 -1");
    expect(removalLine).toContain("-");
    expect(removalLine).toContain("const removedWidget");
    expect(additionLine).toContain("+");
    expect(additionLine).toContain("const addedWidget");
    expect(frame).not.toContain("patch snippet");
    expect(frame).not.toContain("@@");
  });

  test("renders_fenced_full_unified_diffs_as_structured_diff_blocks", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "```diff",
          "diff --git a/src/fenced.ts b/src/fenced.ts",
          "--- a/src/fenced.ts",
          "+++ b/src/fenced.ts",
          "@@ -1 +1 @@",
          "-oldValue();",
          "+newValue();",
          "```",
        ].join("\n")}
      />,
      { width: 96, height: 12 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("src/fenced.ts");
    expect(frame).toContain("oldValue");
    expect(frame).toContain("newValue");
    expect(frame).not.toContain("diff changes");
    expect(frame).not.toContain("diff --git");
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

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("ts · src/app.ts");
    expect(frame).not.toContain("// ts");
  });

  test("renders_source_labeled_code_fences_with_inline_explanation_comments", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <AssistantMarkdownBlock
        horizontalRuleColor="#10B981"
        isStreaming={false}
        markdownText={[
          "```ts path=\"src/runtime.ts:10-12\"",
          "// explain: The guard decides whether this branch should run.",
          "if (isReady) {",
          "  startRuntime();",
          "}",
          "```",
        ].join("\n")}
      />,
      { width: 96, height: 12 },
    );

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("ts · src/runtime.ts:10-12");
    expect(frame).toContain("// explain: The guard decides whether this branch should run.");
    expect(frame).toContain("startRuntime");
  });

  test("renders_plain_text_fences_as_lightweight_snippets", async () => {
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

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("near-term mantra:");
    expect(frame).toContain("Better tutor behavior.");
    expect(frame).toContain("Better context.");
    expect(frame).not.toContain("╭");
    expect(frame).not.toContain("╰");
    expect(frame).not.toContain("╭─ text");
    expect(frame).not.toContain("┃ Better tutor behavior.");
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

    await renderSettledMarkdownFrame(renderOnce);

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

    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("Narrow");
    expect(frame).toContain("ts · src/narrow.ts");
    expect(frame).not.toContain("// ts");
    expect(frame).toContain("const narrow");
    expect(frame).not.toContain("---");
  });
});
