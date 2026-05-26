import type { ChatSessionState } from "./chatSessionState.ts";
import { buildChatSlashCommands, type ChatSlashCommandSkill } from "./chatSlashCommands.ts";
import { canChatSessionShowSlashCommandSelectionForPromptDraft } from "./chatSessionInteractionScope.ts";
import { hideSlashCommandSelection, refreshSlashCommandSelectionForPromptDraft } from "./slashCommandSelectionReducer.ts";

export function refreshChatSlashCommandSelectionForCurrentState(
  chatSessionState: ChatSessionState,
  availableSkills?: readonly ChatSlashCommandSkill[],
): ChatSessionState {
  if (!canChatSessionShowSlashCommandSelectionForPromptDraft(chatSessionState)) {
    return hideSlashCommandSelection(chatSessionState);
  }

  return refreshSlashCommandSelectionForPromptDraft(
    chatSessionState,
    buildChatSlashCommands({
      reasoningSummaryDisplayMode: chatSessionState.reasoningSummaryDisplayMode,
      ...(availableSkills !== undefined ? { availableSkills } : {}),
    }),
  );
}
