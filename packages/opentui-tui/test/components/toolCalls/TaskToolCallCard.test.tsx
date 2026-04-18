import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TaskToolCallCard } from "../../../src/components/toolCalls/TaskToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("TaskToolCallCard (opentui)", () => {
  test("completed renders description, prompt, and result with accentPurple sentinel", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "summarize the indexer doc",
          subagentPrompt: "Summarize docs/atlas-indexer.md in 3 bullet points.",
          subagentResultSummary: "Walks the project tree, extracts module nodes, upserts to Neo4j.",
        }}
        renderState="completed"
      />,
      { width: 120, height: 12 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("docs");
    expect(frame).toContain("Summarize");
    expect(frame).toContain("result");
    expect(frame).toContain("Walks");
    expect(chatScreenTheme.accentPurple).toBe("#A855F7");
  });

  test("failed renders accentRed sentinel and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{ toolName: "task", subagentDescription: "any" }}
        renderState="failed"
        errorText="sub-agent crashed"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("crashed");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });
});
