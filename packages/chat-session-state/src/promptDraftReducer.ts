import { randomUUID } from "node:crypto";
import type {
  ConversationMessage,
  ConversationMessagePart,
  UserPromptImageAttachment,
} from "@buli/contracts";
import {
  extractActivePromptContextQueryFromPromptDraft,
  reconcileSelectedPromptContextReferenceTextsWithPromptDraft,
} from "@buli/engine";
import type { ChatSessionState } from "./chatSessionState.ts";

function createPromptDraftEditedState(input: {
  chatSessionState: ChatSessionState;
  promptDraft: string;
  promptDraftCursorOffset: number;
}): ChatSessionState {
  return {
    ...input.chatSessionState,
    promptDraft: input.promptDraft,
    promptDraftCursorOffset: input.promptDraftCursorOffset,
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft: input.promptDraft,
      selectedPromptContextReferenceTexts: input.chatSessionState.selectedPromptContextReferenceTexts,
    }),
  };
}

function appendConversationMessage(input: {
  chatSessionState: ChatSessionState;
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
}): ChatSessionState {
  const appendedConversationMessagePartsById = input.conversationMessageParts.reduce<Record<string, ConversationMessagePart>>(
    (conversationMessagePartsById, conversationMessagePart) => ({
      ...conversationMessagePartsById,
      [conversationMessagePart.id]: conversationMessagePart,
    }),
    {},
  );

  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [input.conversationMessage.id]: input.conversationMessage,
    },
    conversationMessagePartsById: {
      ...input.chatSessionState.conversationMessagePartsById,
      ...appendedConversationMessagePartsById,
    },
    orderedConversationMessageIds: [...input.chatSessionState.orderedConversationMessageIds, input.conversationMessage.id],
  };
}

export function appendPromptImageAttachmentToDraft(
  chatSessionState: ChatSessionState,
  pendingPromptImageAttachment: UserPromptImageAttachment,
): ChatSessionState {
  return {
    ...chatSessionState,
    pendingPromptImageAttachments: [
      ...chatSessionState.pendingPromptImageAttachments,
      pendingPromptImageAttachment,
    ],
  };
}

export function removeLastPromptImageAttachmentFromDraft(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.pendingPromptImageAttachments.length === 0) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    pendingPromptImageAttachments: chatSessionState.pendingPromptImageAttachments.slice(0, -1),
  };
}

export function insertTextIntoPromptDraftAtCursor(chatSessionState: ChatSessionState, insertedText: string): ChatSessionState {
  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset);
  const promptDraft = `${promptDraftPrefix}${insertedText}${promptDraftSuffix}`;
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset + insertedText.length,
  });
}

export function replacePromptDraftFromEditor(input: {
  chatSessionState: ChatSessionState;
  promptDraft: string;
  promptDraftCursorOffset: number;
}): ChatSessionState {
  const promptDraftCursorOffset = Math.max(0, Math.min(input.promptDraftCursorOffset, input.promptDraft.length));
  if (
    input.chatSessionState.promptDraft === input.promptDraft &&
    input.chatSessionState.promptDraftCursorOffset === promptDraftCursorOffset
  ) {
    return input.chatSessionState;
  }

  return createPromptDraftEditedState({
    chatSessionState: input.chatSessionState,
    promptDraft: input.promptDraft,
    promptDraftCursorOffset,
  });
}

export function movePromptDraftCursorLeft(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: Math.max(0, chatSessionState.promptDraftCursorOffset - 1),
  };
}

export function movePromptDraftCursorRight(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: Math.min(chatSessionState.promptDraft.length, chatSessionState.promptDraftCursorOffset + 1),
  };
}

export function movePromptDraftCursorToStart(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: 0,
  };
}

export function movePromptDraftCursorToEnd(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: chatSessionState.promptDraft.length,
  };
}

export function removePromptDraftCharacterBeforeCursor(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptDraftCursorOffset === 0) {
    return chatSessionState;
  }

  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset - 1);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset);
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft: `${promptDraftPrefix}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset - 1,
  });
}

export function removePromptDraftCharacterAtCursor(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptDraftCursorOffset >= chatSessionState.promptDraft.length) {
    return chatSessionState;
  }

  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset + 1);
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft: `${promptDraftPrefix}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset,
  });
}

export function submitPromptDraft(chatSessionState: ChatSessionState): {
  nextChatSessionState: ChatSessionState;
  submittedPromptText: string | undefined;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
} {
  const submittedPromptText = chatSessionState.promptDraft.trim();
  const submittedPromptImageAttachments = [...chatSessionState.pendingPromptImageAttachments];
  if (
    (submittedPromptText.length === 0 && submittedPromptImageAttachments.length === 0) ||
    chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
    chatSessionState.promptContextSelectionState.step !== "hidden" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden"
  ) {
    return { nextChatSessionState: chatSessionState, submittedPromptText: undefined, submittedPromptImageAttachments: [] };
  }

  const userMessageId = `user-${randomUUID()}`;
  const userTextConversationMessagePart = submittedPromptText.length > 0
    ? {
        id: `user-text-${randomUUID()}`,
        partKind: "user_text" as const,
        text: submittedPromptText,
      }
    : undefined;
  const userImageAttachmentConversationMessageParts = submittedPromptImageAttachments.map((attachment) => ({
    id: `user-image-${randomUUID()}`,
    partKind: "user_image_attachment" as const,
    attachment,
  }));
  const userConversationMessageParts = [
    ...(userTextConversationMessagePart ? [userTextConversationMessagePart] : []),
    ...userImageAttachmentConversationMessageParts,
  ];
  const submittedAtMs = Date.now();
  const userConversationMessage: ConversationMessage = {
    id: userMessageId,
    role: "user",
    messageStatus: "completed",
    createdAtMs: submittedAtMs,
    partIds: userConversationMessageParts.map((conversationMessagePart) => conversationMessagePart.id),
  };

  return {
    submittedPromptText,
    submittedPromptImageAttachments,
    nextChatSessionState: appendConversationMessage({
      chatSessionState: {
        ...chatSessionState,
        promptDraft: "",
        promptDraftCursorOffset: 0,
        pendingPromptImageAttachments: [],
        conversationTurnStatus: "streaming_assistant_response",
        latestTokenUsage: undefined,
        pendingToolApprovalRequest: undefined,
        promptContextSelectionState: { step: "hidden" },
        selectedPromptContextReferenceTexts: [],
      },
      conversationMessage: userConversationMessage,
      conversationMessageParts: userConversationMessageParts,
    }),
  };
}

export function getActivePromptContextQueryText(chatSessionState: ChatSessionState): string | undefined {
  return extractActivePromptContextQueryFromPromptDraft(
    chatSessionState.promptDraft,
    chatSessionState.promptDraftCursorOffset,
  )?.decodedQueryText;
}
