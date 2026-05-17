import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { WriteToolCallCard } from "../../../src/components/toolCalls/WriteToolCallCard.tsx";

describe("WriteToolCallCard", () => {
  test("completed_shows_file_path_and_diff", async () => {
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

    expect(frame).toContain("Write");
    expect(frame).toContain("[/src/generated.ts]");
    expect(frame).toContain("+2");
    expect(frame).toContain("export const first");
  });
});
