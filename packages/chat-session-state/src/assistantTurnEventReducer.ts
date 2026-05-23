import { randomUUID } from "node:crypto";
import type {
  AssistantResponseEvent,
  AssistantReasoningConversationMessagePart,
  AssistantTextConversationMessagePart,
  AssistantToolCallConversationMessagePart,
  ConversationMessage,
  ConversationMessagePart,
  PendingToolApprovalRequest,
  TokenUsage,
} from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

function appendConversationMessageIfMissing(input: {
  chatSessionState: ChatSessionState;
  conversationMessage: ConversationMessage;
}): ChatSessionState {
  if (input.chatSessionState.conversationMessagesById[input.conversationMessage.id]) {
    return input.chatSessionState;
  }

  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [input.conversationMessage.id]: input.conversationMessage,
    },
    orderedConversationMessageIds: [...input.chatSessionState.orderedConversationMessageIds, input.conversationMessage.id],
  };
}

function upsertConversationMessagePart(input: {
  chatSessionState: ChatSessionState;
  messageId: string;
  conversationMessagePart: ConversationMessagePart;
}): ChatSessionState {
  const existingConversationMessage = input.chatSessionState.conversationMessagesById[input.messageId];
  if (!existingConversationMessage) {
    return input.chatSessionState;
  }

  const nextPartIds = existingConversationMessage.partIds.includes(input.conversationMessagePart.id)
    ? existingConversationMessage.partIds
    : [...existingConversationMessage.partIds, input.conversationMessagePart.id];
  const hasExistingConversationMessagePart = Boolean(
    input.chatSessionState.conversationMessagePartsById[input.conversationMessagePart.id],
  );

  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [input.messageId]: {
        ...existingConversationMessage,
        partIds: nextPartIds,
      },
    },
    conversationMessagePartsById: {
      ...input.chatSessionState.conversationMessagePartsById,
      [input.conversationMessagePart.id]: input.conversationMessagePart,
    },
    conversationMessagePartCount: hasExistingConversationMessagePart
      ? input.chatSessionState.conversationMessagePartCount
      : input.chatSessionState.conversationMessagePartCount + 1,
  };
}

function updateConversationMessage(input: {
  chatSessionState: ChatSessionState;
  messageId: string;
  updateConversationMessage: (conversationMessage: ConversationMessage) => ConversationMessage;
}): ChatSessionState {
  const existingConversationMessage = input.chatSessionState.conversationMessagesById[input.messageId];
  if (!existingConversationMessage) {
    return input.chatSessionState;
  }

  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [input.messageId]: input.updateConversationMessage(existingConversationMessage),
    },
  };
}

function updateConversationMessageParts(input: {
  chatSessionState: ChatSessionState;
  messageId: string;
  updateConversationMessagePart: (conversationMessagePart: ConversationMessagePart) => ConversationMessagePart;
}): ChatSessionState {
  const conversationMessage = input.chatSessionState.conversationMessagesById[input.messageId];
  if (!conversationMessage) {
    return input.chatSessionState;
  }

  let hasChangedConversationMessagePart = false;
  const nextConversationMessagePartsById = { ...input.chatSessionState.conversationMessagePartsById };
  for (const partId of conversationMessage.partIds) {
    const existingConversationMessagePart = nextConversationMessagePartsById[partId];
    if (!existingConversationMessagePart) {
      continue;
    }

    const nextConversationMessagePart = input.updateConversationMessagePart(existingConversationMessagePart);
    if (nextConversationMessagePart !== existingConversationMessagePart) {
      nextConversationMessagePartsById[partId] = nextConversationMessagePart;
      hasChangedConversationMessagePart = true;
    }
  }

  if (!hasChangedConversationMessagePart) {
    return input.chatSessionState;
  }

  return {
    ...input.chatSessionState,
    conversationMessagePartsById: nextConversationMessagePartsById,
  };
}

