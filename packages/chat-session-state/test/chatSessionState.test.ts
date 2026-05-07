import { expect, test } from "bun:test";
import type { AvailableAssistantModel } from "@buli/contracts";
import {
  applyAssistantResponseEventToChatSessionState,
  clearConversationTranscript,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatSessionState,
  cycleAssistantOperatingMode,
  hydrateConversationTranscriptFromSessionEntries,
  insertTextIntoPromptDraftAtCursor,
  listOrderedConversationMessageParts,
  listOrderedConversationMessages,
  selectAssistantOperatingMode,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingState,
  submitPromptDraft,
  toggleReasoningSummaryVisibility,
} from "../src/index.ts";

test("createInitialChatSessionState starts in implementation mode", () => {
  const chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(chatSessionState.selectedAssistantOperatingMode).toBe("implementation");
});

test("createInitialChatSessionState keeps the selected model default reasoning effort", () => {
  const chatSessionState = createInitialChatSessionState({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "xhigh",
  });

  expect(chatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");
});

test("model selection keeps the selected model default when the model default choice is used", () => {
  const availableAssistantModels = [
    {
      id: "gpt-5.5",
      displayName: "GPT-5.5",
      defaultReasoningEffort: "xhigh",
      supportedReasoningEfforts: ["high", "xhigh"],
    },
  ] satisfies AvailableAssistantModel[];
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.5" });

  chatSessionState = showModelSelectionLoadingState(chatSessionState);
  chatSessionState = showAvailableAssistantModelsForSelection(chatSessionState, availableAssistantModels);
  expect(chatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");

  chatSessionState = confirmHighlightedModelSelection(chatSessionState);
  chatSessionState = confirmHighlightedReasoningEffortChoice(chatSessionState);

  expect(chatSessionState.selectedModelId).toBe("gpt-5.5");
  expect(chatSessionState.selectedReasoningEffort).toBeUndefined();
  expect(chatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");
});

test("cycleAssistantOperatingMode switches between plan and implementation", () => {
  const implementationChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const planChatSessionState = cycleAssistantOperatingMode(implementationChatSessionState);
  const implementationAgainChatSessionState = cycleAssistantOperatingMode(planChatSessionState);

  expect(planChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(implementationAgainChatSessionState.selectedAssistantOperatingMode).toBe("implementation");
});

test("selectAssistantOperatingMode sets a specific mode", () => {
  const chatSessionState = selectAssistantOperatingMode(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    "plan",
  );

  expect(chatSessionState.selectedAssistantOperatingMode).toBe("plan");
});

test("createInitialChatSessionState shows reasoning summaries by default", () => {
  const chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });

  expect(chatSessionState.isReasoningSummaryVisible).toBe(true);
});

test("toggleReasoningSummaryVisibility flips reasoning summary display", () => {
  const visibleChatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  const hiddenChatSessionState = toggleReasoningSummaryVisibility(visibleChatSessionState);
  const visibleAgainChatSessionState = toggleReasoningSummaryVisibility(hiddenChatSessionState);

  expect(hiddenChatSessionState.isReasoningSummaryVisible).toBe(false);
  expect(visibleAgainChatSessionState.isReasoningSummaryVisible).toBe(true);
});

test("submitPromptDraft appends a completed user message and enters streaming state", () => {
  const promptDraftSubmission = submitPromptDraft(
    insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "Hello"),
  );
  if (!promptDraftSubmission.submittedPromptText) {
    throw new Error("expected a submitted prompt");
  }

  expect(promptDraftSubmission.submittedPromptText).toBe("Hello");
  expect(promptDraftSubmission.nextChatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");

  const orderedConversationMessages = listOrderedConversationMessages(promptDraftSubmission.nextChatSessionState);
  expect(orderedConversationMessages).toHaveLength(1);
  const submittedUserConversationMessage = orderedConversationMessages[0];
  if (!submittedUserConversationMessage) {
    throw new Error("expected a submitted user message");
  }

  expect(submittedUserConversationMessage.role).toBe("user");
  expect(listOrderedConversationMessageParts(promptDraftSubmission.nextChatSessionState, submittedUserConversationMessage.id)).toEqual([
    {
      id: submittedUserConversationMessage.partIds[0]!,
      partKind: "user_text",
      text: "Hello",
    },
  ]);
});

test("clearConversationTranscript clears visible conversation while preserving selections", () => {
  let chatSessionState = createInitialChatSessionState({
    selectedModelId: "gpt-5.5",
    selectedModelDefaultReasoningEffort: "xhigh",
    selectedReasoningEffort: "high",
  });
  chatSessionState = selectAssistantOperatingMode(chatSessionState, "plan");
  chatSessionState = toggleReasoningSummaryVisibility(chatSessionState);
  const promptDraftSubmission = submitPromptDraft(insertTextIntoPromptDraftAtCursor(chatSessionState, "Hello"));
  if (!promptDraftSubmission.submittedPromptText) {
    throw new Error("expected submitted prompt");
  }

  const clearedChatSessionState = clearConversationTranscript(promptDraftSubmission.nextChatSessionState);

  expect(clearedChatSessionState.selectedModelId).toBe("gpt-5.5");
  expect(clearedChatSessionState.selectedModelDefaultReasoningEffort).toBe("xhigh");
  expect(clearedChatSessionState.selectedReasoningEffort).toBe("high");
  expect(clearedChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(clearedChatSessionState.isReasoningSummaryVisible).toBe(false);
  expect(clearedChatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
  expect(listOrderedConversationMessages(clearedChatSessionState)).toEqual([]);
  expect(clearedChatSessionState.latestTokenUsage).toBeUndefined();
});

test("hydrateConversationTranscriptFromSessionEntries rebuilds visible persisted messages", () => {
  const chatSessionState = hydrateConversationTranscriptFromSessionEntries(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    [
      {
        entryKind: "user_prompt",
        promptText: "Run pwd",
        modelFacingPromptText: "Run pwd",
      },
      {
        entryKind: "tool_call",
        toolCallId: "call-1",
        toolCallRequest: {
          toolName: "bash",
          shellCommand: "pwd",
          commandDescription: "Print working directory",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId: "call-1",
        toolCallDetail: {
          toolName: "bash",
          commandLine: "pwd",
          commandDescription: "Print working directory",
        },
        toolResultText: "/tmp/demo",
      },
      {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "Done.",
      },
    ],
  );

  const conversationMessages = listOrderedConversationMessages(chatSessionState);
  expect(conversationMessages.map((conversationMessage) => conversationMessage.role)).toEqual(["user", "assistant"]);
  expect(listOrderedConversationMessageParts(chatSessionState, conversationMessages[0]!.id)).toEqual([
    {
      id: "persisted-entry-0-user-text",
      partKind: "user_text",
      text: "Run pwd",
    },
  ]);
  expect(listOrderedConversationMessageParts(chatSessionState, conversationMessages[1]!.id).map((conversationMessagePart) => conversationMessagePart.partKind)).toEqual([
    "assistant_tool_call",
    "assistant_text",
  ]);
  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
});

test("assistant_message_completed backfills turn summary usage and reasoning token count", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "Thinking",
      reasoningStartedAtMs: 1,
      reasoningDurationMs: 500,
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "turn-summary-1",
      partKind: "assistant_turn_summary",
      turnDurationMs: 1200,
      modelDisplayName: "gpt-5.4",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_completed",
    messageId: "assistant-1",
    usage: {
      total: 12,
      input: 5,
      output: 5,
      reasoning: 2,
      cache: { read: 0, write: 0 },
    },
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  if (!assistantConversationMessage) {
    throw new Error("expected assistant message");
  }

  expect(assistantConversationMessage.messageStatus).toBe("completed");
  expect(chatSessionState.latestTokenUsage?.reasoning).toBe(2);
  expect(listOrderedConversationMessageParts(chatSessionState, assistantConversationMessage.id)).toEqual([
    {
      id: "reasoning-1",
      partKind: "assistant_reasoning",
      partStatus: "completed",
      reasoningSummaryText: "Thinking",
      reasoningStartedAtMs: 1,
      reasoningDurationMs: 500,
      reasoningTokenCount: 2,
    },
    {
      id: "turn-summary-1",
      partKind: "assistant_turn_summary",
      turnDurationMs: 1200,
      modelDisplayName: "gpt-5.4",
      usage: {
        total: 12,
        input: 5,
        output: 5,
        reasoning: 2,
        cache: { read: 0, write: 0 },
      },
    },
  ]);
});

test("assistant_pending_tool_approval_requested stores dedicated approval state outside message parts", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: {
      id: "tool-1",
      partKind: "assistant_tool_call",
      toolCallId: "call-1",
      toolCallStatus: "pending_approval",
      toolCallStartedAtMs: 1,
      toolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });

  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_tool_approval");
  expect(chatSessionState.pendingToolApprovalRequest).toEqual({
    approvalId: "approval-1",
    pendingToolCallId: "call-1",
    pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    riskExplanation: "This command is destructive.",
  });
});

test("assistant_pending_tool_approval_cleared clears matching approval state and returns to streaming", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_cleared",
    approvalId: "approval-1",
  });

  expect(chatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
});

