import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../testRenderWithCleanup.ts";
import { TaskToolCallCard } from "../../../src/components/toolCalls/TaskToolCallCard.tsx";

async function renderSettledMarkdownFrame(renderOnce: () => Promise<void>): Promise<void> {
  await renderOnce();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await renderOnce();
}

describe("TaskToolCallCard (opentui)", () => {
  test("streaming renders Explore Agent label, bracketed description, animation, and starting stage", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "fetch release notes",
        }}
        renderState="streaming"
      />,
      { width: 120, height: 8 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("Explore Agent");
    expect(frame).toContain("[explore: fetch release notes]");
    expect(frame).toContain("starting explore agent");
    expect(frame).toContain("◆");
    expect(frame).not.toContain("running");
  });

  test("streaming starts collapsed when subagent child activity exists", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map docs",
          subagentChildToolCalls: [
            {
              subagentChildToolCallId: "call-read-1",
              subagentChildToolCallStatus: "running",
              subagentChildToolCallStartedAtMs: 1,
              subagentChildToolCallDetail: {
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
    expect(frame).toContain("Task details: activity");
    expect(frame).toContain("click to show content");
    expect(frame).not.toContain("Read");
    expect(frame).toContain("reading README.md");
    expect(frame).not.toContain("running");
  });

  test("streaming Explore Agent status follows current glob and grep stages", async () => {
    const globStageRender = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map files",
          subagentChildToolCalls: [
            {
              subagentChildToolCallId: "call-glob-1",
              subagentChildToolCallStatus: "running",
              subagentChildToolCallStartedAtMs: 1,
              subagentChildToolCallDetail: {
                toolName: "glob",
                globPattern: "packages/**/*.ts",
              },
            },
          ],
        }}
        renderState="streaming"
      />,
      { width: 140, height: 16 },
    );
    await renderSettledMarkdownFrame(globStageRender.renderOnce);
    expect(globStageRender.captureCharFrame()).toContain("finding packages/**/*.ts");

    const grepStageRender = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map files",
          subagentChildToolCalls: [
            {
              subagentChildToolCallId: "call-glob-1",
              subagentChildToolCallStatus: "completed",
              subagentChildToolCallStartedAtMs: 1,
              subagentChildToolCallDetail: {
                toolName: "glob",
                globPattern: "packages/**/*.ts",
              },
            },
            {
              subagentChildToolCallId: "call-grep-1",
              subagentChildToolCallStatus: "running",
              subagentChildToolCallStartedAtMs: 2,
              subagentChildToolCallDetail: {
                toolName: "grep",
                searchPattern: "TaskToolCallCard",
              },
            },
          ],
        }}
        renderState="streaming"
      />,
      { width: 140, height: 16 },
    );
    await renderSettledMarkdownFrame(grepStageRender.renderOnce);
    expect(grepStageRender.captureCharFrame()).toContain("searching TaskToolCallCard");
  });

  test("completed renders Task label, bracketed description, prompt, result, and duration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
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
    expect(frame).toContain("[explore: summarize the indexer doc]");
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
          subagentName: "explore",
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
          subagentName: "explore",
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
    expect(frame).toContain("[explore: quick check]");
    expect(frame).toContain("42ms");
  });

  test("completed expands subagent child activity and result when summary is clicked", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "summarize docs",
          subagentPrompt: "Read README.md and search package files.",
          subagentChildToolCalls: [
            {
              subagentChildToolCallId: "call-read-1",
              subagentChildToolCallStatus: "completed",
              subagentChildToolCallStartedAtMs: 1,
              subagentChildToolCallDurationMs: 15,
              subagentChildToolCallDetail: {
                toolName: "read",
                readFilePath: "README.md",
                readLineCount: 2,
              },
            },
            {
              subagentChildToolCallId: "call-glob-1",
              subagentChildToolCallStatus: "completed",
              subagentChildToolCallStartedAtMs: 2,
              subagentChildToolCallDetail: {
                toolName: "glob",
                globPattern: "packages/**/*.ts",
                matchedPathCount: 3,
              },
            },
            {
              subagentChildToolCallId: "call-grep-1",
              subagentChildToolCallStatus: "completed",
              subagentChildToolCallStartedAtMs: 3,
              subagentChildToolCallDetail: {
                toolName: "grep",
                searchPattern: "TaskToolCallCard",
                totalMatchCount: 1,
              },
            },
            {
              subagentChildToolCallId: "call-task-1",
              subagentChildToolCallStatus: "denied",
              subagentChildToolCallStartedAtMs: 4,
              subagentChildToolCallDenialText: "Subagents cannot spawn another subagent.",
              subagentChildToolCallDetail: {
                toolName: "task",
                subagentName: "explore",
                subagentDescription: "nested",
                subagentPrompt: "Try to spawn another subagent.",
              },
            },
          ],
          subagentResultSummary: "README.md explains the project.",
        }}
        renderState="completed"
      />,
      { width: 140, height: 42 },
    );
    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("Task details: prompt, activity, result");
    expect(collapsedFrame).toContain("click to show content");
    expect(collapsedFrame).not.toContain("// activity");
    expect(collapsedFrame).not.toContain("Read");

    await act(async () => {
      await mockMouse.click(6, 3);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("activity");
    expect(expandedFrame).toContain("Read");
    expect(expandedFrame).toContain("Glob");
    expect(expandedFrame).toContain("Grep");
    expect(expandedFrame).toContain("README.md");
    expect(expandedFrame).toContain("TaskToolCallCard");
    expect(expandedFrame).toContain("Subagents cannot spawn");
    expect(expandedFrame).toContain("README.md explains");
  });

  test("failed renders Task label, bracketed description, and error text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{ toolName: "task", subagentName: "explore", subagentDescription: "run migration" }}
        renderState="failed"
        errorText="sub-agent crashed"
      />,
      { width: 120, height: 10 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Task");
    expect(frame).toContain("[explore: run migration]");
    expect(frame).toContain("crashed");
  });
});
