import { expect, test } from "bun:test";
import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { chatScreenTheme, minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import {
  createInitialChatSessionState,
  insertTextIntoPromptDraftAtCursor,
  type ChatSessionState,
} from "@buli/chat-session-state";
import {
  buildChatScreenViewModel,
  buildStableChatScreenTranscriptViewModel,
} from "../src/behavior/chatScreenViewModel.ts";

test("buildChatScreenViewModel keeps prompt input enabled while a turn is streaming", () => {
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

  expect(viewModel.isPromptInputDisabled).toBe(false);
});

test("buildChatScreenViewModel disables prompt input while waiting for tool approval", () => {
  const chatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "next prompt"),
    conversationTurnStatus: "waiting_for_tool_approval" as const,
  };

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.isPromptInputDisabled).toBe(true);
});

test("buildChatScreenViewModel disables prompt input while command help owns interaction", () => {
  const chatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "hidden draft"),
    isCommandHelpModalVisible: true,
  };

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.isPromptInputDisabled).toBe(true);
});

test("buildChatScreenViewModel keeps prompt input enabled while auto conversation compaction is running", () => {
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

  expect(viewModel.isPromptInputDisabled).toBe(false);
});

test("buildChatScreenViewModel disables prompt input while manual conversation compaction is running", () => {
  const chatSessionState = insertTextIntoPromptDraftAtCursor(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "next prompt",
  );

  const viewModel = buildChatScreenViewModel({
    chatSessionState,
    conversationSessionCompactionStatus: { step: "compacting", source: "manual" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.isPromptInputDisabled).toBe(true);
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

  expect(viewModel.inputPanelAccentColor).toBe(chatScreenTheme.accentAmber);
});

test("buildChatScreenViewModel derives understand-mode pink input copy", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.inputPanelAccentColor).toBe(chatScreenTheme.accentPink);
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
  expect(viewModel.contextMeterTokenLimit).toBe(840_000);
  expect(viewModel.shouldRenderMinimumHeightPromptStrip).toBe(true);
  expect(viewModel.inputRegionRowCount).toBe(1);
});

test("buildChatScreenViewModel derives the effective GPT 5.5 working budget for the context meter", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.5" }),
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 140,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.contextWindowTokenCapacity).toBe(1_050_000);
  expect(viewModel.contextMeterTokenLimit).toBe(252_000);
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

test("buildChatScreenViewModel derives footer mode transition labels", () => {
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
  expect(viewModel.promptInputHintOverride).toBeUndefined();
});

test("buildChatScreenViewModel derives footer reasoning effort label", () => {
  const viewModel = buildChatScreenViewModel({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4", selectedModelDefaultReasoningEffort: "xhigh" }),
      selectedReasoningEffort: "low",
    },
    conversationSessionCompactionStatus: { step: "idle" },
    terminalRowCount: 32,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
  });

  expect(viewModel.reasoningEffortLabel).toBe("low");
});

