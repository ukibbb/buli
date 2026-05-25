import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { GlobToolCallCard } from "../../../src/components/toolCalls/GlobToolCallCard.tsx";

describe("GlobToolCallCard", () => {
  test("streaming_shows_bracketed_pattern", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="streaming"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "**/*.ts",
        }}
      />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[**/*.ts]");
    expect(frame).toContain("◆");
    expect(frame).toContain("searching");
  });

  test("completed_starts_collapsed_with_match_summary", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "*.ts",
          matchedPathCount: 2,
          matchedPaths: ["src/app.ts", "src/index.ts"],
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[*.ts]");
    expect(frame).toContain("2 paths");
    expect(frame).not.toContain("2 matched paths for *.ts");
    expect(frame).not.toContain("click to show content");
    expect(frame).not.toContain("src/app.ts");
  });

  test("completed_expands_matched_paths_when_summary_is_clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "*.ts",
          matchedPathCount: 2,
          matchedPaths: ["src/app.ts", "src/index.ts"],
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    expect(captureCharFrame()).not.toContain("src/app.ts");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).not.toContain("click to hide content");
    expect(frame).toContain("src/app.ts");
    expect(frame).toContain("src/index.ts");
  });

  test("completed_expands_all_returned_matched_paths", async () => {
    const matchedPaths = Array.from({ length: 30 }, (_, index) => `src/file-${index + 1}.ts`);
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "src/*.ts",
          matchedPathCount: 30,
          matchedPaths,
        }}
      />,
      { width: 80, height: 40 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("src/file-1.ts");
    expect(frame).toContain("src/file-30.ts");
  });

  test("completed_limits_expanded_returned_paths", async () => {
    const matchedPaths = Array.from({ length: 55 }, (_, index) => `src/file-${index + 1}.ts`);
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "src/*.ts",
          matchedPathCount: 55,
          returnedPathCount: 55,
          matchedPaths,
        }}
      />,
      { width: 90, height: 70 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("showing first 50 of 55 paths");
    expect(frame).toContain("src/file-1.ts");
    expect(frame).toContain("src/file-50.ts");
    expect(frame).not.toContain("src/file-51.ts");
  });

  test("completed_shows_full_match_count", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "**/*.ts",
          matchedPathCount: 105,
          returnedPathCount: 105,
          matchedPaths: ["src/app.ts"],
        }}
      />,
      { width: 100, height: 12 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("105 paths");
    expect(frame).not.toContain("truncated");
  });

  test("failed_shows_error", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "**/*.ts",
        }}
        errorText="glob failed"
      />,
      { width: 80, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("[**/*.ts]");
    expect(frame).toContain("glob failed");
  });
});