function appendAssistantIncompleteNoticePartIfMissing(chatSessionState: ChatSessionState, messageId: string, incompleteReason: string): ChatSessionState {
  const conversationMessage = chatSessionState.conversationMessagesById[messageId];
  if (!conversationMessage) {
    return chatSessionState;
  }

  const hasIncompleteNoticePart = conversationMessage.partIds.some((partId) => {
    const conversationMessagePart = chatSessionState.conversationMessagePartsById[partId];
    return conversationMessagePart?.partKind === "assistant_incomplete_notice";
  });
  if (hasIncompleteNoticePart) {
    return chatSessionState;
  }

  return upsertConversationMessagePart({
    chatSessionState,
    messageId,
    conversationMessagePart: {
      id: `assistant-incomplete-${randomUUID()}`,
      partKind: "assistant_incomplete_notice",
      incompleteReason,
    },
  });
}

function appendAssistantErrorNoticePartIfMissing(chatSessionState: ChatSessionState, messageId: string, errorText: string): ChatSessionState {
  const conversationMessage = chatSessionState.conversationMessagesById[messageId];
  if (!conversationMessage) {
    return chatSessionState;
  }

  const hasErrorNoticePart = conversationMessage.partIds.some((partId) => {
    const conversationMessagePart = chatSessionState.conversationMessagePartsById[partId];
    return conversationMessagePart?.partKind === "assistant_error_notice";
  });
  if (hasErrorNoticePart) {
    return chatSessionState;
  }

  return upsertConversationMessagePart({
    chatSessionState,
    messageId,
    conversationMessagePart: {
      id: `assistant-error-${randomUUID()}`,
      partKind: "assistant_error_notice",
      errorText,
    },
  });
}

function appendAssistantInterruptedNoticePartIfMissing(
  chatSessionState: ChatSessionState,
  messageId: string,
  interruptionReason: string,
): ChatSessionState {
  const conversationMessage = chatSessionState.conversationMessagesById[messageId];
  if (!conversationMessage) {
    return chatSessionState;
  }

  const hasInterruptedNoticePart = conversationMessage.partIds.some((partId) => {
    const conversationMessagePart = chatSessionState.conversationMessagePartsById[partId];
    return conversationMessagePart?.partKind === "assistant_interrupted_notice";
  });
  if (hasInterruptedNoticePart) {
    return chatSessionState;
  }

  return upsertConversationMessagePart({
    chatSessionState,
    messageId,
    conversationMessagePart: {
      id: `assistant-interrupted-${randomUUID()}`,
      partKind: "assistant_interrupted_notice",
      interruptionReason,
    },
  });
}

function markCompletedConversationMessageParts(chatSessionState: ChatSessionState, messageId: string): ChatSessionState {
  return updateConversationMessageParts({
    chatSessionState,
    messageId,
    updateConversationMessagePart: (conversationMessagePart) => {
      if (conversationMessagePart.partKind === "assistant_text") {
        return {
          ...conversationMessagePart,
          partStatus: "completed",
        } satisfies AssistantTextConversationMessagePart;
      }

      if (conversationMessagePart.partKind === "assistant_reasoning" && conversationMessagePart.partStatus === "streaming") {
        return {
          ...conversationMessagePart,
          partStatus: "completed",
        } satisfies AssistantReasoningConversationMessagePart;
      }

      if (
        conversationMessagePart.partKind === "assistant_tool_call" &&
        (conversationMessagePart.toolCallStatus === "running" || conversationMessagePart.toolCallStatus === "pending_approval")
      ) {
        return {
          ...conversationMessagePart,
          toolCallStatus: "interrupted",
          errorText: "Tool call did not finish before the assistant message completed.",
        } satisfies AssistantToolCallConversationMessagePart;
      }

      return conversationMessagePart;
    },
  });
}

function markIncompleteConversationMessageParts(input: {
  chatSessionState: ChatSessionState;
  messageId: string;
  incompleteToolCallErrorText: string;
}): ChatSessionState {
  return updateConversationMessageParts({
    chatSessionState: input.chatSessionState,
    messageId: input.messageId,
    updateConversationMessagePart: (conversationMessagePart) => {
      if (conversationMessagePart.partKind === "assistant_text") {
        return {
          ...conversationMessagePart,
          partStatus: "incomplete",
        } satisfies AssistantTextConversationMessagePart;
      }

      if (conversationMessagePart.partKind === "assistant_reasoning" && conversationMessagePart.partStatus === "streaming") {
        return {
          ...conversationMessagePart,
          partStatus: "interrupted",
        } satisfies AssistantReasoningConversationMessagePart;
      }

      if (
        conversationMessagePart.partKind === "assistant_tool_call" &&
        (conversationMessagePart.toolCallStatus === "running" || conversationMessagePart.toolCallStatus === "pending_approval")
      ) {
        return {
          ...conversationMessagePart,
          toolCallStatus: "interrupted",
          errorText: input.incompleteToolCallErrorText,
        } satisfies AssistantToolCallConversationMessagePart;
      }

      return conversationMessagePart;
    },
  });
}

