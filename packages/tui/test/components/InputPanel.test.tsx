import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { InputPanel } from "../../src/components/InputPanel.tsx";

function countRenderedLinesMatchingPattern(renderedOutput: string, pattern: RegExp): number {
  return renderedOutput.split("\n").filter((renderedLine) => pattern.test(renderedLine)).length;
}

describe("InputPanel", () => {
  test("renders_mode_label_and_model_identifier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={false}
        modeLabel="chat"
        modelIdentifier="claude-3-5-sonnet"
        reasoningEffortLabel="none"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("chat");
    expect(frame).toContain("claude-3-5-sonnet");
  });

  test("renders_persistent_help_hint_when_idle", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello world"
        promptDraftCursorOffset={11}
        isPromptInputDisabled={false}
        modeLabel="chat"
        modelIdentifier="claude-3-5-haiku"
        reasoningEffortLabel="low"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={1000}
        contextWindowTokenCapacity={200000}
      />,
      { width: 80, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("help · shortcuts");
    expect(frame).toContain("caret");
    expect(frame).toContain("transcript");
    expect(frame).toContain("hello world");
  });

  test("renders_override_hint_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={true}
        promptInputHintOverride="Selection is open. Press Esc to close it."
        modeLabel="chat"
        modelIdentifier="claude-3-5-haiku"
        reasoningEffortLabel="low"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
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
        modeLabel="chat"
        modelIdentifier="claude-3-5-haiku"
        reasoningEffortLabel="low"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).not.toContain("help · shortcuts");
    expect(frame).not.toContain("Selection is open");
  });

  test("keeps_a_long_prompt_draft_on_one_visual_row_at_narrow_widths", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="@/Users/lukasz/Desktop/Projekty/buli/.bun/install/cache/@babel/helper-annotate-as-pure@7.27.3@@@1/README.md"
        promptDraftCursorOffset={107}
        isPromptInputDisabled={false}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
      />,
      { width: 58, height: 8 },
    );

    await renderOnce();

    expect(countRenderedLinesMatchingPattern(captureCharFrame(), /install\/cache|helper-annotate|README\.md/)).toBe(1);
  });

  test("renders_the_cursor_at_the_current_prompt_draft_offset", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello"
        promptDraftCursorOffset={2}
        isPromptInputDisabled={false}
        modeLabel="chat"
        modelIdentifier="gpt-5.4"
        reasoningEffortLabel="default"
        assistantResponseStatus="waiting_for_user_input"
        totalContextTokensUsed={undefined}
        contextWindowTokenCapacity={undefined}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("he█llo");
  });
});
