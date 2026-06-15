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

  test("completed_patch_diff_is_not_truncated_and_has_no_disclosure", async () => {
    const addedDiffLines = Array.from({ length: 55 }, (_, index) => `+patch-line-${String(index + 1).padStart(3, "0")}`);
    const { captureCharFrame, renderOnce } = await testRender(
      <PatchToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "patch",
          patchTargetText: "src/generated.ts",
          changedFileCount: 1,
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
      { width: 100, height: 80 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("[+]");
    expect(frame).not.toContain("[-]");
    expect(frame).not.toContain("showing first");
    expect(frame).toContain("patch-line-050");
    expect(frame).toContain("patch-line-055");
  });
});
