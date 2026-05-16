import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ExplorerToolCallCard } from "../../../src/components/toolCalls/ExplorerToolCallCard.tsx";

describe("ExplorerToolCallCard (opentui)", () => {
  test("streaming renders Explorer label, bracketed description, and exploring status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "map runtime",
        }}
        renderState="streaming"
      />,
      { width: 120, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Explorer");
    expect(frame).toContain("[map runtime]");
    expect(frame).toContain("exploring");
  });

  test("streaming renders nested Explorer child activity", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "map docs",
          explorationChildToolCalls: [
            {
              explorerChildToolCallId: "call-read-1",
              explorerChildToolCallStatus: "running",
              explorerChildToolCallStartedAtMs: 1,
              explorerChildToolCallDetail: {
                toolName: "read",
                readFilePath: "README.md",
              },
            },
          ],
        }}
        renderState="streaming"
      />,
      { width: 120, height: 16 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("activity");
    expect(frame).toContain("Read");
    expect(frame).toContain("README.md");
    expect(frame).toContain("reading");
  });

  test("completed renders prompt, result, and duration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "summarize runtime",
          explorationPrompt: "Inspect packages/engine/src/runtime.ts.",
          explorationResultSummary: "Runtime starts provider turns and dispatches tool calls.",
        }}
        renderState="completed"
        durationMs={1200}
      />,
      { width: 120, height: 14 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Explorer");
    expect(frame).toContain("Inspect packages/engine");
    expect(frame).toContain("result");
    expect(frame).toContain("Runtime starts");
    expect(frame).toContain("1.2s");
  });

  test("completed renders nested Explorer child activity and result", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "summarize docs",
          explorationPrompt: "Read README.md.",
          explorationChildToolCalls: [
            {
              explorerChildToolCallId: "call-read-1",
              explorerChildToolCallStatus: "completed",
              explorerChildToolCallStartedAtMs: 1,
              explorerChildToolCallDurationMs: 15,
              explorerChildToolCallDetail: {
                toolName: "read",
                readFilePath: "README.md",
                readLineCount: 2,
              },
            },
          ],
          explorationResultSummary: "README.md explains the project.",
        }}
        renderState="completed"
      />,
      { width: 120, height: 22 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("activity");
    expect(frame).toContain("Read");
    expect(frame).toContain("README.md");
    expect(frame).toContain("2 lines");
    expect(frame).toContain("README.md explains");
  });

  test("failed renders Explorer label and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{ toolName: "explore", explorationDescription: "map runtime" }}
        renderState="failed"
        errorText="explorer crashed"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Explorer");
    expect(frame).toContain("[map runtime]");
    expect(frame).toContain("crashed");
  });
});
