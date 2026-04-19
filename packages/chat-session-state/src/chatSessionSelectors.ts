import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

export function listOrderedConversationMessages(chatSessionState: ChatSessionState): ConversationMessage[] {
  return chatSessionState.orderedConversationMessageIds.flatMap((messageId) => {
    const conversationMessage = chatSessionState.conversationMessagesById[messageId];
    return conversationMessage ? [conversationMessage] : [];
  });
}

export function listOrderedConversationMessageParts(
  chatSessionState: ChatSessionState,
  messageId: string,
): ConversationMessagePart[] {
  const conversationMessage = chatSessionState.conversationMessagesById[messageId];
  if (!conversationMessage) {
    return [];
  }

  return conversationMessage.partIds.flatMap((partId) => {
    const conversationMessagePart = chatSessionState.conversationMessagePartsById[partId];
    return conversationMessagePart ? [conversationMessagePart] : [];
  });
}
