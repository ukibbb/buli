import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
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
    expect(frame).toContain("1-10:10");
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

  test("dispatches_glob", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "glob",
          globPattern: "**/*.ts",
          matchedPathCount: 2,
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("**/*.ts");
    expect(frame).toContain("2 paths");
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

  test("dispatches_write", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "write",
          writtenFilePath: "/src/generated.ts",
          addedLineCount: 1,
          removedLineCount: 0,
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("/src/generated.ts");
    expect(frame).toContain("+1");
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("2 items");
    expect(frame).not.toContain("Step one");
    expect(frame).not.toContain("Step two");
  });

  test("dispatches_task", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "Run analysis",
          subagentResultSummary: "Analysis complete.",
        }}
      />,
      { width: 80, height: 15 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("returned");
    expect(frame).toContain("[+]");
    expect(frame).not.toContain("Analysis complete.");
  });

});
