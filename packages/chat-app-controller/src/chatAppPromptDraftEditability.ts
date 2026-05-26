import {
  canChatSessionPromptDraftBeEdited as canChatSessionPromptDraftBeEditedForCurrentInteraction,
  type ChatSessionState,
} from "@buli/chat-session-state";

export function canChatSessionPromptDraftBeEdited(chatSessionState: ChatSessionState): boolean {
  return canChatSessionPromptDraftBeEditedForCurrentInteraction(chatSessionState);
}

export function canChatAppPromptDraftBeEdited(input: {
  chatSessionState: ChatSessionState;
  isConversationCompactionBlockingPromptInput: boolean;
}): boolean {
  return !input.isConversationCompactionBlockingPromptInput && canChatSessionPromptDraftBeEdited(input.chatSessionState);
}
