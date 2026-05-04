import type { ChatSessionState } from "./chatSessionState.ts";

export function showCommandHelpModal(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    isCommandHelpModalVisible: true,
  };
}

export function hideCommandHelpModal(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    isCommandHelpModalVisible: false,
  };
}
