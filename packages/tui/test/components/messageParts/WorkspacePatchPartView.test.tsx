import { describe, expect, test } from "bun:test";
import { WorkspacePatchPartView } from "../../../src/components/messageParts/WorkspacePatchPartView.tsx";
import { testRender } from "../../testRenderWithCleanup.ts";

describe("WorkspacePatchPartView", () => {
  test("renders_compact_header_and_single_per_file_diff_summary", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <WorkspacePatchPartView
        assistantWorkspacePatchConversationMessagePart={{
          id: "workspace-patch-part-1",
          partKind: "assistant_workspace_patch",
          workspacePatch: {
            workspacePatchId: "patch-1",
            toolCallId: "tool-1",
            capturedAtMs: 1,
            baselineSnapshotHash: "before",
            resultingSnapshotHash: "after",
            changedFileCount: 1,
            addedLineCount: 2,
            removedLineCount: 1,
            changedFiles: [
              {
                filePath: "packages/engine/src/systemPrompt.ts",
                changeKind: "modified",
                addedLineCount: 2,
                removedLineCount: 1,
                unifiedDiffText: [
                  "diff --git a/packages/engine/src/systemPrompt.ts b/packages/engine/src/systemPrompt.ts",
                  "--- a/packages/engine/src/systemPrompt.ts",
                  "+++ b/packages/engine/src/systemPrompt.ts",
                  "@@ -1,2 +1,3 @@",
                  " const existing = true;",
                  "-const oldRule = false;",
                  "+const newRule = true;",
                  "+const evidence = true;",
                  "",
                ].join("\n"),
              },
            ],
          },
        }}
      />,
      { width: 120, height: 18 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    const headerLine = frame.split("\n").find((line) => line.includes("workspace patch")) ?? "";
    expect(headerLine).toContain("1 file");
    expect(headerLine).toContain("+2");
    expect(headerLine).toContain("-1");
    expect(frame.match(/M packages\/engine\/src\/systemPrompt\.ts \(\+2 -1\)/g)).toHaveLength(1);
    expect(frame).toContain("newRule");
    expect(frame).toContain("oldRule");
  });

  test("renders_large_workspace_patch_diffs_without_truncation", async () => {
    const addedDiffLines = Array.from({ length: 55 }, (_, index) => `+workspace-line-${String(index + 1).padStart(3, "0")}`);
    const { captureCharFrame, renderOnce } = await testRender(
      <WorkspacePatchPartView
        assistantWorkspacePatchConversationMessagePart={{
          id: "workspace-patch-part-large",
          partKind: "assistant_workspace_patch",
          workspacePatch: {
            workspacePatchId: "patch-large",
            toolCallId: "tool-large",
            capturedAtMs: 1,
            baselineSnapshotHash: "before",
            resultingSnapshotHash: "after",
            changedFileCount: 1,
            addedLineCount: 55,
            removedLineCount: 0,
            changedFiles: [
              {
                filePath: "src/generated.ts",
                changeKind: "modified",
                addedLineCount: 55,
                removedLineCount: 0,
                unifiedDiffText: [
                  "diff --git a/src/generated.ts b/src/generated.ts",
                  "--- a/src/generated.ts",
                  "+++ b/src/generated.ts",
                  "@@ -0,0 +1,55 @@",
                  ...addedDiffLines,
                  "",
                ].join("\n"),
              },
            ],
          },
        }}
      />,
      { width: 100, height: 80 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).not.toContain("showing first");
    expect(frame).toContain("workspace-line-050");
    expect(frame).toContain("workspace-line-055");
  });
});
