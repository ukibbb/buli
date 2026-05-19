import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { ExplorerToolCallCard } from "../../../src/components/toolCalls/ExplorerToolCallCard.tsx";

async function renderSettledMarkdownFrame(renderOnce: () => Promise<void>): Promise<void> {
  await renderOnce();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await renderOnce();
}

describe("ExplorerToolCallCard (opentui)", () => {
  test("streaming renders Explorer label, bracketed description, and exploring status", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "map runtime",
        }}
        renderState="streaming"
      />,
      { width: 120, height: 8 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("Explorer");
    expect(frame).toContain("[map runtime]");
    expect(frame).toContain("exploring");
  });

  test("streaming starts collapsed when nested Explorer child activity exists", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "map docs",
          explorationChildToolCalls: [
            {
              explorerChildToolCallId: "call-read-1",
              explorerChildToolCallStatus: "running",
              explorerChildToolCallStartedAtMs: 1,
              explorerChildToolCallDetail: {
                toolName: "read",
                readFilePath: "README.md",
              },
            },
          ],
        }}
        renderState="streaming"
      />,
      { width: 120, height: 16 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("Explorer details: activity");
    expect(frame).toContain("click to show content");
    expect(frame).not.toContain("Read");
    expect(frame).not.toContain("README.md");
    expect(frame).toContain("exploring");
  });

  test("completed expands prompt and markdown result when summary is clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "summarize runtime",
          explorationPrompt: "Inspect packages/engine/src/runtime.ts.",
          explorationResultSummary: [
            "## Findings",
            "",
            "Runtime **dispatches** tool calls.",
            "",
            "- Child activity is summarized.",
          ].join("\n"),
        }}
        renderState="completed"
        durationMs={1200}
      />,
      { width: 120, height: 20 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("Explorer");
    expect(collapsedFrame).toContain("Explorer details: prompt, result");
    expect(collapsedFrame).toContain("click to show content");
    expect(collapsedFrame).toContain("1.2s");
    expect(collapsedFrame).not.toContain("Inspect packages/engine");
    expect(collapsedFrame).not.toContain("Findings");

    await act(async () => {
      await mockMouse.click(6, 3);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("click to hide content");
    expect(expandedFrame).toContain("Inspect packages/engine");
    expect(expandedFrame).toContain("result");
    expect(expandedFrame).toContain("Findings");
    expect(expandedFrame).toContain("Runtime");
    expect(expandedFrame).toContain("dispatches");
    expect(expandedFrame).toContain("• Child activity is summarized.");
    expect(expandedFrame).not.toContain("## Findings");
    expect(expandedFrame).not.toContain("**dispatches**");
    expect(expandedFrame).not.toContain("- Child activity is summarized.");
  });

  test("completed expands nested Explorer child activity and result when summary is clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "summarize docs",
          explorationPrompt: "Read README.md.",
          explorationChildToolCalls: [
            {
              explorerChildToolCallId: "call-read-1",
              explorerChildToolCallStatus: "completed",
              explorerChildToolCallStartedAtMs: 1,
              explorerChildToolCallDurationMs: 15,
              explorerChildToolCallDetail: {
                toolName: "read",
                readFilePath: "README.md",
                readLineCount: 2,
              },
            },
          ],
          explorationResultSummary: "README.md explains the project.",
        }}
        renderState="completed"
      />,
      { width: 120, height: 22 },
    );
    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("Explorer details: prompt, activity, result");
    expect(collapsedFrame).toContain("click to show content");
    expect(collapsedFrame).not.toContain("// activity");
    expect(collapsedFrame).not.toContain("Read");

    await act(async () => {
      await mockMouse.click(6, 3);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("activity");
    expect(expandedFrame).toContain("Read");
    expect(expandedFrame).toContain("README.md");
    expect(expandedFrame).toContain("2 lines");
    expect(expandedFrame).toContain("README.md explains");
  });

  test("completed expands denied Explorer child activity for disallowed tools", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{
          toolName: "explore",
          explorationDescription: "map runtime",
          explorationChildToolCalls: [
            {
              explorerChildToolCallId: "call-bash-1",
              explorerChildToolCallStatus: "denied",
              explorerChildToolCallStartedAtMs: 1,
              explorerChildToolCallDurationMs: 1,
              explorerChildToolCallDenialText: "Explorer is read-only and cannot use bash.",
              explorerChildToolCallDetail: {
                toolName: "bash",
                commandLine: "pwd",
                commandDescription: "Print working directory",
              },
            },
          ],
        }}
        renderState="completed"
      />,
      { width: 120, height: 18 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(6, 3);
    });
    await renderOnce();

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("activity");
    expect(expandedFrame).toContain("Bash");
    expect(expandedFrame).toContain("pwd");
    expect(expandedFrame).toContain("Explorer is read-only");
  });

  test("failed renders Explorer label and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ExplorerToolCallCard
        toolCallDetail={{ toolName: "explore", explorationDescription: "map runtime" }}
        renderState="failed"
        errorText="explorer crashed"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Explorer");
    expect(frame).toContain("[map runtime]");
    expect(frame).toContain("crashed");
  });
});
