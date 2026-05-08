import { expect, test } from "bun:test";
import { minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import { createInitialChatSessionState, insertTextIntoPromptDraftAtCursor } from "@buli/chat-session-state";
import { buildChatScreenViewModel } from "../src/behavior/chatScreenViewModel.ts";

test("buildChatScreenViewModel disables prompt input while a turn is streaming", () => {
  const chatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "hello"),
    conversationTurnStatus: "streaming_assistant_response" as const,
  };

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.isPromptInputDisabled).toBe(true);
  expect(viewModel.promptInputHintOverride).toBeUndefined();
});

test("buildChatScreenViewModel derives plan-mode input copy", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      selectedAssistantOperatingMode: "plan",
    },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.modeLabel).toBe("plan");
  expect(viewModel.promptInputHintOverride).toBe("read-only planning mode · tab to implementation");
});

test("buildChatScreenViewModel derives context usage and minimum input branch", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      latestTokenUsage: { input: 10, output: 20, reasoning: 30, total: undefined, cache: { read: 0, write: 0 } },
    },
    terminalRowCount: 8,
    terminalColumnCount: 140,
    terminalSizeTierForChatScreen: minimumTerminalSizeTier,
  });

  expect(viewModel.totalContextTokensUsed).toBe(60);
  expect(viewModel.contextWindowTokenCapacity).toBe(1_050_000);
  expect(viewModel.shouldRenderMinimumHeightPromptStrip).toBe(true);
  expect(viewModel.promptInputRegionColumnCount).toBe(100);
});