function markFailedConversationMessageParts(input: {
  chatSessionState: ChatSessionState;
  messageId: string;
  failureExplanation: string;
}): ChatSessionState {
  return updateConversationMessageParts({
    chatSessionState: input.chatSessionState,
    messageId: input.messageId,
    updateConversationMessagePart: (conversationMessagePart) => {
      if (conversationMessagePart.partKind === "assistant_text") {
        return {
          ...conversationMessagePart,
          partStatus: "failed",
        } satisfies AssistantTextConversationMessagePart;
      }

      if (conversationMessagePart.partKind === "assistant_reasoning" && conversationMessagePart.partStatus === "streaming") {
        return {
          ...conversationMessagePart,
          partStatus: "interrupted",
        } satisfies AssistantReasoningConversationMessagePart;
      }

      if (
        conversationMessagePart.partKind === "assistant_tool_call" &&
        (conversationMessagePart.toolCallStatus === "running" || conversationMessagePart.toolCallStatus === "pending_approval")
      ) {
        return {
          ...conversationMessagePart,
          toolCallStatus: "failed",
          errorText: input.failureExplanation,
        } satisfies AssistantToolCallConversationMessagePart;
      }

      return conversationMessagePart;
    },
  });
}

function markInterruptedConversationMessageParts(input: {
  chatSessionState: ChatSessionState;
  messageId: string;
  interruptedToolCallErrorText: string;
}): ChatSessionState {
  return updateConversationMessageParts({
    chatSessionState: input.chatSessionState,
    messageId: input.messageId,
    updateConversationMessagePart: (conversationMessagePart) => {
      if (conversationMessagePart.partKind === "assistant_text") {
        return {
          ...conversationMessagePart,
          partStatus: "interrupted",
        } satisfies AssistantTextConversationMessagePart;
      }

      if (conversationMessagePart.partKind === "assistant_reasoning") {
        return conversationMessagePart.partStatus === "streaming"
          ? {
              ...conversationMessagePart,
              partStatus: "interrupted",
            } satisfies AssistantReasoningConversationMessagePart
          : conversationMessagePart;
      }

      if (conversationMessagePart.partKind === "assistant_tool_call") {
        if (
          conversationMessagePart.toolCallStatus !== "running" &&
          conversationMessagePart.toolCallStatus !== "pending_approval"
        ) {
          return conversationMessagePart;
        }

        return {
          ...conversationMessagePart,
          toolCallStatus: "interrupted",
          errorText: input.interruptedToolCallErrorText,
        } satisfies AssistantToolCallConversationMessagePart;
      }

      return conversationMessagePart;
    },
  });
}

function backfillAssistantTurnSummaryUsageForMessage(
  chatSessionState: ChatSessionState,
  messageId: string,
  usage: TokenUsage,
): ChatSessionState {
  const conversationMessage = chatSessionState.conversationMessagesById[messageId];
  if (!conversationMessage) {
    return chatSessionState;
  }

  const assistantTurnSummaryPartId = [...conversationMessage.partIds]
    .reverse()
    .find((partId) => chatSessionState.conversationMessagePartsById[partId]?.partKind === "assistant_turn_summary");
  if (!assistantTurnSummaryPartId) {
    return chatSessionState;
  }

  const assistantTurnSummaryPart = chatSessionState.conversationMessagePartsById[assistantTurnSummaryPartId];
  if (!assistantTurnSummaryPart || assistantTurnSummaryPart.partKind !== "assistant_turn_summary") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    conversationMessagePartsById: {
      ...chatSessionState.conversationMessagePartsById,
      [assistantTurnSummaryPartId]: {
        ...assistantTurnSummaryPart,
        usage,
      },
    },
  };
}

