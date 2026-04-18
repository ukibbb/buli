import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TodoWriteToolCallCard } from "../../../src/components/toolCalls/TodoWriteToolCallCard.tsx";

describe("TodoWriteToolCallCard", () => {
  test("completed_shows_todo_items_and_progress", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TodoWriteToolCallCard
        renderState="completed"
        toolCallDetail={{
          toolName: "todowrite",
          todoItems: [
            { todoItemTitle: "Write tests", todoItemStatus: "completed" },
            { todoItemTitle: "Fix bug", todoItemStatus: "in_progress" },
            { todoItemTitle: "Update docs", todoItemStatus: "pending" },
          ],
        }}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Write tests");
    expect(frame).toContain("Fix bug");
    expect(frame).toContain("Update docs");
    expect(frame).toContain("1/3 done");
  });

  test("failed_shows_error_state", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TodoWriteToolCallCard
        renderState="failed"
        toolCallDetail={{
          toolName: "todowrite",
          todoItems: [],
        }}
        errorText="plan update failed"
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("plan update failed");
  });
});
