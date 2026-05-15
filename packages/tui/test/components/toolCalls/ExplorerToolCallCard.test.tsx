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
