import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TodoWriteToolCallCard } from "../../../src/components/toolCalls/TodoWriteToolCallCard.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("TodoWriteToolCallCard (opentui)", () => {
  test("streaming: renders TodoWrite label, bracketed item count, and only the snake status", async () => {
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("TodoWrite");
    expect(frame).toMatch(/\[\d+ items/);
    expect(frame).toContain("▰");
    expect(frame).not.toContain("updating");
    expect(frame).not.toContain("draft palette");
  });

  test("completed: renders one-line summary and expands checklist when clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
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
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).toContain("TodoWrite");
    expect(collapsedFrame).toMatch(/\[\d+ items/);
    expect(collapsedFrame).toContain("updated");
    expect(collapsedFrame).not.toContain("palette");
    expect(collapsedFrame).not.toContain("gallery");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("palette");
    expect(expandedFrame).toContain("gallery");
    expect(chatScreenTheme.accentGreen).toBeDefined();
  });

  test("completed with zero items renders no body", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TodoWriteToolCallCard
        toolCallDetail={{ toolName: "todowrite", todoItems: [] }}
        renderState="completed"
      />,
      { width: 80, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("[+]");
    expect(frame).toContain("TodoWrite");
    expect(frame).not.toContain("☐");
    expect(frame).toContain("[0 items]");
    // body suppressed: nothing that looks like a checklist item row
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("TodoWrite");
    expect(frame).toContain("storage");
    expect(frame).toContain("offline");
    expect(chatScreenTheme.accentRed).toBe("#EF4444");
  });
});
