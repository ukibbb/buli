import { describe, expect, test } from "bun:test";
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
    expect(frame).toContain("[**/*.ts]");
    expect(frame).toContain("searching");
  });

  test("completed_shows_match_count_and_paths", async () => {
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
    expect(frame).toContain("[*.ts]");
    expect(frame).toContain("2 paths");
    expect(frame).toContain("src/app.ts");
  });

  test("completed_shows_returned_and_total_counts_when_truncated", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <GlobToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "**/*.ts",
          matchedPathCount: 105,
          returnedPathCount: 100,
          wasTruncated: true,
          matchedPaths: ["src/app.ts"],
        }}
      />,
      { width: 100, height: 12 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("100 of 105 paths");
    expect(frame).toContain("truncated");
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
    expect(frame).toContain("[**/*.ts]");
    expect(frame).toContain("glob failed");
  });
});
