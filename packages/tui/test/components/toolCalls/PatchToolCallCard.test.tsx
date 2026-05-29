import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { PatchToolCallCard } from "../../../src/components/toolCalls/PatchToolCallCard.tsx";

describe("PatchToolCallCard", () => {
  test("completed_patch_many_shows_changed_file_diffs_without_disclosure", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <PatchToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "patch_many",
          patchTargetText: "2 files",
          changedFileCount: 1,
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
                "+const patchedValue = 2;",
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
    expect(frame).toContain("PatchMany");
    expect(frame).toContain("[2 files]");
    expect(frame).toContain("modified /src/utils.ts (+1 -1)");
    expect(frame).toContain("patchedValue");
  });
});
