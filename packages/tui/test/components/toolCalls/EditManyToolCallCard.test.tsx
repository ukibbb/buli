import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { EditManyToolCallCard } from "../../../src/components/toolCalls/EditManyToolCallCard.tsx";

describe("EditManyToolCallCard", () => {
  test("completed_shows_changed_file_diffs_without_disclosure", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EditManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "edit_many",
          editCount: 2,
          editedFileCount: 1,
          addedLineCount: 1,
          removedLineCount: 1,
          changedFiles: [
            {
              filePath: "/src/utils.ts",
              changeKind: "modified",
              addedLineCount: 1,
              removedLineCount: 1,
              unifiedDiffText: [
                "diff --git a/src/utils.ts b/src/utils.ts",
                "--- a/src/utils.ts",
                "+++ b/src/utils.ts",
                "@@ -1,1 +1,1 @@",
                "-const oldValue = 1;",
                "+const editedValue = 2;",
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
    expect(frame).toContain("EditMany");
    expect(frame).toContain("[2 edits]");
    expect(frame).toContain("/src/utils.ts (+1 -1)");
    expect(frame).toContain("editedValue");
  });

  test("completed_legacy_direct_diff_is_not_truncated", async () => {
    const addedDiffLines = Array.from({ length: 55 }, (_, index) => `+edit-many-line-${String(index + 1).padStart(3, "0")}`);
    const { captureCharFrame, renderOnce } = await testRender(
      <EditManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "edit_many",
          editCount: 2,
          editedFileCount: 1,
          addedLineCount: 55,
          removedLineCount: 0,
          changedFiles: [
            {
              filePath: "/src/generated.ts",
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
        }}
      />,
      { width: 110, height: 80 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("showing first");
    expect(frame).toContain("edit-many-line-050");
    expect(frame).toContain("edit-many-line-055");
  });
});
