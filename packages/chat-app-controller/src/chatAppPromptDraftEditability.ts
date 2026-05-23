import type { ChatSessionState } from "@buli/chat-session-state";

export function canChatSessionPromptDraftBeEdited(chatSessionState: ChatSessionState): boolean {
  return (chatSessionState.conversationTurnStatus === "waiting_for_user_input" ||
    chatSessionState.conversationTurnStatus === "streaming_assistant_response") &&
    !chatSessionState.isCommandHelpModalVisible &&
    chatSessionState.modelAndReasoningSelectionState.step === "hidden" &&
    chatSessionState.conversationSessionSelectionState.step === "hidden";
}

export function canChatAppPromptDraftBeEdited(input: {
  chatSessionState: ChatSessionState;
  isConversationCompactionInFlight: boolean;
}): boolean {
  return !input.isConversationCompactionInFlight && canChatSessionPromptDraftBeEdited(input.chatSessionState);
}