function backfillCompletedReasoningPartTokenCountForMessage(
  chatSessionState: ChatSessionState,
  messageId: string,
  reasoningTokenCount: number,
): ChatSessionState {
  const completedReasoningPartIds = listCompletedReasoningPartIdsForMessage(chatSessionState, messageId);
  if (completedReasoningPartIds.length !== 1) {
    return chatSessionState;
  }

  const completedReasoningPartId = completedReasoningPartIds[0];
  const completedReasoningPart = completedReasoningPartId
    ? chatSessionState.conversationMessagePartsById[completedReasoningPartId]
    : undefined;
  if (!completedReasoningPart || completedReasoningPart.partKind !== "assistant_reasoning") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    conversationMessagePartsById: {
      ...chatSessionState.conversationMessagePartsById,
      [completedReasoningPart.id]: {
        ...completedReasoningPart,
        reasoningTokenCount,
      },
    },
  };
}

function listCompletedReasoningPartIdsForMessage(chatSessionState: ChatSessionState, messageId: string): string[] {
  const conversationMessage = chatSessionState.conversationMessagesById[messageId];
  if (!conversationMessage) {
    return [];
  }

  return conversationMessage.partIds.filter((partId) => {
    const conversationMessagePart = chatSessionState.conversationMessagePartsById[partId];
    return conversationMessagePart?.partKind === "assistant_reasoning" && conversationMessagePart.partStatus === "completed";
  });
}

function clearPendingToolApprovalRequest(
  chatSessionState: ChatSessionState,
  expectedApprovalId: string | undefined,
): PendingToolApprovalRequest | undefined {
  if (!chatSessionState.pendingToolApprovalRequest) {
    return chatSessionState.pendingToolApprovalRequest;
  }

  if (!expectedApprovalId || chatSessionState.pendingToolApprovalRequest.approvalId === expectedApprovalId) {
    return undefined;
  }

  return chatSessionState.pendingToolApprovalRequest;
}

