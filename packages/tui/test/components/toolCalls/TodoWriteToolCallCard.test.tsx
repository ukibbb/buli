import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TodoWriteToolCallCard } from "../../../src/components/toolCalls/TodoWriteToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("TodoWriteToolCallCard (opentui)", () => {
  test("streaming: renders TodoWrite label, bracketed item count, and updating status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TodoWriteToolCallCard
        toolCallDetail={{
          toolName: "todowrite",
          todoItems: [
            { todoItemTitle: "draft palette", todoItemStatus: "in_progress" },
            { todoItemTitle: "render gallery", todoItemStatus: "pending" },
          ],
        }}
        renderState="streaming"
      />,
      { width: 120, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("TodoWrite");
    expect(frame).toMatch(/\[\d+ items/);
    expect(frame).toContain("updating");
    expect(frame).toContain("draft palette");
  });

  test("completed: renders TodoWrite label, bracketed item count, and updated status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TodoWriteToolCallCard
        toolCallDetail={{
          toolName: "todowrite",
          todoItems: [
            { todoItemTitle: "draft palette", todoItemStatus: "completed" },
            { todoItemTitle: "render gallery", todoItemStatus: "in_progress" },
            { todoItemTitle: "wire reader", todoItemStatus: "pending" },
          ],
        }}
        renderState="completed"
      />,
      { width: 120, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("TodoWrite");
    expect(frame).toMatch(/\[\d+ items/);
    expect(frame).toContain("updated");
    expect(frame).toContain("palette");
    expect(frame).toContain("gallery");
    expect(chatScreenTheme.accentGreen).toBeDefined();
  });

  test("failed: renders TodoWrite label, accentRed sentinel, and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TodoWriteToolCallCard
        toolCallDetail={{ toolName: "todowrite", todoItems: [] }}
        renderState="failed"
        errorText="plan storage offline"
      />,
      { width: 120, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("TodoWrite");
    expect(frame).toContain("storage");
    expect(frame).toContain("offline");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });
});
