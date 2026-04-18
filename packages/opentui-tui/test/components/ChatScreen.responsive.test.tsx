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
    };
  },
};

const noopAvailableModelsLoader = async () => [];
const noopPromptContextCandidatesLoader = async () => [];

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

  test("renders_full_input_panel_with_context_meter_at_comfortable_tier", async () => {
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
    expect(frame).toContain("ctx");
    expect(frame).toContain("implementation");
  });
});
