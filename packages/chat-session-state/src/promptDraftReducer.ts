import { randomUUID } from "node:crypto";
import type { ConversationMessage, UserTextConversationMessagePart } from "@buli/contracts";
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
  conversationMessagePart: UserTextConversationMessagePart;
}): ChatSessionState {
  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [input.conversationMessage.id]: input.conversationMessage,
    },
    conversationMessagePartsById: {
      ...input.chatSessionState.conversationMessagePartsById,
      [input.conversationMessagePart.id]: input.conversationMessagePart,
    },
    orderedConversationMessageIds: [...input.chatSessionState.orderedConversationMessageIds, input.conversationMessage.id],
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
} {
  const submittedPromptText = chatSessionState.promptDraft.trim();
  if (
    !submittedPromptText ||
    chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
    chatSessionState.promptContextSelectionState.step !== "hidden" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden"
  ) {
    return { nextChatSessionState: chatSessionState, submittedPromptText: undefined };
  }

  const userMessageId = `user-${randomUUID()}`;
  const userTextPartId = `user-text-${randomUUID()}`;
  const submittedAtMs = Date.now();
  const userTextConversationMessagePart: UserTextConversationMessagePart = {
    id: userTextPartId,
    partKind: "user_text",
    text: submittedPromptText,
  };
  const userConversationMessage: ConversationMessage = {
    id: userMessageId,
    role: "user",
    messageStatus: "completed",
    createdAtMs: submittedAtMs,
    partIds: [userTextPartId],
  };

  return {
    submittedPromptText,
    nextChatSessionState: appendConversationMessage({
      chatSessionState: {
        ...chatSessionState,
        promptDraft: "",
        promptDraftCursorOffset: 0,
        conversationTurnStatus: "streaming_assistant_response",
        latestTokenUsage: undefined,
        pendingToolApprovalRequest: undefined,
        promptContextSelectionState: { step: "hidden" },
        selectedPromptContextReferenceTexts: [],
      },
      conversationMessage: userConversationMessage,
      conversationMessagePart: userTextConversationMessagePart,
    }),
  };
}

export function getActivePromptContextQueryText(chatSessionState: ChatSessionState): string | undefined {
  return extractActivePromptContextQueryFromPromptDraft(
    chatSessionState.promptDraft,
    chatSessionState.promptDraftCursorOffset,
  )?.decodedQueryText;
}
