import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { InputPanel } from "../../src/components/InputPanel.tsx";

const noopPromptDraftEdited = () => {};
const noopPromptSubmitted = () => {};

function countRenderedLinesMatchingPattern(renderedOutput: string, pattern: RegExp): number {
  return renderedOutput.split("\n").filter((renderedLine) => pattern.test(renderedLine)).length;
}

function splitRenderedViewportRows(renderedOutput: string): string[] {
  const renderedRows = renderedOutput.split("\n");
  return renderedRows[renderedRows.length - 1] === "" ? renderedRows.slice(0, -1) : renderedRows;
}

describe("InputPanel", () => {
  test("renders_mode_label_and_model_identifier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="claude-3-5-sonnet"
        reasoningEffortLabel="none"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("chat");
    expect(frame).toContain("claude-3-5-sonnet");
    expect(frame).not.toContain("Ask Buli");
  });

  test("renders_prompt_draft_without_shortcut_hints_when_idle", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello world"
        promptDraftCursorOffset={11}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="claude-3-5-haiku"
        reasoningEffortLabel="low"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={1000}
        contextWindowTokenCapacity={200000}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("hello world");
    expect(frame).not.toContain("help · shortcuts");
    expect(frame).not.toContain("caret");
    expect(frame).not.toContain("transcript");
  });

  test("renders_six_cell_activity_indicator_when_assistant_turn_active", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="waiting"
        promptDraftCursorOffset={7}
        isPromptInputDisabled={true}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="streaming_assistant_response"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("▰");
    expect(frame).not.toContain("◆");
  });

  test("reserves_a_second_prompt_row_for_single_line_drafts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello"
        promptDraftCursorOffset={5}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 10 },
    );

    await renderOnce();

    const renderedRows = splitRenderedViewportRows(captureCharFrame());
    const promptRowIndex = renderedRows.findIndex((renderedRow) => renderedRow.includes("> hello"));
    const footerRowIndex = renderedRows.findIndex((renderedRow) => renderedRow.includes("--"));
    expect(promptRowIndex).toBeGreaterThanOrEqual(0);
    expect(footerRowIndex - promptRowIndex).toBe(2);
  });

  test("renders_override_hint_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={true}
        promptInputHintOverride="Selection is open. Press Esc to close it."
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="claude-3-5-haiku"
        reasoningEffortLabel="low"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("Selection is open");
  });

  test("renders_no_left_footer_hint_when_given_an_empty_override", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={true}
        promptInputHintOverride=""
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="claude-3-5-haiku"
        reasoningEffortLabel="low"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).not.toContain("help · shortcuts");
    expect(frame).not.toContain("Selection is open");
  });

  test("renders_multiline_prompt_draft_across_the_growing_textarea", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft={["first line", "second line", "third line"].join("\n")}
        promptDraftCursorOffset={33}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 12 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("first line");
    expect(frame).toContain("second line");
    expect(frame).toContain("third line");
  });

  test("caps_the_growing_prompt_textarea_at_six_rows", async () => {
    const promptDraft = Array.from({ length: 8 }, (_value, index) => `draft line ${index + 1}`).join("\n");
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft={promptDraft}
        promptDraftCursorOffset={promptDraft.length}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 16 },
    );

    await renderOnce();

    expect(countRenderedLinesMatchingPattern(captureCharFrame(), /draft line \d/)).toBeLessThanOrEqual(6);
  });

  test("renders_the_prompt_draft_through_the_textarea", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello"
        promptDraftCursorOffset={2}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("hello");
  });
});
