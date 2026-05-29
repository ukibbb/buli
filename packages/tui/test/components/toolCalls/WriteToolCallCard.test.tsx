import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { WriteToolCallCard } from "../../../src/components/toolCalls/WriteToolCallCard.tsx";

describe("WriteToolCallCard", () => {
  test("completed_shows_file_path_and_diff_without_disclosure", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
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
    const frame = captureCharFrame();

    expect(frame).not.toContain("[+]");
    expect(frame).not.toContain("[-]");
    expect(frame).toContain("Write");
    expect(frame).toContain("[/src/generated.ts]");
    expect(frame).toContain("+2");
    expect(frame).toContain("export const first");
  });

  test("completed_prefers_actual_workspace_patch_over_prepared_diff", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
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
    const frame = captureCharFrame();
    expect(frame).not.toContain("[+]");
    expect(frame).not.toContain("[-]");
    expect(frame).toContain("+2");
    expect(frame).toContain("-0");
    expect(frame).not.toContain("+99");
    expect(frame).toContain("A /src/generated.ts (+2 -0)");
    expect(frame).toContain("actual");
    expect(frame).not.toContain("fallback");
  });
});
