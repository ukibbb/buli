import { expect, test } from "bun:test";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme, minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import {
  createInitialChatSessionState,
  insertTextIntoPromptDraftAtCursor,
  type ChatSessionState,
} from "@buli/chat-session-state";
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

  expect(viewModel.modeLabel).toBe("Plan Agent");
  expect(viewModel.inputPanelAccentColor).toBe(chatScreenTheme.accentAmber);
  expect(viewModel.promptInputHintOverride).toBeUndefined();
});

test("buildChatScreenViewModel derives understand-mode pink input copy", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.modeLabel).toBe("Understand Agent");
  expect(viewModel.inputPanelAccentColor).toBe(chatScreenTheme.accentPink);
  expect(viewModel.promptInputHintOverride).toBeUndefined();
});

test("buildChatScreenViewModel derives context usage and minimum input branch", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      latestTokenUsage: { input: 100, output: 200, reasoning: 300, total: undefined, cache: { read: 0, write: 0 } },
      latestContextWindowUsage: { input: 10, output: 20, reasoning: 30, total: undefined, cache: { read: 0, write: 0 } },
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
  expect(viewModel.inputRegionRowCount).toBe(9);
});

test("buildChatScreenViewModel hydrates only the requested visible tail for large transcripts", () => {
  const chatSessionState = createChatSessionStateWithTranscript({ conversationMessageCount: 10_000 });

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
    requestedVisibleConversationMessageCount: 12,
  });

  expect(viewModel.conversationTranscriptWindow.totalConversationMessageCount).toBe(10_000);
  expect(viewModel.conversationTranscriptWindow.visibleConversationMessageCount).toBe(12);
  expect(viewModel.conversationTranscriptWindow.hiddenOlderConversationMessageCount).toBe(9_988);
  expect(viewModel.conversationTranscriptWindow.visibleConversationMessages.map((message) => message.id)).toEqual([
    "message-9988",
    "message-9989",
    "message-9990",
    "message-9991",
    "message-9992",
    "message-9993",
    "message-9994",
    "message-9995",
    "message-9996",
    "message-9997",
    "message-9998",
    "message-9999",
  ]);
  expect(viewModel.orderedConversationMessagePartCount).toBe(10_000);
});

test("buildChatScreenViewModel derives the short mode label and the destination mode in Understand", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      selectedAssistantOperatingMode: "understand",
    },
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.shortModeLabel).toBe("Understand");
  expect(viewModel.nextShortModeLabel).toBe("Plan");
  expect(viewModel.nextModeAccentColor).toBe(chatScreenTheme.accentAmber);
});

test("buildChatScreenViewModel derives the short mode label and the destination mode in Plan", () => {
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

  expect(viewModel.shortModeLabel).toBe("Plan");
  expect(viewModel.nextShortModeLabel).toBe("Implementation");
  expect(viewModel.nextModeAccentColor).toBe(chatScreenTheme.accentGreen);
});

test("buildChatScreenViewModel derives the short mode label and the destination mode in Implementation", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      selectedAssistantOperatingMode: "implementation",
    },
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.shortModeLabel).toBe("Implementation");
  expect(viewModel.nextShortModeLabel).toBe("Understand");
  expect(viewModel.nextModeAccentColor).toBe(chatScreenTheme.accentPink);
});

function createChatSessionStateWithTranscript(input: { conversationMessageCount: number }): ChatSessionState {
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const orderedConversationMessageIds: string[] = [];

  for (let messageIndex = 0; messageIndex < input.conversationMessageCount; messageIndex += 1) {
    const messageId = `message-${messageIndex}`;
    const partId = `part-${messageIndex}`;
    orderedConversationMessageIds.push(messageId);
    conversationMessagesById[messageId] = {
      id: messageId,
      role: "user",
      messageStatus: "completed",
      createdAtMs: messageIndex,
      partIds: [partId],
    };
    conversationMessagePartsById[partId] = {
      id: partId,
      partKind: "user_text",
      text: `Prompt ${messageIndex}`,
    };
  }

  return {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
  };
}
