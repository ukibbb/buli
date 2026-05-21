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
});
