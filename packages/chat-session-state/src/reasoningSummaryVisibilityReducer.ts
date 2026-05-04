import type { ChatSessionState } from "./chatSessionState.ts";

export function toggleReasoningSummaryVisibility(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    isReasoningSummaryVisible: !chatSessionState.isReasoningSummaryVisible,
  };
}
