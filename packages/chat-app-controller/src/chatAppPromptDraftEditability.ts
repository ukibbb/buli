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
  isConversationSessionSwitchPending: boolean;
}): boolean {
  return !input.isConversationCompactionBlockingPromptInput &&
    !input.isConversationSessionSwitchPending &&
    canChatSessionPromptDraftBeEdited(input.chatSessionState);
}
