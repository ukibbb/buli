import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import {
  DiffBlock,
  buildVisibleUnifiedDiffContent,
  resolveOpenTuiDiffFiletype,
} from "../../../src/components/primitives/DiffBlock.tsx";

function joinUnifiedDiffLines(unifiedDiffLines: readonly string[]): string {
  return unifiedDiffLines.join("\n");
}

describe("DiffBlock", () => {
  test("renders_addition_removal_and_context_lines", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -1,2 +1,2 @@",
            " context line",
            "-removed line",
            "+added line",
            "",
          ])
        }
      />,
      { width: 60, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("+");
    expect(frame).toContain("-");
    expect(frame).toContain("added line");
    expect(frame).toContain("removed line");
    expect(frame).toContain("context line");
  });

  test("keeps_line_number_sigil_and_code_on_one_row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/ChatScreen.tsx b/src/ChatScreen.tsx",
            "--- a/src/ChatScreen.tsx",
            "+++ b/src/ChatScreen.tsx",
            "@@ -702,1 +53,1 @@",
            "-<LegacyTranscriptPlaceholder ... />",
            "+import { ConversationMessageList } from './components/ConversationMessageList.tsx';",
            "",
          ])
        }
      />,
      { width: 96, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const additionLine = frame.split("\n").find((line) => line.includes("ConversationMessageList"));
    const removalLine = frame.split("\n").find((line) => line.includes("LegacyTranscriptPlaceholder"));

    expect(additionLine).toBeDefined();
    expect(additionLine ?? "").toContain("53");
    expect(additionLine ?? "").toContain("+");
    expect(removalLine).toBeDefined();
    expect(removalLine ?? "").toContain("702");
    expect(removalLine ?? "").toContain("-");
  });

  test("wraps_long_code_lines_and_keeps_full_content_visible", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/ChatScreen.tsx b/src/ChatScreen.tsx",
            "--- a/src/ChatScreen.tsx",
            "+++ b/src/ChatScreen.tsx",
            "@@ -0,0 +53,1 @@",
            "+import ConversationMessageList from './components/ConversationMessageList.tsx';",
            "",
          ])
        }
      />,
      { width: 42, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const importLine = frame.split("\n").find((line) => line.includes("import")) ?? "";

    expect(importLine).toContain("53");
    expect(importLine).toContain("+");
    expect(frame.replace(/\s/g, "")).toContain("components/ConversationMessageList.tsx");
  });

  test("renders_later_diff_rows_after_wrapped_long_rows", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/ChatScreen.tsx b/src/ChatScreen.tsx",
            "--- a/src/ChatScreen.tsx",
            "+++ b/src/ChatScreen.tsx",
            "@@ -0,0 +53,2 @@",
            "+import ConversationMessageList from './components/ConversationMessageList.tsx';",
            "+later visible row",
            "",
          ])
        }
      />,
      { width: 42, height: 12 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame.replace(/\s/g, "")).toContain("components/ConversationMessageList.tsx");
    expect(frame).toContain("later visible row");
  });

  test("renders_all_diff_rows", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -0,0 +1,4 @@",
            "+visible one",
            "+visible two",
            "+hidden one",
            "+hidden two",
            "",
          ])
        }
      />,
      { width: 80, height: 12 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("visible one");
    expect(frame).toContain("visible two");
    expect(frame).toContain("hidden one");
    expect(frame).toContain("hidden two");
    expect(frame).not.toContain("showing first");
  });

  test("limits_large_diff_blocks_with_a_visible_notice", async () => {
    const addedDiffLines = Array.from({ length: 55 }, (_, index) => `+diff-line-${String(index + 1).padStart(3, "0")}`);
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -0,0 +1,55 @@",
            ...addedDiffLines,
            "",
          ])
        }
      />,
      { width: 80, height: 60 },
    );
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("showing first 50 of 55 diff lines");
    expect(frame).toContain("diff-line-050");
    expect(frame).not.toContain("diff-line-051");
    expect(frame).not.toContain("Error parsing diff");
  });

  test("rewrites_truncated_hunk_counts_to_match_visible_diff_rows", () => {
    const contextDiffLines = Array.from(
      { length: 55 },
      (_, index) => ` context-line-${String(index + 1).padStart(3, "0")}`,
    );

    const visibleUnifiedDiffContent = buildVisibleUnifiedDiffContent(
      joinUnifiedDiffLines([
        "diff --git a/src/example.ts b/src/example.ts",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1,55 +1,55 @@",
        ...contextDiffLines,
        "",
      ]),
    );

    expect(visibleUnifiedDiffContent.totalRenderableRowCount).toBe(55);
    expect(visibleUnifiedDiffContent.visibleRenderableRowCount).toBe(50);
    expect(visibleUnifiedDiffContent.visibleUnifiedDiffText).toContain("@@ -1,50 +1,50 @@");
    expect(visibleUnifiedDiffContent.visibleUnifiedDiffText).toContain(" context-line-050");
    expect(visibleUnifiedDiffContent.visibleUnifiedDiffText).not.toContain(" context-line-051");
    expect(visibleUnifiedDiffContent.visibleUnifiedDiffText).not.toContain("@@ -1,55 +1,55 @@");
  });

  test("compact_mode_keeps_change_signs_and_line_numbers_for_visual_diff", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <DiffBlock
        density="compact"
        filePath="src/example.ts"
        unifiedDiffText={
          joinUnifiedDiffLines([
            "diff --git a/src/example.ts b/src/example.ts",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -7,1 +11,1 @@",
            "-const removedWidget = false;",
            "+const addedWidget = true;",
            "",
          ])
        }
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const removalLine = frame.split("\n").find((line) => line.includes("removedWidget")) ?? "";
    const additionLine = frame.split("\n").find((line) => line.includes("addedWidget")) ?? "";

    expect(removalLine).toContain("-");
    expect(removalLine).toContain("7");
    expect(additionLine).toContain("+");
    expect(additionLine).toContain("11");
    expect(frame).not.toContain("showing first");
  });

  test("resolves_filetype_from_changed_file_path_for_syntax_highlighting", () => {
    expect(resolveOpenTuiDiffFiletype("packages/tui/src/components/App.tsx")).toBe("typescriptreact");
    expect(resolveOpenTuiDiffFiletype("Dockerfile")).toBe("dockerfile");
    expect(resolveOpenTuiDiffFiletype(undefined)).toBe("text");
  });
});
