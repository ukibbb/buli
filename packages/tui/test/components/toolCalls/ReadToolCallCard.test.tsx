import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ReadToolCallCard } from "../../../src/components/toolCalls/ReadToolCallCard.tsx";

async function renderSettledMarkdownFrame(renderOnce: () => Promise<void>): Promise<void> {
  await renderOnce();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await renderOnce();
}

describe("ReadToolCallCard", () => {
  test("completed_starts_collapsed_with_read_range_summary", async () => {
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("[/src/app.ts]");
    expect(frame).toContain("1-42:42");
    expect(frame).not.toContain("lines");
    expect(frame).not.toContain("1.0 KB");
    expect(frame).not.toContain("Read line 1 of 42 from /src/app.ts");
    expect(frame).not.toContain("click to show content");
    expect(frame).not.toContain("import React");
  });

  test("completed_expands_read_content_when_summary_is_clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "/src/app.ts",
          readLineCount: 42,
          returnedLineCount: 2,
          previewLines: [
            { lineNumber: 2, lineText: "import React from 'react';" },
            { lineNumber: 3, lineText: "export function App() {}" },
          ],
        }}
      />,
      { width: 90, height: 20 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("[+]");
    expect(captureCharFrame()).not.toContain("import React");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("2-3:42");
    expect(frame).not.toContain("click to hide content");
    expect(frame).toContain("import React");
    expect(frame).toContain("export function App");
  });

  test("completed_expands_complete_markdown_read_as_rendered_markdown", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "README.md",
          readLineCount: 4,
          returnedLineCount: 4,
          previewLines: [
            { lineNumber: 1, lineText: "# Project" },
            { lineNumber: 2, lineText: "" },
            { lineNumber: 3, lineText: "- Install" },
            { lineNumber: 4, lineText: "Use `bun test`." },
          ],
        }}
      />,
      { width: 90, height: 20 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("Project");
    expect(frame).toContain("Install");
    expect(frame).toContain("bun test");
    expect(frame).toContain("▌ Project");
    expect(frame).not.toContain("# Project");
    expect(frame).not.toContain("`bun test`");
  });

  test("completed_keeps_partial_markdown_read_as_source_text", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "README.md",
          readLineCount: 10,
          returnedLineCount: 2,
          previewLines: [
            { lineNumber: 4, lineText: "# Partial section" },
            { lineNumber: 5, lineText: "- raw item" },
          ],
        }}
      />,
      { width: 90, height: 16 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const frame = captureCharFrame();
    expect(frame).toContain("# Partial section");
    expect(frame).toContain("- raw item");
  });

  test("completed_expands_unknown_filetypes_as_plain_source", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "notes.customtype",
          readLineCount: 1,
          returnedLineCount: 1,
          previewLines: [
            { lineNumber: 1, lineText: "plain source text" },
          ],
        }}
      />,
      { width: 90, height: 10 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    expect(captureCharFrame()).toContain("plain source text");
  });

  test("completed_shows_returned_read_range", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "long.txt",
          readLineCount: 3,
          returnedLineCount: 2,
          wasLineCountTruncated: true,
          previewLines: [
            { lineNumber: 1, lineText: "x".repeat(20) },
            { lineNumber: 2, lineText: "second" },
          ],
        }}
      />,
      { width: 100, height: 16 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("1-2:3");
    expect(frame).not.toContain("lines");
    expect(frame).not.toContain("truncated");
  });

  test("streaming_renders_bracketed_path_and_pending_status", async () => {
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("[packages/tui/src/App.tsx]");
    expect(frame).toContain("◆");
    expect(frame).toContain("reading");
  });

  test("streaming_wraps_long_path_when_the_terminal_is_narrow", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "packages/tui/src/components/ConversationMessageList.tsx",
        }}
      />,
      { width: 48, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame.replace(/[\s┃]/g, "")).toContain("packages/tui/src/components/ConversationMessageList.tsx");
    expect(frame.split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThan(1);
    expect(frame).not.toContain("...");
    expect(frame).toContain("◆");
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("[/missing.ts]");
    expect(frame).toContain("file not found");
  });
});
