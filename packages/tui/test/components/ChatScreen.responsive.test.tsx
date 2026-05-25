import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import type { AssistantConversationRunner } from "@buli/engine";
import { ChatScreen } from "../../src/ChatScreen.tsx";

const neverEmittingAssistantConversationRunner: AssistantConversationRunner = {
  startConversationTurn() {
    return {
      // eslint-disable-next-line require-yield -- intentional: stub never yields a turn.
      async *streamAssistantResponseEvents() {
        return;
      },
      async approvePendingToolCall() {},
      async denyPendingToolCall() {},
      interrupt() {},
    };
  },
};

const noopAvailableModelsLoader = async () => [];
const noopPromptContextCandidatesLoader = async () => [];

function findRenderedRowContaining(renderedOutput: string, expectedText: string): string {
  const renderedRow = renderedOutput.split("\n").find((row) => row.includes(expectedText));
  if (!renderedRow) {
    throw new Error(`expected rendered output to contain a row with ${expectedText}`);
  }

  return renderedRow;
}

function splitRenderedViewportRows(renderedOutput: string): string[] {
  const renderedRows = renderedOutput.split("\n");
  return renderedRows[renderedRows.length - 1] === "" ? renderedRows.slice(0, -1) : renderedRows;
}

function findLastNonBlankRenderedRow(renderedRows: readonly string[]): string {
  const renderedRow = renderedRows.findLast((row) => row.trim().length > 0);
  if (!renderedRow) {
    throw new Error("expected rendered output to contain a non-blank row");
  }

  return renderedRow;
}

function countLeadingBlankCells(renderedRow: string): number {
  const firstVisibleCellIndex = renderedRow.search(/\S/);
  return firstVisibleCellIndex === -1 ? renderedRow.length : firstVisibleCellIndex;
}

function countTrailingBlankCells(renderedRow: string): number {
  return renderedRow.length - renderedRow.trimEnd().length;
}

function expectRenderedRowToSpanViewportWithTextMargin(renderedRow: string): void {
  const leadingBlankCellCount = countLeadingBlankCells(renderedRow);
  const trailingBlankCellCount = countTrailingBlankCells(renderedRow);

  expect(leadingBlankCellCount).toBeLessThanOrEqual(4);
  expect(trailingBlankCellCount).toBeLessThanOrEqual(4);
}

function expectRenderedRowToStartAtTextMargin(renderedRow: string): void {
  expect(countLeadingBlankCells(renderedRow)).toBeLessThanOrEqual(4);
}

describe("ChatScreen responsive layout", () => {
  test("renders_minimum_height_prompt_strip_when_terminal_falls_below_compact_tier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ChatScreen
        selectedModelId="gpt-5.4"
        loadAvailableAssistantModels={noopAvailableModelsLoader}
        loadPromptContextCandidates={noopPromptContextCandidatesLoader}
        assistantConversationRunner={neverEmittingAssistantConversationRunner}
      />,
      { width: 50, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain(">");
    expect(frame).not.toContain("ctx");
    expect(frame).not.toContain("help · shortcuts");
  });

  test("renders_full_input_panel_with_status_strip_at_comfortable_tier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ChatScreen
        selectedModelId="gpt-5.4"
        loadAvailableAssistantModels={noopAvailableModelsLoader}
        loadPromptContextCandidates={noopPromptContextCandidatesLoader}
        assistantConversationRunner={neverEmittingAssistantConversationRunner}
      />,
      { width: 120, height: 32 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("╭");
    expect(frame).toContain("0 / 1.1m (0%)");
    expect(frame).not.toContain("ctx");
    expect(frame).toContain("Understand");
  });

  test("left_aligns_full_input_panel_and_lets_it_span_the_wide_viewport", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ChatScreen
        selectedModelId="gpt-5.4"
        loadAvailableAssistantModels={noopAvailableModelsLoader}
        loadPromptContextCandidates={noopPromptContextCandidatesLoader}
        assistantConversationRunner={neverEmittingAssistantConversationRunner}
      />,
      { width: 140, height: 32 },
    );
    await renderOnce();
    const renderedRows = splitRenderedViewportRows(captureCharFrame());
    const inputFrameRow = findRenderedRowContaining(renderedRows.join("\n"), "╭");
    const bottomInputRegionRow = findLastNonBlankRenderedRow(renderedRows);

    expectRenderedRowToSpanViewportWithTextMargin(inputFrameRow);
    expectRenderedRowToSpanViewportWithTextMargin(bottomInputRegionRow);
  });

  test("left_aligns_minimum_height_prompt_strip_at_bottom_of_wide_viewport", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ChatScreen
        selectedModelId="gpt-5.4"
        loadAvailableAssistantModels={noopAvailableModelsLoader}
        loadPromptContextCandidates={noopPromptContextCandidatesLoader}
        assistantConversationRunner={neverEmittingAssistantConversationRunner}
      />,
      { width: 140, height: 8 },
    );
    await renderOnce();
    const renderedRows = splitRenderedViewportRows(captureCharFrame());
    const bottomViewportRow = renderedRows[renderedRows.length - 1] ?? "";

    expect(bottomViewportRow).toContain(">");
    expectRenderedRowToStartAtTextMargin(bottomViewportRow);
  });
});
