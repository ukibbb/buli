import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { MinimumHeightPromptStrip } from "../../src/components/MinimumHeightPromptStrip.tsx";

const noopPromptDraftEdited = () => {};
const noopPromptSubmitted = () => {};

describe("MinimumHeightPromptStrip", () => {
  test("renders_prompt_caret_and_draft_text_when_idle", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <MinimumHeightPromptStrip
        promptDraft="hello world"
        promptDraftCursorOffset={11}
        isPromptInputDisabled={false}
        queuedPromptCount={0}
        accentColor={chatScreenTheme.accentGreen}
        assistantResponseStatus="waiting_for_user_input"
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 40, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain(">");
    expect(frame).toContain("hello world");
  });

  test("renders_only_the_snake_when_streaming_assistant_response", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <MinimumHeightPromptStrip
        promptDraft="anything"
        promptDraftCursorOffset={8}
        isPromptInputDisabled={true}
        queuedPromptCount={0}
        accentColor={chatScreenTheme.accentGreen}
        assistantResponseStatus="streaming_assistant_response"
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 40, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("▰");
    expect(frame).not.toContain("◆");
    expect(frame).not.toContain("working");
    expect(frame).not.toContain("anything");
  });

  test("does_not_render_context_meter_or_help_shortcuts_footer", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <MinimumHeightPromptStrip
        promptDraft=""
        promptDraftCursorOffset={0}
        isPromptInputDisabled={false}
        queuedPromptCount={0}
        accentColor={chatScreenTheme.accentGreen}
        assistantResponseStatus="waiting_for_user_input"
        onPromptDraftEdited={noopPromptDraftEdited}
        onPromptSubmitted={noopPromptSubmitted}
      />,
      { width: 40, height: 6 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).not.toContain("ctx");
    expect(frame).not.toContain("help · shortcuts");
  });
});
