import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TodoWriteToolCallCard } from "../../../src/components/toolCalls/TodoWriteToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("TodoWriteToolCallCard (opentui)", () => {
  test("renders progress label, todo items, and accentPrimaryMuted sentinel", async () => {
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
    expect(frame).toContain("done");
    expect(frame).toContain("active");
    expect(frame).toContain("palette");
    expect(frame).toContain("gallery");
    expect(chatScreenTheme.accentPrimaryMuted).toBe("#818CF8");
  });

  test("failed renders accentRed sentinel and error text", async () => {
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
    expect(frame).toContain("storage");
    expect(frame).toContain("offline");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });
});
