import { expect, test } from "bun:test";
import {
  applyAssistantResponseEventToChatSessionState,
  createInitialChatSessionState,
  insertTextIntoPromptDraftAtCursor,
  listOrderedConversationMessageParts,
  listOrderedConversationMessages,
  submitPromptDraft,
} from "../src/index.ts";

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
