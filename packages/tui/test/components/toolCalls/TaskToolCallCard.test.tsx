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
  test("streaming renders Explore Agent label, bracketed description, and starting status", async () => {
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("Explore Agent");
    expect(frame).toContain("[explore: fetch release notes]");
    expect(frame).toContain("◆");
    expect(frame).toContain("starting subagent");
    expect(frame).not.toContain("starting explore agent");
    expect(frame).not.toContain("running");
  });

  test("streaming starts expanded when subagent child activity exists", async () => {
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
        toolCallStartedAtMs={Date.now() - 12_400}
      />,
      { width: 120, height: 16 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("1 tool call / 12.4s · 1 active");
    expect(frame).toContain("activity");
    expect(frame).not.toContain("click to show content");
    expect(frame).toContain("Read");
    expect(frame).toContain("README.md");
    expect(frame).toContain("◆");
    expect(frame).toContain("reading");
  });

  test("streaming Explore Agent status exposes child activity text", async () => {
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
    expect(globStageRender.captureCharFrame()).toContain("◆");
    expect(globStageRender.captureCharFrame()).toContain("1 tool call · 1 active");
    expect(globStageRender.captureCharFrame()).toContain("Glob");
    expect(globStageRender.captureCharFrame()).toContain("packages/**/*.ts");
    expect(globStageRender.captureCharFrame()).toContain("searching");

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
    expect(grepStageRender.captureCharFrame()).toContain("◆");
    expect(grepStageRender.captureCharFrame()).toContain("2 tool calls · 1 active");
    expect(grepStageRender.captureCharFrame()).toContain("Grep");
    expect(grepStageRender.captureCharFrame()).toContain("TaskToolCallCard");
    expect(grepStageRender.captureCharFrame()).toContain("searching");
  });

  test("streaming Explore Agent status shows tool count and elapsed time while summary is pending", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
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
          ],
        }}
        renderState="streaming"
        toolCallStartedAtMs={Date.now() - 12_400}
      />,
      { width: 140, height: 16 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("1 tool call / 12.4s");
    expect(frame).not.toContain("waiting for summary");
    expect(frame).not.toContain("child call");
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("Task");
    expect(frame).toContain("[explore: summarize the indexer doc]");
    expect(frame).not.toContain("Summarize docs/atlas-indexer.md");
    expect(frame).not.toContain("result");
    expect(frame).not.toContain("read");
    expect(frame).not.toContain("`read`");
    expect(frame).not.toContain("**summarize**");
    expect(frame).toContain("1.2s");
  });

  test("completed with small result summary expands result by default", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "summarize docs",
          subagentResultSummary: "README.md explains the project.",
        }}
        renderState="completed"
        durationMs={1200}
      />,
      { width: 120, height: 12 },
    );
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();
    expect(frame).toContain("[-]");
    expect(frame).toContain("result");
    expect(frame).toContain("README.md explains");
  });

  test("completed renders full long prompt and result sections", async () => {
    const longSubagentPrompt = Array.from({ length: 30 }, (_, index) => `prompt line ${index + 1}`).join("\n");
    const longSubagentResultSummary = Array.from({ length: 30 }, (_, index) => `result line ${index + 1}`).join("\n");
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
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
    expect(captureCharFrame()).not.toContain("prompt line 24");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();

    expect(frame).toContain("[-]");
    expect(frame).toContain("prompt line 30");
    expect(frame).toContain("result line 30");
    expect(frame).not.toContain("showing first");
  });

  test("completed renders very long prompt and result sections without line limits", async () => {
    const longSubagentPrompt = Array.from({ length: 55 }, (_, index) => `prompt line ${index + 1}`).join("\n");
    const longSubagentResultSummary = Array.from({ length: 55 }, (_, index) => `result line ${index + 1}`).join("\n");
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
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
      { width: 120, height: 130 },
    );
    await renderSettledMarkdownFrame(renderOnce);

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);
    const frame = captureCharFrame();

    expect(frame).toContain("prompt line 55");
    expect(frame).toContain("result line 55");
    expect(frame).not.toContain("showing first");
  });

  test("completed renders all subagent child activity without tool_call_limits", async () => {
    const subagentChildToolCalls = Array.from({ length: 55 }, (_value, index) => ({
      subagentChildToolCallId: `call-read-${index + 1}`,
      subagentChildToolCallStatus: "completed" as const,
      subagentChildToolCallStartedAtMs: index + 1,
      subagentChildToolCallDetail: {
        toolName: "read" as const,
        readFilePath: `file-${index + 1}.ts`,
      },
    }));
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "large subagent activity",
          subagentChildToolCalls,
        }}
        renderState="completed"
      />,
      { width: 120, height: 90 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderOnce();
    const frame = captureCharFrame();

    expect(frame).toContain("file-1.ts");
    expect(frame).toContain("file-55.ts");
    expect(frame).not.toContain("showing first");
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
    expect(frame).toContain("[+]");
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
    expect(collapsedFrame).toContain("[+]");
    expect(collapsedFrame).not.toContain("Task details: prompt, activity, result");
    expect(collapsedFrame).not.toContain("click to show content");
    expect(collapsedFrame).not.toContain("// activity");
    expect(collapsedFrame).not.toContain("Read");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("[-]");
    expect(expandedFrame).toContain("activity");
    expect(expandedFrame).toContain("Read");
    expect(expandedFrame).toContain("Glob");
    expect(expandedFrame).toContain("Grep");
    expect(expandedFrame).toContain("README.md");
    expect(expandedFrame).toContain("TaskToolCallCard");
    expect(expandedFrame).toContain("Subagents cannot spawn");
    expect(expandedFrame).toContain("README.md explains");
  });

  test("completed with research checkpoint renders one checkpoint section and real child failures", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map runtime",
          subagentResearchCheckpoint: {
            checkpointReason: "child_tool_result_text_length",
            childToolCallCount: 39,
            childToolResultTextLength: 314_820,
            skippedChildToolCallCount: 1,
          },
          subagentChildToolCalls: [
            {
              subagentChildToolCallId: "call-read-1",
              subagentChildToolCallStatus: "completed",
              subagentChildToolCallStartedAtMs: 1,
              subagentChildToolCallDetail: {
                toolName: "read",
                readFilePath: "runtime.ts",
              },
            },
            {
              subagentChildToolCallId: "call-task-1",
              subagentChildToolCallStatus: "denied",
              subagentChildToolCallStartedAtMs: 2,
              subagentChildToolCallDenialText: "Subagents cannot spawn another subagent.",
              subagentChildToolCallDetail: {
                toolName: "task",
                subagentName: "explore",
                subagentDescription: "nested",
              },
            },
          ],
          subagentResultSummary: "Checkpoint summary returned.",
        }}
        renderState="completed"
        durationMs={1234}
      />,
      { width: 150, height: 44 },
    );
    await renderOnce();
    const collapsedFrame = captureCharFrame();
    expect(collapsedFrame).toContain("checkpoint returned");
    expect(collapsedFrame).not.toContain("Explorer research checkpoint");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("checkpoint");
    expect(expandedFrame).toContain("tool output limit reached");
    expect(expandedFrame).toContain("Completed tool calls: 39");
    expect(expandedFrame).toContain("Skipped requested tool calls: 1");
    expect(expandedFrame).toContain("activity");
    expect(expandedFrame).toContain("Subagents cannot spawn");
    expect(expandedFrame).not.toContain("Explorer research budget reached");
  });

  test("completed with elapsed-time research checkpoint renders elapsed-time label", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map runtime",
          subagentResearchCheckpoint: {
            checkpointReason: "elapsed_time",
            childToolCallCount: 7,
            childToolResultTextLength: 24_000,
            skippedChildToolCallCount: 1,
            elapsedMilliseconds: 300_100,
            softElapsedTimeCheckpointMilliseconds: 300_000,
          },
          subagentChildToolCalls: [],
          subagentResultSummary: "Elapsed checkpoint summary returned.",
        }}
        renderState="completed"
        durationMs={300100}
      />,
      { width: 150, height: 28 },
    );
    await renderOnce();

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("elapsed-time limit reached");
    expect(expandedFrame).not.toContain("tool output limit reached");
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
    expect(frame).toContain("[+]");
    expect(frame).toContain("Task");
    expect(frame).toContain("[explore: run migration]");
    expect(frame).toContain("crashed");
  });

  test("failed with child activity can expand failure evidence", async () => {
    const { captureCharFrame, mockMouse, renderOnce } = await testRender(
      <TaskToolCallCard
        toolCallDetail={{
          toolName: "task",
          subagentName: "explore",
          subagentDescription: "map docs",
          subagentResearchCheckpoint: {
            checkpointReason: "child_tool_call_count",
            childToolCallCount: 192,
            childToolResultTextLength: 42_000,
            skippedChildToolCallCount: 1,
          },
          subagentChildToolCalls: [
            {
              subagentChildToolCallId: "call-read-1",
              subagentChildToolCallStatus: "completed",
              subagentChildToolCallStartedAtMs: 1,
              subagentChildToolCallDetail: {
                toolName: "read",
                readFilePath: "README.md",
              },
            },
          ],
          subagentResultSummary: "Partial findings before failure.",
        }}
        renderState="failed"
        errorText="Explorer continued requesting tools after checkpoint"
      />,
      { width: 150, height: 34 },
    );
    await renderOnce();
    expect(captureCharFrame()).not.toContain("Partial findings");

    await act(async () => {
      await mockMouse.click(3, 0);
    });
    await renderSettledMarkdownFrame(renderOnce);

    const expandedFrame = captureCharFrame();
    expect(expandedFrame).toContain("Explorer continued requesting");
    expect(expandedFrame).toContain("checkpoint");
    expect(expandedFrame).toContain("README.md");
    expect(expandedFrame).toContain("Partial findings");
  });
});
