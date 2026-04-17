import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import type { AssistantResponseRunner } from "@buli/engine";
import { ChatScreen } from "../../src/ChatScreen.tsx";

const neverEmittingAssistantResponseRunner: AssistantResponseRunner = {
  // eslint-disable-next-line require-yield -- intentional: stub never yields a turn.
  async *streamAssistantResponse() {
    return;
  },
};

const noopAvailableModelsLoader = async () => [];

describe("ChatScreen responsive layout", () => {
  test("renders_minimum_height_prompt_strip_when_terminal_falls_below_compact_tier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ChatScreen
        selectedModelId="gpt-5.4"
        loadAvailableAssistantModels={noopAvailableModelsLoader}
        assistantResponseRunner={neverEmittingAssistantResponseRunner}
      />,
      { width: 50, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain(">");
    expect(frame).not.toContain("ctx");
    expect(frame).not.toContain("help · shortcuts");
  });

  test("renders_full_input_panel_with_context_meter_at_comfortable_tier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ChatScreen
        selectedModelId="gpt-5.4"
        loadAvailableAssistantModels={noopAvailableModelsLoader}
        assistantResponseRunner={neverEmittingAssistantResponseRunner}
      />,
      { width: 120, height: 32 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("ctx");
    expect(frame).toContain("implementation");
  });
});
