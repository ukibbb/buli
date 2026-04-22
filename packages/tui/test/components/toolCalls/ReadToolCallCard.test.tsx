import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
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
    expect(frame).toContain("[/src/app.ts]");
    expect(frame).toContain("42 lines");
    expect(frame).toContain("import React");
  });

  test("streaming_renders_bracketed_path_and_reading_status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "packages/tui/src/App.tsx",
        }}
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[packages/tui/src/App.tsx]");
    expect(frame).toContain("reading");
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
    expect(frame).toContain("[/missing.ts]");
    expect(frame).toContain("file not found");
  });
});
