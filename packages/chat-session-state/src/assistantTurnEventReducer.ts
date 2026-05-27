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

type ConversationMessagePartsByIdOverlay = {
  baseConversationMessagePartsById: Record<string, ConversationMessagePart>;
  changedConversationMessagePartsById: Record<string, ConversationMessagePart>;
};

type ConversationMessagesByIdOverlay = {
  baseConversationMessagesById: Record<string, ConversationMessage>;
  changedConversationMessagesById: Record<string, ConversationMessage>;
};

const conversationMessagePartsByIdOverlayMetadata = new WeakMap<
  Record<string, ConversationMessagePart>,
  ConversationMessagePartsByIdOverlay
>();
const conversationMessagesByIdOverlayMetadata = new WeakMap<
  Record<string, ConversationMessage>,
  ConversationMessagesByIdOverlay
>();

function overlayConversationMessageById(input: {
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessage: ConversationMessage;
}): Record<string, ConversationMessage> {
  const existingOverlay = conversationMessagesByIdOverlayMetadata.get(input.conversationMessagesById);
  const baseConversationMessagesById = existingOverlay?.baseConversationMessagesById ?? input.conversationMessagesById;
  const changedConversationMessagesById: Record<string, ConversationMessage> = {
    ...(existingOverlay?.changedConversationMessagesById ?? {}),
    [input.conversationMessage.id]: input.conversationMessage,
  };

  const nextConversationMessagesById = new Proxy(changedConversationMessagesById, {
    get(target, propertyKey) {
      if (typeof propertyKey === "string" && Object.prototype.hasOwnProperty.call(target, propertyKey)) {
        return target[propertyKey];
      }

      return Reflect.get(baseConversationMessagesById, propertyKey);
    },
    has(target, propertyKey) {
      return Reflect.has(target, propertyKey) || Reflect.has(baseConversationMessagesById, propertyKey);
    },
    ownKeys(target) {
      const conversationMessageIds = new Set<string | symbol>();
      for (const conversationMessageId of Reflect.ownKeys(baseConversationMessagesById)) {
        conversationMessageIds.add(conversationMessageId);
      }
      for (const conversationMessageId of Reflect.ownKeys(target)) {
        conversationMessageIds.add(conversationMessageId);
      }
      return [...conversationMessageIds];
    },
    getOwnPropertyDescriptor(target, propertyKey) {
      const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, propertyKey);
      if (targetDescriptor) {
        return targetDescriptor;
      }

      const baseDescriptor = Reflect.getOwnPropertyDescriptor(baseConversationMessagesById, propertyKey);
      if (!baseDescriptor) {
        return undefined;
      }

      return {
        ...baseDescriptor,
        configurable: true,
      };
    },
  });
  conversationMessagesByIdOverlayMetadata.set(nextConversationMessagesById, {
    baseConversationMessagesById,
    changedConversationMessagesById,
  });
  return nextConversationMessagesById;
}

function overlayConversationMessagePartById(input: {
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  conversationMessagePart: ConversationMessagePart;
}): Record<string, ConversationMessagePart> {
  const existingOverlay = conversationMessagePartsByIdOverlayMetadata.get(input.conversationMessagePartsById);
  const baseConversationMessagePartsById = existingOverlay?.baseConversationMessagePartsById ??
    input.conversationMessagePartsById;
  const changedConversationMessagePartsById: Record<string, ConversationMessagePart> = {
    ...(existingOverlay?.changedConversationMessagePartsById ?? {}),
    [input.conversationMessagePart.id]: input.conversationMessagePart,
  };

  // Streaming updates usually replace one part at a time. This preserves Record semantics
  // without copying every historical part on each chunk.
  const nextConversationMessagePartsById = new Proxy(changedConversationMessagePartsById, {
    get(target, propertyKey) {
      if (typeof propertyKey === "string" && Object.prototype.hasOwnProperty.call(target, propertyKey)) {
        return target[propertyKey];
      }

      return Reflect.get(baseConversationMessagePartsById, propertyKey);
    },
    has(target, propertyKey) {
      return Reflect.has(target, propertyKey) || Reflect.has(baseConversationMessagePartsById, propertyKey);
    },
    ownKeys(target) {
      const conversationMessagePartIds = new Set<string | symbol>();
      for (const conversationMessagePartId of Reflect.ownKeys(baseConversationMessagePartsById)) {
        conversationMessagePartIds.add(conversationMessagePartId);
      }
      for (const conversationMessagePartId of Reflect.ownKeys(target)) {
        conversationMessagePartIds.add(conversationMessagePartId);
      }
      return [...conversationMessagePartIds];
    },
    getOwnPropertyDescriptor(target, propertyKey) {
      const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, propertyKey);
      if (targetDescriptor) {
        return targetDescriptor;
      }

      const baseDescriptor = Reflect.getOwnPropertyDescriptor(baseConversationMessagePartsById, propertyKey);
      if (!baseDescriptor) {
        return undefined;
      }

      return {
        ...baseDescriptor,
        configurable: true,
      };
    },
  });
  conversationMessagePartsByIdOverlayMetadata.set(nextConversationMessagePartsById, {
    baseConversationMessagePartsById,
    changedConversationMessagePartsById,
  });
  return nextConversationMessagePartsById;
}

