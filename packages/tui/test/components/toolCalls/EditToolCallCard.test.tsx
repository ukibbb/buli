import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { EditToolCallCard } from "../../../src/components/toolCalls/EditToolCallCard.tsx";

describe("EditToolCallCard", () => {
  test("completed_shows_file_path_and_diff", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
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
    const frame = captureCharFrame();
    expect(frame).toContain("Edit");
    expect(frame).toContain("[/src/utils.ts]");
    expect(frame).toContain("+3");
    expect(frame).toContain("−1");
    expect(frame).toContain("const newer");
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
    expect(frame).toContain("Edit");
    expect(frame).toContain("[/src/foo.ts]");
    expect(frame).toContain("editing");
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
    expect(frame).toContain("[/src/locked.ts]");
    expect(frame).toContain("permission denied");
  });
});
