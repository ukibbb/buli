import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { WriteToolCallCard } from "../../../src/components/toolCalls/WriteToolCallCard.tsx";

describe("WriteToolCallCard", () => {
  test("completed_shows_file_path_and_diff", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <WriteToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "write",
          writtenFilePath: "/src/generated.ts",
          addedLineCount: 2,
          removedLineCount: 0,
          unifiedDiffText: [
            "diff --git a/src/generated.ts b/src/generated.ts",
            "--- a/src/generated.ts",
            "+++ b/src/generated.ts",
            "@@ -0,0 +1,2 @@",
            "+export const first = 1;",
            "+export const second = 2;",
            "",
          ].join("\n"),
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const collapsedFrame = captureCharFrame();

    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("Write");
    expect(collapsedFrame).toContain("[/src/generated.ts]");
    expect(collapsedFrame).toContain("+2");
    expect(collapsedFrame).not.toContain("export const first");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("export const first");
  });

  test("completed_prefers_actual_workspace_patch_over_prepared_diff", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <WriteToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "write",
          writtenFilePath: "/src/generated.ts",
          addedLineCount: 99,
          removedLineCount: 0,
          unifiedDiffText: [
            "diff --git a/src/generated.ts b/src/generated.ts",
            "--- a/src/generated.ts",
            "+++ b/src/generated.ts",
            "@@ -0,0 +1,1 @@",
            "+export const fallback = true;",
            "",
          ].join("\n"),
        }}
        workspacePatch={{
          workspacePatchId: "patch-1",
          toolCallId: "call-write-1",
          capturedAtMs: 1,
          baselineSnapshotHash: "before",
          resultingSnapshotHash: "after",
          changedFileCount: 1,
          addedLineCount: 2,
          removedLineCount: 0,
          changedFiles: [
            {
              filePath: "/src/generated.ts",
              changeKind: "added",
              addedLineCount: 2,
              removedLineCount: 0,
              unifiedDiffText: [
                "diff --git a/src/generated.ts b/src/generated.ts",
                "--- a/src/generated.ts",
                "+++ b/src/generated.ts",
                "@@ -0,0 +1,2 @@",
                "+export const actual = true;",
                "+export const value = 1;",
                "",
              ].join("\n"),
            },
          ],
        }}
      />,
      { width: 90, height: 20 },
    );

    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("+2");
    expect(collapsedFrame).toContain("-0");
    expect(collapsedFrame).not.toContain("+99");
    expect(collapsedFrame).not.toContain("actual");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("A /src/generated.ts (+2 -0)");
    expect(expandedFrame).toContain("actual");
    expect(expandedFrame).not.toContain("fallback");
  });
});
