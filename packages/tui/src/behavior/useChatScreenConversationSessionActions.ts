import {
  useChatAppConversationSessionActions,
  type UseChatAppConversationSessionActionsInput,
} from "@buli/chat-app-controller";

export type {
  ConversationSessionCompactionResult,
  ConversationSessionDeleteResult,
  ConversationSessionExportResult,
  ConversationSessionSwitchResult,
} from "@buli/chat-app-controller";

export type UseChatScreenConversationSessionActionsInput = UseChatAppConversationSessionActionsInput;

export type UseChatScreenConversationSessionActionsResult = ReturnType<typeof useChatScreenConversationSessionActions>;

export function useChatScreenConversationSessionActions(input: UseChatScreenConversationSessionActionsInput) {
  const chatAppConversationSessionActions = useChatAppConversationSessionActions(input);

  return {
    hydrateConversationSessionEntriesIntoChatScreen:
      chatAppConversationSessionActions.hydrateConversationSessionEntriesIntoChatApp,
    loadConversationSessionsForSelection: chatAppConversationSessionActions.loadConversationSessionsForSelection,
    switchToConversationSession: chatAppConversationSessionActions.switchToConversationSession,
    requestConversationSessionDeletion: chatAppConversationSessionActions.requestConversationSessionDeletion,
    exportCurrentConversationSession: chatAppConversationSessionActions.exportCurrentConversationSession,
    compactCurrentConversationSession: chatAppConversationSessionActions.compactCurrentConversationSession,
    autoCompactCurrentConversationSessionAfterAssistantTurn:
      chatAppConversationSessionActions.autoCompactCurrentConversationSessionAfterAssistantTurn,
    clearCurrentConversationSession: chatAppConversationSessionActions.clearCurrentConversationSession,
  };
}
