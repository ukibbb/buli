import type { ChatSessionState } from "./chatSessionState.ts";

export function showShortcutsHelpModal(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    isShortcutsHelpModalVisible: true,
  };
}

export function hideShortcutsHelpModal(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    isShortcutsHelpModalVisible: false,
  };
}
