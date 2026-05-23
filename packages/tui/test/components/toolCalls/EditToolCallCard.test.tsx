import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { EditToolCallCard } from "../../../src/components/toolCalls/EditToolCallCard.tsx";
import { ApprovalDecisionControl } from "../../../src/components/primitives/ApprovalDecisionControl.tsx";

function findRenderedLineContaining(frame: string, targetText: string): string {
  const renderedLine = frame.split("\n").find((line) => line.includes(targetText));
  if (!renderedLine) {
    throw new Error(`expected rendered frame to contain ${targetText}`);
  }
  return renderedLine;
}

describe("EditToolCallCard", () => {
  test("completed_shows_file_path_and_diff", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <EditToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "edit",
          editedFilePath: "/src/utils.ts",
          addedLineCount: 3,
          removedLineCount: 1,
          unifiedDiffText: [
            "diff --git a/src/utils.ts b/src/utils.ts",
            "--- a/src/utils.ts",
            "+++ b/src/utils.ts",
            "@@ -5,1 +5,1 @@",
            "-const old = 1;",
            "+const newer = 2;",
            "",
          ].join("\n"),
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("Edit");
    expect(collapsedFrame).toContain("[/src/utils.ts]");
    expect(collapsedFrame).toContain("+3");
    expect(collapsedFrame).toContain("−1");
    expect(collapsedFrame).not.toContain("const newer");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("const newer");
  });

  test("completed_prefers_actual_workspace_patch_over_prepared_diff", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <EditToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "edit",
          editedFilePath: "/src/utils.ts",
          addedLineCount: 99,
          removedLineCount: 88,
          unifiedDiffText: [
            "diff --git a/src/utils.ts b/src/utils.ts",
            "--- a/src/utils.ts",
            "+++ b/src/utils.ts",
            "@@ -1,1 +1,1 @@",
            "-const fallbackOld = 1;",
            "+const fallbackNew = 2;",
            "",
          ].join("\n"),
        }}
        workspacePatch={{
          workspacePatchId: "patch-1",
          toolCallId: "call-edit-1",
          capturedAtMs: 1,
          baselineSnapshotHash: "before",
          resultingSnapshotHash: "after",
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
                "-const actualOld = 1;",
                "+const actualNew = 2;",
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
    expect(collapsedFrame).toContain("+1");
    expect(collapsedFrame).toContain("-1");
    expect(collapsedFrame).not.toContain("+99");
    expect(collapsedFrame).not.toContain("−88");
    expect(collapsedFrame).not.toContain("actualNew");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("M /src/utils.ts (+1 -1)");
    expect(expandedFrame).toContain("actualNew");
    expect(expandedFrame).not.toContain("fallbackNew");
  });

  test("streaming_shows_amber_state", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EditToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "edit",
          editedFilePath: "/src/foo.ts",
        }}
      />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("Edit");
    expect(frame).toContain("[/src/foo.ts]");
    expect(frame).toContain("◆");
    expect(frame).not.toContain("editing");
  });

  test("pending_approval_shows_decision_buttons_on_the_edit_header_row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EditToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "edit",
          editedFilePath: "packages/engine/test/systemPrompt.test.ts",
        }}
        approvalDecisionControl={<ApprovalDecisionControl onApprove={() => {}} onDeny={() => {}} />}
      />,
      { width: 120, height: 6 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    const editHeaderLine = findRenderedLineContaining(frame, "Edit");
    expect(editHeaderLine).toContain("packages/engine/test/systemPrompt.test.ts");
    expect(editHeaderLine).toContain("Yes");
    expect(editHeaderLine).toContain("No");
    expect(frame).not.toContain("This edit will modify");
    expect(frame).not.toContain("Review");
  });

  test("failed_shows_error_state", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <EditToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "edit",
          editedFilePath: "/src/locked.ts",
        }}
        errorText="permission denied"
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[/src/locked.ts]");
    expect(frame).toContain("permission denied");
  });
});
