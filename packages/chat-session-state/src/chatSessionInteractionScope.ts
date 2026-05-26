import type { ChatSessionState } from "./chatSessionState.ts";

export type ChatSessionInteractionScope =
  | "command_help_modal"
  | "model_selection"
  | "reasoning_effort_selection"
  | "conversation_session_selection"
  | "slash_command_selection"
  | "prompt_context_selection"
  | "tool_approval"
  | "prompt_draft_editing";

export type ChatSessionInteractionState = Pick<
  ChatSessionState,
  | "conversationTurnStatus"
  | "isCommandHelpModalVisible"
  | "modelAndReasoningSelectionState"
  | "conversationSessionSelectionState"
  | "slashCommandSelectionState"
  | "promptContextSelectionState"
> & {
  pendingToolApprovalRequest?: ChatSessionState["pendingToolApprovalRequest"] | undefined;
};

export function resolveChatSessionInteractionScope(
  chatSessionState: ChatSessionInteractionState,
): ChatSessionInteractionScope {
  if (chatSessionState.isCommandHelpModalVisible) {
    return "command_help_modal";
  }

  if (chatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices") {
    return "reasoning_effort_selection";
  }

  if (chatSessionState.modelAndReasoningSelectionState.step !== "hidden") {
    return "model_selection";
  }

  if (chatSessionState.conversationSessionSelectionState.step !== "hidden") {
    return "conversation_session_selection";
  }

  if (chatSessionState.slashCommandSelectionState.step !== "hidden") {
    return "slash_command_selection";
  }

  if (chatSessionState.promptContextSelectionState.step !== "hidden") {
    return "prompt_context_selection";
  }

  if (
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" &&
    chatSessionState.pendingToolApprovalRequest
  ) {
    return "tool_approval";
  }

  return "prompt_draft_editing";
}

export function canChatSessionPromptDraftBeEdited(chatSessionState: ChatSessionInteractionState): boolean {
  return isPromptDraftEditableConversationTurnStatus(chatSessionState.conversationTurnStatus) &&
    canChatSessionInteractionScopeEditPromptDraft(resolveChatSessionInteractionScope(chatSessionState));
}

export function canChatSessionShowSlashCommandSelectionForPromptDraft(
  chatSessionState: ChatSessionInteractionState,
): boolean {
  if (chatSessionState.conversationTurnStatus !== "waiting_for_user_input") {
    return false;
  }

  const interactionScope = resolveChatSessionInteractionScope(chatSessionState);
  return interactionScope === "prompt_draft_editing" || interactionScope === "slash_command_selection";
}

export function canChatSessionInteractionScopeEditPromptDraft(
  interactionScope: ChatSessionInteractionScope,
): boolean {
  return interactionScope === "prompt_draft_editing" ||
    interactionScope === "slash_command_selection" ||
    interactionScope === "prompt_context_selection";
}

function isPromptDraftEditableConversationTurnStatus(
  conversationTurnStatus: ChatSessionState["conversationTurnStatus"],
): boolean {
  return conversationTurnStatus === "waiting_for_user_input" ||
    conversationTurnStatus === "streaming_assistant_response";
}
