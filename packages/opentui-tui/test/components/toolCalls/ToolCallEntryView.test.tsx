import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { ToolCallEntryView } from "../../../src/components/toolCalls/ToolCallEntryView.tsx";

describe("ToolCallEntryView", () => {
  test("dispatches_read", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "read",
          readFilePath: "/src/index.ts",
          readLineCount: 10,
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("/src/index.ts");
    expect(frame).toContain("10 lines");
  });

  test("dispatches_grep", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "grep",
          searchPattern: "myFunction",
          totalMatchCount: 3,
          matchedFileCount: 1,
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("myFunction");
    expect(frame).toContain("3 matches");
  });

  test("dispatches_edit", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "edit",
          editedFilePath: "/src/config.ts",
          addedLineCount: 2,
          removedLineCount: 0,
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("/src/config.ts");
    expect(frame).toContain("+2");
  });

  test("dispatches_bash", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "bash",
          commandLine: "echo hello",
          exitCode: 0,
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("echo hello");
    expect(frame).toContain("exit 0");
  });

  test("dispatches_todowrite", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "todowrite",
          todoItems: [
            { todoItemTitle: "Step one", todoItemStatus: "completed" },
            { todoItemTitle: "Step two", todoItemStatus: "pending" },
          ],
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Step one");
    expect(frame).toContain("Step two");
  });

  test("dispatches_task", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "task",
          subagentDescription: "Run analysis",
          subagentResultSummary: "Analysis complete.",
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    // description may be truncated at narrow width; assert card renders via status + result body
    expect(frame).toContain("returned");
    expect(frame).toContain("Analysis complete.");
  });
});
