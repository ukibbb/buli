import { describe, expect, test } from "bun:test";
import type { CapturedFrame, RGBA } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ReadManyToolCallCard } from "../../../src/components/toolCalls/ReadManyToolCallCard.tsx";

const readManySeparatorProbeText = "─".repeat(8);

function formatCapturedColorAsHex(capturedColor: RGBA): string {
  const [red, green, blue] = capturedColor.toInts();
  const formatChannel = (channel: number): string => channel.toString(16).padStart(2, "0").toUpperCase();
  return `#${formatChannel(red)}${formatChannel(green)}${formatChannel(blue)}`;
}

function listForegroundColorsForRenderedText(capturedFrame: CapturedFrame, renderedText: string): string[] {
  const foregroundColors: string[] = [];
  for (const capturedLine of capturedFrame.lines) {
    for (const capturedSpan of capturedLine.spans) {
      if (capturedSpan.text.includes(renderedText)) {
        foregroundColors.push(formatCapturedColorAsHex(capturedSpan.fg));
      }
    }
  }

  return foregroundColors;
}

describe("ReadManyToolCallCard", () => {
  test("completed_starts_collapsed_with_batch_summary", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read_many",
          requestedReadTargetPaths: ["README.md", "missing.txt"],
          completedReadCount: 1,
          failedReadCount: 1,
          readResults: [
            {
              readStatus: "completed",
              readDetail: {
                toolName: "read",
                readFilePath: "README.md",
                readLineCount: 1,
                returnedLineCount: 1,
                previewLines: [{ lineNumber: 1, lineText: "# Project" }],
              },
            },
            {
              readStatus: "failed",
              readDetail: { toolName: "read", readFilePath: "missing.txt" },
              failureExplanation: "File not found: missing.txt",
            },
          ],
        }}
      />,
      { width: 90, height: 18 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("ReadMany");
    expect(frame).not.toContain("Read Many");
    expect(frame).toContain("[2 paths]");
    expect(frame).toContain("1/2 read, 1 failed");
    expect(frame).not.toContain("# Project");
    expect(frame).not.toContain("File not found");
  });

  test("completed_expands_child_previews_and_failures", async () => {
    const { captureCharFrame, captureSpans, mockMouse, renderOnce } = await testRender(
      <ReadManyToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "read_many",
          requestedReadTargetPaths: ["README.md", "missing.txt"],
          completedReadCount: 1,
          failedReadCount: 1,
          readResults: [
            {
              readStatus: "completed",
              readDetail: {
                toolName: "read",
                readFilePath: "README.md",
                readLineCount: 1,
                returnedLineCount: 1,
                previewLines: [{ lineNumber: 1, lineText: "# Project" }],
              },
            },
            {
              readStatus: "failed",
              readDetail: { toolName: "read", readFilePath: "missing.txt" },
              failureExplanation: "File not found: missing.txt",
            },
          ],
        }}
      />,
      { width: 100, height: 24 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("1. README.md - completed");
    expect(frame).toContain("Project");
    expect(frame).toContain(readManySeparatorProbeText);
    expect(frame).toContain("2. missing.txt - failed");
    expect(frame).toContain("File not found: missing.txt");
    expect(listForegroundColorsForRenderedText(captureSpans(), readManySeparatorProbeText)).toContain(
      chatScreenTheme.accentGreen.toUpperCase(),
    );
  });

  test("streaming_shows_path_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReadManyToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "read_many",
          requestedReadTargetPaths: ["README.md", "package.json", "bun.lock"],
        }}
      />,
      { width: 90, height: 10 },
    );
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[3 paths]");
    expect(frame).toContain("reading 3 paths");
  });
});