test("buildChatScreenViewModel hydrates only the requested visible tail for large transcripts", () => {
  const readConversationMessageIds: string[] = [];
  const readConversationMessagePartIds: string[] = [];
  const chatSessionState = createChatSessionStateWithTranscript({
    conversationMessageCount: 10_000,
    onConversationMessageRead: (conversationMessageId) => {
      readConversationMessageIds.push(conversationMessageId);
    },
    onConversationMessagePartRead: (conversationMessagePartId) => {
      readConversationMessagePartIds.push(conversationMessagePartId);
    },
  });

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
  expect(viewModel.visibleConversationMessageIds).toEqual([
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
  expect(readConversationMessageIds).toEqual([
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
  expect(readConversationMessagePartIds).toEqual([]);
  expect(viewModel.visibleConversationMessagePartCount).toBe(12);
  expect(viewModel.orderedConversationMessagePartCount).toBe(10_000);
});

test("buildStableChatScreenTranscriptViewModel reuses transcript output across prompt-only edits", () => {
  const chatSessionState = createChatSessionStateWithTranscript({
    conversationMessageCount: 100,
  });
  const firstTranscriptSelection = buildStableChatScreenTranscriptViewModel({
    chatSessionState,
    requestedVisibleConversationMessageCount: 12,
    previousCache: undefined,
  });
  const chatSessionStateWithPromptEdit = insertTextIntoPromptDraftAtCursor(chatSessionState, "draft change");

  const secondTranscriptSelection = buildStableChatScreenTranscriptViewModel({
    chatSessionState: chatSessionStateWithPromptEdit,
    requestedVisibleConversationMessageCount: 12,
    previousCache: firstTranscriptSelection.nextCache,
  });

  expect(secondTranscriptSelection.transcriptViewModel).toBe(firstTranscriptSelection.transcriptViewModel);
  expect(secondTranscriptSelection.transcriptViewModel.visibleConversationMessageIds).toBe(
    firstTranscriptSelection.transcriptViewModel.visibleConversationMessageIds,
  );
});

test("buildStableChatScreenTranscriptViewModel reuses transcript output when only hidden parts change", () => {
  const chatSessionState = createChatSessionStateWithTranscript({
    conversationMessageCount: 100,
  });
  const firstTranscriptSelection = buildStableChatScreenTranscriptViewModel({
    chatSessionState,
    requestedVisibleConversationMessageCount: 12,
    previousCache: undefined,
  });
  const chatSessionStateWithHiddenPartEdit: ChatSessionState = {
    ...chatSessionState,
    conversationMessagePartsById: {
      ...chatSessionState.conversationMessagePartsById,
      "part-0": { id: "part-0", partKind: "user_text", text: "Hidden prompt changed" },
    },
  };

  const secondTranscriptSelection = buildStableChatScreenTranscriptViewModel({
    chatSessionState: chatSessionStateWithHiddenPartEdit,
    requestedVisibleConversationMessageCount: 12,
    previousCache: firstTranscriptSelection.nextCache,
  });

  expect(secondTranscriptSelection.transcriptViewModel).toBe(firstTranscriptSelection.transcriptViewModel);
});

test("buildStableChatScreenTranscriptViewModel reuses transcript output when row content changes", () => {
  const chatSessionState = createChatSessionStateWithTranscript({
    conversationMessageCount: 100,
  });
  const firstTranscriptSelection = buildStableChatScreenTranscriptViewModel({
    chatSessionState,
    requestedVisibleConversationMessageCount: 3,
    previousCache: undefined,
  });
  const changedVisiblePart: ConversationMessagePart = {
    id: "part-99",
    partKind: "user_text",
    text: "Visible prompt changed",
  };
  const chatSessionStateWithVisiblePartEdit: ChatSessionState = {
    ...chatSessionState,
    conversationMessagePartsById: {
      ...chatSessionState.conversationMessagePartsById,
      [changedVisiblePart.id]: changedVisiblePart,
    },
  };

  const secondTranscriptSelection = buildStableChatScreenTranscriptViewModel({
    chatSessionState: chatSessionStateWithVisiblePartEdit,
    requestedVisibleConversationMessageCount: 3,
    previousCache: firstTranscriptSelection.nextCache,
  });

  expect(secondTranscriptSelection.transcriptViewModel).toBe(firstTranscriptSelection.transcriptViewModel);
  expect(secondTranscriptSelection.transcriptViewModel.visibleConversationMessageIds).toBe(
    firstTranscriptSelection.transcriptViewModel.visibleConversationMessageIds,
  );
});

function createChatSessionStateWithTranscript(input: {
  conversationMessageCount: number;
  onConversationMessageRead?: (conversationMessageId: string) => void;
  onConversationMessagePartRead?: (conversationMessagePartId: string) => void;
}): ChatSessionState {
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const orderedConversationMessageIds: string[] = [];

  for (let messageIndex = 0; messageIndex < input.conversationMessageCount; messageIndex += 1) {
    const messageId = `message-${messageIndex}`;
    const partId = `part-${messageIndex}`;
    const conversationMessage: ConversationMessage = {
      id: messageId,
      role: "user",
      messageStatus: "completed",
      createdAtMs: messageIndex,
      partIds: [partId],
    };
    orderedConversationMessageIds.push(messageId);
    Object.defineProperty(conversationMessagesById, messageId, {
      enumerable: true,
      get() {
        input.onConversationMessageRead?.(messageId);
        return conversationMessage;
      },
    });
    const conversationMessagePart: ConversationMessagePart = {
      id: partId,
      partKind: "user_text",
      text: `Prompt ${messageIndex}`,
    };
    Object.defineProperty(conversationMessagePartsById, partId, {
      enumerable: true,
      get() {
        input.onConversationMessagePartRead?.(partId);
        return conversationMessagePart;
      },
    });
  }

  return {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
    conversationMessagePartCount: input.conversationMessageCount,
  };
}
