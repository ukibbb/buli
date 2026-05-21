import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { DiffBlock, resolveOpenTuiDiffFiletype } from "../../../src/components/primitives/DiffBlock.tsx";

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

  test("truncates_long_code_lines_instead_of_wrapping_them", async () => {
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
      { width: 42, height: 5 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const renderedLinesWithCode = frame
      .split("\n")
      .filter((line) => line.includes("import"));

    expect(renderedLinesWithCode).toHaveLength(1);
    expect(renderedLinesWithCode[0] ?? "").toContain("53");
    expect(renderedLinesWithCode[0] ?? "").toContain("+");
    expect(frame).not.toContain("components/ConversationMessageList.tsx");
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
  });

  test("resolves_filetype_from_changed_file_path_for_syntax_highlighting", () => {
    expect(resolveOpenTuiDiffFiletype("packages/tui/src/components/App.tsx")).toBe("typescriptreact");
    expect(resolveOpenTuiDiffFiletype("Dockerfile")).toBe("dockerfile");
    expect(resolveOpenTuiDiffFiletype(undefined)).toBe("text");
  });
});
