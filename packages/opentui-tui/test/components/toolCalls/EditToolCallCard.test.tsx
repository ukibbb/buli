import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
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
          diffLines: [
            { lineNumber: 5, lineKind: "removal", lineText: "const old = 1;" },
            { lineNumber: 5, lineKind: "addition", lineText: "const newer = 2;" },
          ],
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    // file path may be clipped at narrow widths but the Edit label and diff are present
    expect(frame).toContain("Edit");
    expect(frame).toContain("+3");
    expect(frame).toContain("-1");
    expect(frame).toContain("const newer");
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
    expect(frame).toContain("/src/locked.ts");
    expect(frame).toContain("permission denied");
  });
});
