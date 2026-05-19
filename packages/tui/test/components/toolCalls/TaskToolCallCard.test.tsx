import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TaskToolCallCard } from "../../../src/components/toolCalls/TaskToolCallCard.tsx";

async function renderSettledMarkdownFrame(renderOnce: () => Promise<void>): Promise<void> {
  await renderOnce();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await renderOnce();
}

describe("TaskToolCallCard (opentui)", () => {
  test("streaming renders Task label, bracketed description, and running status", async () => {
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
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[fetch release notes]");
    expect(frame).toContain("running");
  });

  test("completed renders Task label, bracketed description, prompt, result, and duration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "summarize the indexer doc",
          subagentPrompt: "Summarize docs/atlas-indexer.md in 3 bullet points.",
          subagentResultSummary: "Use `read`, then **summarize** the project tree.",
        }}
        renderState="completed"
        durationMs={1200}
      />,
      { width: 120, height: 14 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[summarize the indexer doc]");
    expect(frame).toContain("Summarize");
    expect(frame).toContain("result");
    expect(frame).toContain("read");
    expect(frame).toContain("summarize");
    expect(frame).not.toContain("`read`");
    expect(frame).not.toContain("**summarize**");
    expect(frame).toContain("1.2s");
  });

  test("completed limits long prompt and result sections", async () => {
    const longSubagentPrompt = Array.from({ length: 30 }, (_, index) => `prompt line ${index + 1}`).join("\n");
    const longSubagentResultSummary = Array.from({ length: 30 }, (_, index) => `result line ${index + 1}`).join("\n");
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "large subagent result",
          subagentPrompt: longSubagentPrompt,
          subagentResultSummary: longSubagentResultSummary,
        }}
        renderState="completed"
      />,
      { width: 120, height: 70 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();

    expect(frame).toContain("prompt line 24");
    expect(frame).toContain("result line 24");
    expect(frame).toContain("showing first 24 of 30 lines");
    expect(frame).not.toContain("prompt line 25");
    expect(frame).not.toContain("result line 25");
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
