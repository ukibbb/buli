import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TaskToolCallCard } from "../../../src/components/toolCalls/TaskToolCallCard.tsx";

describe("TaskToolCallCard (opentui)", () => {
  test("streaming renders Task label, bracketed description, and dispatched status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "fetch release notes",
        }}
        renderState="streaming"
      />,
      { width: 120, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[fetch release notes]");
    expect(frame).toContain("dispatched");
  });

  test("completed renders Task label, bracketed description, prompt, result, and duration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "summarize the indexer doc",
          subagentPrompt: "Summarize docs/atlas-indexer.md in 3 bullet points.",
          subagentResultSummary: "Walks the project tree, extracts module nodes, upserts to Neo4j.",
        }}
        renderState="completed"
        durationMs={1200}
      />,
      { width: 120, height: 14 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[summarize the indexer doc]");
    expect(frame).toContain("Summarize");
    expect(frame).toContain("result");
    expect(frame).toContain("Walks");
    expect(frame).toContain("1.2s");
  });

  test("completed with sub-1000ms duration shows ms suffix", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "quick check",
        }}
        renderState="completed"
        durationMs={42}
      />,
      { width: 120, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[quick check]");
    expect(frame).toContain("42ms");
  });

  test("failed renders Task label, bracketed description, and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{ toolName: "task", subagentDescription: "run migration" }}
        renderState="failed"
        errorText="sub-agent crashed"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[run migration]");
    expect(frame).toContain("crashed");
  });
});
