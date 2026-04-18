import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TaskToolCallCard } from "../../../src/components/toolCalls/TaskToolCallCard.tsx";

describe("TaskToolCallCard", () => {
  test("completed_shows_description_and_result", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "Analyze the codebase",
          subagentPrompt: "Find all TODOs in src/",
          subagentResultSummary: "Found 12 TODO comments across 5 files.",
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    // description in header may be clipped; assert body content and status label
    expect(frame).toContain("Find all TODOs");
    expect(frame).toContain("Found 12 TODO comments");
    expect(frame).toContain("returned");
  });

  test("failed_shows_error_state", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "Complex task",
        }}
        errorText="sub-agent timed out"
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Complex task");
    expect(frame).toContain("sub-agent timed out");
  });
});
