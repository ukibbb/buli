import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { InputPanel } from "../../src/components/InputPanel.tsx";

describe("InputPanel", () => {
  test("renders_mode_label_and_model_identifier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
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
    expect(frame).toContain("hello world");
  });

  test("renders_override_hint_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <InputPanel
        promptDraft=""
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
});
