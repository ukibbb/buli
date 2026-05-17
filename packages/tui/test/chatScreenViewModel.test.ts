import { expect, test } from "bun:test";
import { chatScreenTheme, minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import { createInitialChatSessionState, insertTextIntoPromptDraftAtCursor } from "@buli/chat-session-state";
import { buildChatScreenViewModel } from "../src/behavior/chatScreenViewModel.ts";

test("buildChatScreenViewModel disables prompt input while a turn is streaming", () => {
  const chatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "hello"),
    conversationTurnStatus: "streaming_assistant_response" as const,
  };

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.isPromptInputDisabled).toBe(true);
  expect(viewModel.promptInputHintOverride).toBeUndefined();
});

test("buildChatScreenViewModel disables prompt input while conversation compaction is running", () => {
  const chatSessionState = insertTextIntoPromptDraftAtCursor(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "next prompt",
  );

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    conversationSessionCompactionStatus: { step: "compacting", source: "auto" },
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
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.modeLabel).toBe("Plan");
  expect(viewModel.inputPanelAccentColor).toBe(chatScreenTheme.accentAmber);
  expect(viewModel.promptInputHintOverride).toBe("read-only planning mode · tab to Implementation");
});

test("buildChatScreenViewModel derives understand-mode pink input copy", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.modeLabel).toBe("Understand");
  expect(viewModel.inputPanelAccentColor).toBe(chatScreenTheme.accentPink);
  expect(viewModel.promptInputHintOverride).toBe("read-only understanding mode · tab to Plan");
});

test("buildChatScreenViewModel derives context usage and minimum input branch", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      latestTokenUsage: { input: 10, output: 20, reasoning: 30, total: undefined, cache: { read: 0, write: 0 } },
    },
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 8,
    terminalColumnCount: 140,
    terminalSizeTierForChatScreen: minimumTerminalSizeTier,
  });

  expect(viewModel.totalContextTokensUsed).toBe(60);
  expect(viewModel.contextWindowTokenCapacity).toBe(1_050_000);
  expect(viewModel.shouldRenderMinimumHeightPromptStrip).toBe(true);
  expect(viewModel.inputRegionRowCount).toBe(1);
});

test("buildChatScreenViewModel reserves the full OpenCode-sized input panel at comfortable tier", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 140,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.shouldRenderMinimumHeightPromptStrip).toBe(false);
  expect(viewModel.inputRegionRowCount).toBe(10);
});
