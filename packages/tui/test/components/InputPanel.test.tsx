import { describe, expect, test } from "bun:test";
import { TextareaRenderable, type CapturedFrame, type RGBA } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { InputPanel } from "../../src/components/InputPanel.tsx";

const noopPromptDraftEdited = () => {};
const noopPromptSubmitted = () => {};
type RenderedInputPanel = Awaited<ReturnType<typeof testRender>>;

function readFocusedInputPanelTextarea(renderedInputPanel: RenderedInputPanel): TextareaRenderable {
  const focusedRenderable = renderedInputPanel.renderer.currentFocusedRenderable;
  if (!(focusedRenderable instanceof TextareaRenderable)) {
    throw new Error("Expected InputPanel textarea to be focused");
  }

  return focusedRenderable;
}

function countRenderedLinesMatchingPattern(renderedOutput: string, pattern: RegExp): number {
  return renderedOutput.split("\n").filter((renderedLine) => pattern.test(renderedLine)).length;
}

function splitRenderedViewportRows(renderedOutput: string): string[] {
  const renderedRows = renderedOutput.split("\n");
  return renderedRows[renderedRows.length - 1] === "" ? renderedRows.slice(0, -1) : renderedRows;
}

function formatCapturedColorAsHex(capturedColor: RGBA): string {
  const [red, green, blue] = capturedColor.toInts();
  const formatChannel = (channel: number): string => channel.toString(16).padStart(2, "0").toUpperCase();
  return `#${formatChannel(red)}${formatChannel(green)}${formatChannel(blue)}`;
}

function readForegroundColorForRenderedText(capturedFrame: CapturedFrame, renderedText: string): string | undefined {
  for (const capturedLine of capturedFrame.lines) {
    for (const capturedSpan of capturedLine.spans) {
      if (capturedSpan.text.includes(renderedText)) {
        return formatCapturedColorAsHex(capturedSpan.fg);
      }
    }
  }

  return undefined;
}

describe("InputPanel", () => {
  test("renders_prompt_draft_without_shortcut_hints_when_idle", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello world"
        promptDraftCursorOffset={11}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
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

  test("reserves_two_following_prompt_rows_for_single_line_drafts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft="hello"
        promptDraftCursorOffset={5}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentGreen}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 10 },
    );

    await renderOnce();

    // Single-line draft must occupy at least three rows inside the frame so the
    // textarea body never collapses to a single visible line.
    const renderedRows = splitRenderedViewportRows(captureCharFrame());
    const promptRowIndex = renderedRows.findIndex((renderedRow) => renderedRow.includes("> hello"));
    const closingBorderRowIndex = renderedRows.findIndex((renderedRow) => renderedRow.includes("╰"));
    expect(promptRowIndex).toBeGreaterThanOrEqual(0);
    expect(closingBorderRowIndex - promptRowIndex).toBeGreaterThanOrEqual(3);
  });

  test("renders_no_left_footer_hint_when_given_an_empty_override", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={true}
        accentColor={chatScreenTheme.accentGreen}
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
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 80, height: 8 },
    );

    await renderOnce();

    expect(captureCharFrame()).toContain("hello");
  });

  test("renders_selected_prompt_context_reference_with_agent_accent_color", async () => {
    const selectedPromptContextReferenceText = "@/Users/lukasz/Desktop/Projekty/buli/examples/opencode/";
    const { captureSpans, renderOnce } = await testRender(
      <InputPanel
        promptDraft={selectedPromptContextReferenceText}
        promptDraftCursorOffset={selectedPromptContextReferenceText.length}
        selectedPromptContextReferenceTexts={[selectedPromptContextReferenceText]}
        isPromptInputDisabled={false}
        accentColor={chatScreenTheme.accentPink}
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 140, height: 8 },
    );

    await renderOnce();

    expect(readForegroundColorForRenderedText(captureSpans(), selectedPromptContextReferenceText)).toBe(
      chatScreenTheme.accentPink.toUpperCase(),
    );
  });

  test("keeps_long_prompt_cursor_away_from_the_panel_border", async () => {
    const minimumCursorGapBeforeRightBorder = 2;
    const promptWidthCases = [
      { terminalColumnCount: 100, promptCharacterCount: 91 },
      { terminalColumnCount: 158, promptCharacterCount: 148 },
    ] as const;

    for (const promptWidthCase of promptWidthCases) {
      const promptDraft = "s".repeat(promptWidthCase.promptCharacterCount);
      const renderedInputPanel = await testRender(
        <InputPanel
          promptDraft={promptDraft}
          promptDraftCursorOffset={promptDraft.length}
          isPromptInputDisabled={false}
          accentColor={chatScreenTheme.accentPink}
          onPromptDraftEdited={noopPromptDraftEdited}
          onPromptSubmitted={noopPromptSubmitted}
        />,
        { width: promptWidthCase.terminalColumnCount, height: 10 },
      );

      await renderedInputPanel.renderOnce();

      const renderedRows = splitRenderedViewportRows(renderedInputPanel.captureCharFrame());
      const promptRow = renderedRows.find((renderedRow) => renderedRow.includes("> s"));
      if (promptRow === undefined) {
        throw new Error("Expected rendered prompt row");
      }

      const promptTextarea = readFocusedInputPanelTextarea(renderedInputPanel);
      const cursorColumn = promptTextarea.x + promptTextarea.visualCursor.visualCol;
      const rightBorderColumn = promptRow.lastIndexOf("│");
      expect(rightBorderColumn).toBeGreaterThan(0);
      expect(rightBorderColumn - cursorColumn).toBeGreaterThanOrEqual(minimumCursorGapBeforeRightBorder);
    }
  });
});