function appendConversationMessageIfMissing(input: {
  chatSessionState: ChatSessionState;
  conversationMessage: ConversationMessage;
}): ChatSessionState {
  if (input.chatSessionState.conversationMessagesById[input.conversationMessage.id]) {
    return input.chatSessionState;
  }

  return {
    ...input.chatSessionState,
    conversationMessagesById: overlayConversationMessageById({
      conversationMessagesById: input.chatSessionState.conversationMessagesById,
      conversationMessage: input.conversationMessage,
    }),
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

  const doesConversationMessageAlreadyReferencePart = existingConversationMessage.partIds.includes(input.conversationMessagePart.id);
  const hasExistingConversationMessagePart = Boolean(
    input.chatSessionState.conversationMessagePartsById[input.conversationMessagePart.id],
  );

  if (doesConversationMessageAlreadyReferencePart) {
    return {
      ...input.chatSessionState,
      conversationMessagePartsById: overlayConversationMessagePartById({
        conversationMessagePartsById: input.chatSessionState.conversationMessagePartsById,
        conversationMessagePart: input.conversationMessagePart,
      }),
      conversationMessagePartCount: hasExistingConversationMessagePart
        ? input.chatSessionState.conversationMessagePartCount
        : input.chatSessionState.conversationMessagePartCount + 1,
    };
  }

  return {
    ...input.chatSessionState,
    conversationMessagesById: overlayConversationMessageById({
      conversationMessagesById: input.chatSessionState.conversationMessagesById,
      conversationMessage: {
        ...existingConversationMessage,
        partIds: [...existingConversationMessage.partIds, input.conversationMessagePart.id],
      },
    }),
    conversationMessagePartsById: overlayConversationMessagePartById({
      conversationMessagePartsById: input.chatSessionState.conversationMessagePartsById,
      conversationMessagePart: input.conversationMessagePart,
    }),
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
    conversationMessagesById: overlayConversationMessageById({
      conversationMessagesById: input.chatSessionState.conversationMessagesById,
      conversationMessage: input.updateConversationMessage(existingConversationMessage),
    }),
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
  let nextConversationMessagePartsById = input.chatSessionState.conversationMessagePartsById;
  for (const partId of conversationMessage.partIds) {
    const existingConversationMessagePart = nextConversationMessagePartsById[partId];
    if (!existingConversationMessagePart) {
      continue;
    }

    const nextConversationMessagePart = input.updateConversationMessagePart(existingConversationMessagePart);
    if (nextConversationMessagePart !== existingConversationMessagePart) {
      nextConversationMessagePartsById = overlayConversationMessagePartById({
        conversationMessagePartsById: nextConversationMessagePartsById,
        conversationMessagePart: nextConversationMessagePart,
      });
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
    conversationMessagePartsById: overlayConversationMessagePartById({
      conversationMessagePartsById: chatSessionState.conversationMessagePartsById,
      conversationMessagePart: {
        ...assistantTurnSummaryPart,
        usage,
      },
    }),
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
    conversationMessagePartsById: overlayConversationMessagePartById({
      conversationMessagePartsById: chatSessionState.conversationMessagePartsById,
      conversationMessagePart: {
        ...completedReasoningPart,
        reasoningTokenCount,
      },
    }),
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

type AssistantResponseEventType = AssistantResponseEvent["type"];
type AssistantResponseEventByType<EventType extends AssistantResponseEventType> = Extract<
  AssistantResponseEvent,
  { type: EventType }
>;

export type AssistantResponseEventsChatSessionStateChangeSet = {
  changedConversationMessageIds: readonly string[];
  didConversationMessageOrderChange: boolean;
  didTranscriptGlobalStateChange: boolean;
  didPromptComposerStateChange: boolean;
  didInteractionStatusStateChange: boolean;
};

export type AssistantResponseEventsChatSessionStateApplication = {
  nextChatSessionState: ChatSessionState;
  changeSet: AssistantResponseEventsChatSessionStateChangeSet;
};
type AssistantResponseEventReducer<EventType extends AssistantResponseEventType> = (
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<EventType>,
) => ChatSessionState;

const assistantResponseEventReducerByType: {
  readonly [EventType in AssistantResponseEventType]: AssistantResponseEventReducer<EventType>;
} = {
  assistant_turn_started: applyAssistantTurnStartedEvent,
  assistant_message_part_added: applyAssistantMessagePartAddedEvent,
  assistant_message_part_updated: applyAssistantMessagePartUpdatedEvent,
  assistant_pending_tool_approval_requested: applyAssistantPendingToolApprovalRequestedEvent,
  assistant_pending_tool_approval_cleared: applyAssistantPendingToolApprovalClearedEvent,
  assistant_message_completed: applyAssistantMessageCompletedEvent,
  assistant_message_incomplete: applyAssistantMessageIncompleteEvent,
  assistant_message_failed: applyAssistantMessageFailedEvent,
  assistant_message_interrupted: applyAssistantMessageInterruptedEvent,
};

function resolveAssistantResponseEventReducer<EventType extends AssistantResponseEventType>(
  assistantResponseEvent: AssistantResponseEventByType<EventType>,
): AssistantResponseEventReducer<EventType> {
  return assistantResponseEventReducerByType[assistantResponseEvent.type] as AssistantResponseEventReducer<EventType>;
}

export function applyAssistantResponseEventToChatSessionState(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEvent,
): ChatSessionState {
  return resolveAssistantResponseEventReducer(assistantResponseEvent)(chatSessionState, assistantResponseEvent);
}

export function applyAssistantResponseEventToChatSessionStateWithChangeSet(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEvent,
): AssistantResponseEventsChatSessionStateApplication {
  const nextChatSessionState = applyAssistantResponseEventToChatSessionState(chatSessionState, assistantResponseEvent);
  return {
    nextChatSessionState,
    changeSet: buildAssistantResponseEventChangeSet({
      previousChatSessionState: chatSessionState,
      nextChatSessionState,
      assistantResponseEvent,
    }),
  };
}

function applyAssistantTurnStartedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_turn_started">,
): ChatSessionState {
  return appendConversationMessageIfMissing({
    chatSessionState: {
      ...chatSessionState,
      conversationTurnStatus: "streaming_assistant_response",
      latestTokenUsage: undefined,
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

function applyAssistantMessagePartAddedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_message_part_added">,
): ChatSessionState {
  return upsertConversationMessagePart({
    chatSessionState,
    messageId: assistantResponseEvent.messageId,
    conversationMessagePart: assistantResponseEvent.part,
  });
}

function applyAssistantMessagePartUpdatedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_message_part_updated">,
): ChatSessionState {
  return upsertConversationMessagePart({
    chatSessionState,
    messageId: assistantResponseEvent.messageId,
    conversationMessagePart: assistantResponseEvent.part,
  });
}

function applyAssistantPendingToolApprovalRequestedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_pending_tool_approval_requested">,
): ChatSessionState {
  return {
    ...chatSessionState,
    conversationTurnStatus: "waiting_for_tool_approval",
    pendingToolApprovalRequest: assistantResponseEvent.approvalRequest,
  };
}

function applyAssistantPendingToolApprovalClearedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_pending_tool_approval_cleared">,
): ChatSessionState {
  return {
    ...chatSessionState,
    conversationTurnStatus:
      chatSessionState.conversationTurnStatus === "waiting_for_tool_approval"
        ? "streaming_assistant_response"
        : chatSessionState.conversationTurnStatus,
    pendingToolApprovalRequest: clearPendingToolApprovalRequest(chatSessionState, assistantResponseEvent.approvalId),
  };
}

function applyAssistantMessageCompletedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_message_completed">,
): ChatSessionState {
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

function applyAssistantMessageIncompleteEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_message_incomplete">,
): ChatSessionState {
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

function applyAssistantMessageFailedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_message_failed">,
): ChatSessionState {
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

function applyAssistantMessageInterruptedEvent(
  chatSessionState: ChatSessionState,
  assistantResponseEvent: AssistantResponseEventByType<"assistant_message_interrupted">,
): ChatSessionState {
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

export function applyAssistantResponseEventsToChatSessionState(
  chatSessionState: ChatSessionState,
  assistantResponseEvents: readonly AssistantResponseEvent[],
): ChatSessionState {
  return applyAssistantResponseEventsToChatSessionStateWithChangeSet(
    chatSessionState,
    assistantResponseEvents,
  ).nextChatSessionState;
}

export function applyAssistantResponseEventsToChatSessionStateWithChangeSet(
  chatSessionState: ChatSessionState,
  assistantResponseEvents: readonly AssistantResponseEvent[],
): AssistantResponseEventsChatSessionStateApplication {
  let nextChatSessionState = chatSessionState;
  let changeSet = createEmptyAssistantResponseEventsChatSessionStateChangeSet();
  for (const assistantResponseEvent of assistantResponseEvents) {
    const eventApplication = applyAssistantResponseEventToChatSessionStateWithChangeSet(
      nextChatSessionState,
      assistantResponseEvent,
    );
    nextChatSessionState = eventApplication.nextChatSessionState;
    changeSet = mergeAssistantResponseEventsChatSessionStateChangeSets(changeSet, eventApplication.changeSet);
  }
  return { nextChatSessionState, changeSet };
}

function createEmptyAssistantResponseEventsChatSessionStateChangeSet(): AssistantResponseEventsChatSessionStateChangeSet {
  return {
    changedConversationMessageIds: [],
    didConversationMessageOrderChange: false,
    didTranscriptGlobalStateChange: false,
    didPromptComposerStateChange: false,
    didInteractionStatusStateChange: false,
  };
}

function buildAssistantResponseEventChangeSet(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
  assistantResponseEvent: AssistantResponseEvent;
}): AssistantResponseEventsChatSessionStateChangeSet {
  if (input.previousChatSessionState === input.nextChatSessionState) {
    return createEmptyAssistantResponseEventsChatSessionStateChangeSet();
  }

  const changedConversationMessageId = resolveChangedConversationMessageId({
    previousChatSessionState: input.previousChatSessionState,
    nextChatSessionState: input.nextChatSessionState,
    assistantResponseEvent: input.assistantResponseEvent,
  });

  return {
    changedConversationMessageIds: changedConversationMessageId ? [changedConversationMessageId] : [],
    didConversationMessageOrderChange:
      input.previousChatSessionState.orderedConversationMessageIds !== input.nextChatSessionState.orderedConversationMessageIds,
    didTranscriptGlobalStateChange: didTranscriptRelevantStateChange(input),
    didPromptComposerStateChange: didPromptComposerRelevantStateChange(input),
    didInteractionStatusStateChange: didInteractionStatusRelevantStateChange(input),
  };
}

function resolveChangedConversationMessageId(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
  assistantResponseEvent: AssistantResponseEvent;
}): string | undefined {
  const conversationMessageId = readAssistantResponseEventConversationMessageId(input.assistantResponseEvent);
  if (!conversationMessageId) {
    return undefined;
  }

  if (
    input.previousChatSessionState.conversationMessagesById[conversationMessageId] !==
      input.nextChatSessionState.conversationMessagesById[conversationMessageId] ||
    hasConversationMessagePartChanged({
      previousChatSessionState: input.previousChatSessionState,
      nextChatSessionState: input.nextChatSessionState,
      conversationMessageId,
    })
  ) {
    return conversationMessageId;
  }

  return undefined;
}

function readAssistantResponseEventConversationMessageId(
  assistantResponseEvent: AssistantResponseEvent,
): string | undefined {
  if (assistantResponseEvent.type === "assistant_pending_tool_approval_requested") {
    return undefined;
  }
  if (assistantResponseEvent.type === "assistant_pending_tool_approval_cleared") {
    return undefined;
  }
  return assistantResponseEvent.messageId;
}

function hasConversationMessagePartChanged(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
  conversationMessageId: string;
}): boolean {
  const previousConversationMessage = input.previousChatSessionState.conversationMessagesById[input.conversationMessageId];
  const nextConversationMessage = input.nextChatSessionState.conversationMessagesById[input.conversationMessageId];
  const conversationMessagePartIds = nextConversationMessage?.partIds ?? previousConversationMessage?.partIds ?? [];
  return conversationMessagePartIds.some((conversationMessagePartId) =>
    input.previousChatSessionState.conversationMessagePartsById[conversationMessagePartId] !==
      input.nextChatSessionState.conversationMessagePartsById[conversationMessagePartId]
  );
}

function didTranscriptRelevantStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationMessagesById !== input.nextChatSessionState.conversationMessagesById ||
    input.previousChatSessionState.conversationMessagePartsById !== input.nextChatSessionState.conversationMessagePartsById ||
    input.previousChatSessionState.orderedConversationMessageIds !== input.nextChatSessionState.orderedConversationMessageIds ||
    input.previousChatSessionState.conversationMessagePartCount !== input.nextChatSessionState.conversationMessagePartCount ||
    input.previousChatSessionState.reasoningSummaryDisplayMode !== input.nextChatSessionState.reasoningSummaryDisplayMode ||
    input.previousChatSessionState.isCommandHelpModalVisible !== input.nextChatSessionState.isCommandHelpModalVisible;
}

function didPromptComposerRelevantStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationTurnStatus !== input.nextChatSessionState.conversationTurnStatus ||
    input.previousChatSessionState.promptDraft !== input.nextChatSessionState.promptDraft ||
    input.previousChatSessionState.promptDraftCursorOffset !== input.nextChatSessionState.promptDraftCursorOffset ||
    input.previousChatSessionState.pendingPromptImageAttachments !== input.nextChatSessionState.pendingPromptImageAttachments ||
    input.previousChatSessionState.pendingPromptTextPastes !== input.nextChatSessionState.pendingPromptTextPastes ||
    input.previousChatSessionState.selectedPromptContextReferenceTexts !== input.nextChatSessionState.selectedPromptContextReferenceTexts ||
    input.previousChatSessionState.selectedAssistantOperatingMode !== input.nextChatSessionState.selectedAssistantOperatingMode ||
    input.previousChatSessionState.selectedModelId !== input.nextChatSessionState.selectedModelId ||
    input.previousChatSessionState.selectedModelDefaultReasoningEffort !== input.nextChatSessionState.selectedModelDefaultReasoningEffort ||
    input.previousChatSessionState.selectedReasoningEffort !== input.nextChatSessionState.selectedReasoningEffort ||
    input.previousChatSessionState.latestContextWindowUsage !== input.nextChatSessionState.latestContextWindowUsage;
}

function didInteractionStatusRelevantStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationTurnStatus !== input.nextChatSessionState.conversationTurnStatus ||
    input.previousChatSessionState.pendingToolApprovalRequest !== input.nextChatSessionState.pendingToolApprovalRequest;
}

function mergeAssistantResponseEventsChatSessionStateChangeSets(
  previousChangeSet: AssistantResponseEventsChatSessionStateChangeSet,
  nextChangeSet: AssistantResponseEventsChatSessionStateChangeSet,
): AssistantResponseEventsChatSessionStateChangeSet {
  return {
    changedConversationMessageIds: mergeConversationMessageIds(
      previousChangeSet.changedConversationMessageIds,
      nextChangeSet.changedConversationMessageIds,
    ),
    didConversationMessageOrderChange:
      previousChangeSet.didConversationMessageOrderChange || nextChangeSet.didConversationMessageOrderChange,
    didTranscriptGlobalStateChange:
      previousChangeSet.didTranscriptGlobalStateChange || nextChangeSet.didTranscriptGlobalStateChange,
    didPromptComposerStateChange:
      previousChangeSet.didPromptComposerStateChange || nextChangeSet.didPromptComposerStateChange,
    didInteractionStatusStateChange:
      previousChangeSet.didInteractionStatusStateChange || nextChangeSet.didInteractionStatusStateChange,
  };
}

function mergeConversationMessageIds(
  previousConversationMessageIds: readonly string[],
  nextConversationMessageIds: readonly string[],
): string[] {
  const mergedConversationMessageIds = [...previousConversationMessageIds];
  const mergedConversationMessageIdSet = new Set(mergedConversationMessageIds);
  for (const conversationMessageId of nextConversationMessageIds) {
    if (!mergedConversationMessageIdSet.has(conversationMessageId)) {
      mergedConversationMessageIds.push(conversationMessageId);
      mergedConversationMessageIdSet.add(conversationMessageId);
    }
  }
  return mergedConversationMessageIds;
}
