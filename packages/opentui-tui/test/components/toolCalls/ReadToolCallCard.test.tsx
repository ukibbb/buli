import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { ReadToolCallCard } from "../../../src/components/toolCalls/ReadToolCallCard.tsx";

describe("ReadToolCallCard", () => {
  test("completed_shows_file_path_and_line_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "/src/app.ts",
          readLineCount: 42,
          readByteCount: 1024,
          previewLines: [
            { lineNumber: 1, lineText: "import React from 'react';" },
          ],
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("/src/app.ts");
    expect(frame).toContain("42 lines");
    expect(frame).toContain("import React");
  });

  test("failed_shows_error_state", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "/missing.ts",
        }}
        errorText="file not found"
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("/missing.ts");
    expect(frame).toContain("file not found");
  });
});
