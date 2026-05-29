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
});