test("assistant_message_failed clears pending approval and records a failed assistant message", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_failed",
    messageId: "assistant-1",
    errorText: "provider failed",
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  expect(chatSessionState.conversationTurnStatus).toBe("assistant_response_failed");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
  expect(assistantConversationMessage?.messageStatus).toBe("failed");
  expect(
    listOrderedConversationMessageParts(chatSessionState, "assistant-1").some(
      (conversationMessagePart) =>
        conversationMessagePart.partKind === "assistant_error_notice" &&
        conversationMessagePart.errorText === "provider failed",
    ),
  ).toBe(true);
});

test("assistant_message_incomplete clears pending approval and returns to user input", () => {
  let chatSessionState = createInitialChatSessionState({ selectedModelId: "gpt-5.4" });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_turn_started",
    messageId: "assistant-1",
    startedAtMs: 1,
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
      riskExplanation: "This command is destructive.",
    },
  });
  chatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, {
    type: "assistant_message_incomplete",
    messageId: "assistant-1",
    incompleteReason: "max_output_tokens",
    usage: { total: 10, input: 5, output: 4, reasoning: 1, cache: { read: 0, write: 0 } },
  });

  const assistantConversationMessage = listOrderedConversationMessages(chatSessionState)[0];
  expect(chatSessionState.conversationTurnStatus).toBe("waiting_for_user_input");
  expect(chatSessionState.pendingToolApprovalRequest).toBeUndefined();
  expect(assistantConversationMessage?.messageStatus).toBe("incomplete");
});
