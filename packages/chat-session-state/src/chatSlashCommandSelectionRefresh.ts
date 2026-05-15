import type { ChatSessionState } from "./chatSessionState.ts";
import { buildChatSlashCommands } from "./chatSlashCommands.ts";
import { hideSlashCommandSelection, refreshSlashCommandSelectionForPromptDraft } from "./slashCommandSelectionReducer.ts";

export function refreshChatSlashCommandSelectionForCurrentState(chatSessionState: ChatSessionState): ChatSessionState {
  const shouldHideSlashCommandSelection =
    chatSessionState.isCommandHelpModalVisible ||
    chatSessionState.conversationTurnStatus !== "waiting_for_user_input" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
    chatSessionState.conversationSessionSelectionState.step !== "hidden" ||
    chatSessionState.promptContextSelectionState.step !== "hidden";

  if (shouldHideSlashCommandSelection) {
    return hideSlashCommandSelection(chatSessionState);
  }

  return refreshSlashCommandSelectionForPromptDraft(
    chatSessionState,
    buildChatSlashCommands({
      isReasoningSummaryVisible: chatSessionState.isReasoningSummaryVisible,
    }),
  );
}