export function applyAssistantResponseEventToChatSessionState(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEvent,
): ChatSessionState {
  if (assistantResponseEvent.type === "assistant_turn_started") {
    return appendConversationMessageIfMissing({
      chatSessionState: {
        ...chatSessionState,
        conversationTurnStatus: "streaming_assistant_response",
        latestTokenUsage: undefined,
        latestContextWindowUsage: undefined,
        pendingToolApprovalRequest: undefined,
      },
      conversationMessage: {
        id: assistantResponseEvent.messageId,
        role: "assistant",
        messageStatus: "streaming",
        createdAtMs: assistantResponseEvent.startedAtMs,
        partIds: [],
      },
    });
  }

  if (assistantResponseEvent.type === "assistant_message_part_added") {
    return upsertConversationMessagePart({
      chatSessionState,
      messageId: assistantResponseEvent.messageId,
      conversationMessagePart: assistantResponseEvent.part,
    });
  }

  if (assistantResponseEvent.type === "assistant_message_part_updated") {
    return upsertConversationMessagePart({
      chatSessionState,
      messageId: assistantResponseEvent.messageId,
      conversationMessagePart: assistantResponseEvent.part,
    });
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_requested") {
    return {
      ...chatSessionState,
      conversationTurnStatus: "waiting_for_tool_approval",
      pendingToolApprovalRequest: assistantResponseEvent.approvalRequest,
    };
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_cleared") {
    return {
      ...chatSessionState,
      conversationTurnStatus:
        chatSessionState.conversationTurnStatus === "waiting_for_tool_approval"
          ? "streaming_assistant_response"
          : chatSessionState.conversationTurnStatus,
      pendingToolApprovalRequest: clearPendingToolApprovalRequest(chatSessionState, assistantResponseEvent.approvalId),
    };
  }

  if (assistantResponseEvent.type === "assistant_message_completed") {
    return backfillCompletedReasoningPartTokenCountForMessage(
      backfillAssistantTurnSummaryUsageForMessage(
        markCompletedConversationMessageParts(updateConversationMessage({
          chatSessionState: {
            ...chatSessionState,
            conversationTurnStatus: "waiting_for_user_input",
            latestTokenUsage: assistantResponseEvent.usage,
            latestContextWindowUsage: assistantResponseEvent.contextWindowUsage ?? assistantResponseEvent.usage,
            pendingToolApprovalRequest: undefined,
          },
          messageId: assistantResponseEvent.messageId,
          updateConversationMessage: (conversationMessage) => ({
            ...conversationMessage,
            messageStatus: "completed",
          }),
        }), assistantResponseEvent.messageId),
        assistantResponseEvent.messageId,
        assistantResponseEvent.usage,
      ),
      assistantResponseEvent.messageId,
      assistantResponseEvent.usage.reasoning,
    );
  }

  if (assistantResponseEvent.type === "assistant_message_incomplete") {
    return backfillCompletedReasoningPartTokenCountForMessage(
      backfillAssistantTurnSummaryUsageForMessage(
        appendAssistantIncompleteNoticePartIfMissing(
          markIncompleteConversationMessageParts({
            chatSessionState: updateConversationMessage({
              chatSessionState: {
                ...chatSessionState,
                conversationTurnStatus: "waiting_for_user_input",
                latestTokenUsage: assistantResponseEvent.usage,
                latestContextWindowUsage: assistantResponseEvent.contextWindowUsage ?? assistantResponseEvent.usage,
                pendingToolApprovalRequest: undefined,
              },
              messageId: assistantResponseEvent.messageId,
              updateConversationMessage: (conversationMessage) => ({
                ...conversationMessage,
                messageStatus: "incomplete",
              }),
            }),
            messageId: assistantResponseEvent.messageId,
            incompleteToolCallErrorText: `Assistant message became incomplete: ${assistantResponseEvent.incompleteReason}`,
          }),
          assistantResponseEvent.messageId,
          assistantResponseEvent.incompleteReason,
        ),
        assistantResponseEvent.messageId,
        assistantResponseEvent.usage,
      ),
      assistantResponseEvent.messageId,
      assistantResponseEvent.usage.reasoning,
    );
  }

  if (assistantResponseEvent.type === "assistant_message_failed") {
    return appendAssistantErrorNoticePartIfMissing(
      markFailedConversationMessageParts({
        chatSessionState: updateConversationMessage({
          chatSessionState: {
            ...chatSessionState,
            conversationTurnStatus: "waiting_for_user_input",
            pendingToolApprovalRequest: undefined,
          },
          messageId: assistantResponseEvent.messageId,
          updateConversationMessage: (conversationMessage) => ({
            ...conversationMessage,
            messageStatus: "failed",
          }),
        }),
        messageId: assistantResponseEvent.messageId,
        failureExplanation: assistantResponseEvent.errorText,
      }),
      assistantResponseEvent.messageId,
      assistantResponseEvent.errorText,
    );
  }

  if (assistantResponseEvent.type === "assistant_message_interrupted") {
    return appendAssistantInterruptedNoticePartIfMissing(
      markInterruptedConversationMessageParts({
        chatSessionState: updateConversationMessage({
          chatSessionState: {
            ...chatSessionState,
            conversationTurnStatus: "waiting_for_user_input",
            pendingToolApprovalRequest: undefined,
          },
          messageId: assistantResponseEvent.messageId,
          updateConversationMessage: (conversationMessage) => ({
            ...conversationMessage,
            messageStatus: "interrupted",
          }),
        }),
        messageId: assistantResponseEvent.messageId,
        interruptedToolCallErrorText: assistantResponseEvent.interruptionReason,
      }),
      assistantResponseEvent.messageId,
      assistantResponseEvent.interruptionReason,
    );
  }

  const unreachableAssistantResponseEvent: never = assistantResponseEvent;
  return unreachableAssistantResponseEvent;
}

export function applyAssistantResponseEventsToChatSessionState(
  chatSessionState: ChatSessionState,
  assistantResponseEvents: readonly AssistantResponseEvent[],
): ChatSessionState {
  let nextChatSessionState = chatSessionState;
  for (const assistantResponseEvent of assistantResponseEvents) {
    nextChatSessionState = applyAssistantResponseEventToChatSessionState(nextChatSessionState, assistantResponseEvent);
  }
  return nextChatSessionState;
}
