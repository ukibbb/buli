import type { ChatSessionState } from "./chatSessionState.ts";

export function toggleReasoningSummaryDisplayMode(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    reasoningSummaryDisplayMode: chatSessionState.reasoningSummaryDisplayMode === "expanded" ? "collapsed" : "expanded",
  };
}
