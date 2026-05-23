import { extractActivePromptContextQueryFromPromptDraft } from "@buli/prompt-context-core";
import type { UserPromptImageAttachment } from "@buli/contracts";
import type { ChatSessionState, SlashCommand } from "./chatSessionState.ts";
import { cycleAssistantOperatingMode } from "./assistantOperatingModeReducer.ts";
import { hideCommandHelpModal } from "./commandHelpModalReducer.ts";
import {
  hideConversationSessionSelection,
  moveHighlightedConversationSessionSelectionDown,
  moveHighlightedConversationSessionSelectionUp,
  selectHighlightedConversationSession,
  selectHighlightedConversationSessionForDeletion,
} from "./sessionSelectionReducer.ts";
import {
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  hideModelAndReasoningSelection,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
} from "./modelAndReasoningSelectionReducer.ts";
import {
  hideSlashCommandSelection,
  moveHighlightedSlashCommandSelectionDown,
  moveHighlightedSlashCommandSelectionUp,
  selectHighlightedSlashCommand,
} from "./slashCommandSelectionReducer.ts";
import {
  hidePromptContextSelection,
  moveHighlightedPromptContextCandidateDown,
  moveHighlightedPromptContextCandidateUp,
  selectHighlightedPromptContextCandidate,
} from "./promptContextSelectionReducer.ts";
import {
  insertTextIntoPromptDraftAtCursor,
  movePromptDraftCursorLeft,
  movePromptDraftCursorRight,
  movePromptDraftCursorToEnd,
  movePromptDraftCursorToStart,
  queuePromptDraftForLaterSubmission,
  removePromptImageAttachmentPlaceholderAtCursor,
  removePromptImageAttachmentPlaceholderBeforeCursor,
  removePromptDraftCharacterAtCursor,
  removePromptDraftCharacterBeforeCursor,
  submitPromptDraft,
} from "./promptDraftReducer.ts";
import { buildPromptContextQueryIdentity, type PromptContextQueryIdentity } from "./promptContextQueryIdentity.ts";

export type ChatSessionInteractionScope =
  | "command_help_modal"
  | "model_selection"
  | "reasoning_effort_selection"
  | "conversation_session_selection"
  | "slash_command_selection"
  | "prompt_context_selection"
  | "tool_approval"
  | "prompt_draft_editing";

export type ChatSessionKeyboardKeyName =
  | "backspace"
  | "delete"
  | "down"
  | "escape"
  | "end"
  | "home"
  | "left"
  | "pagedown"
  | "pageup"
  | "paste"
  | "return"
  | "right"
  | "tab"
  | "up";

export type ChatSessionKeyboardInput = {
  keyName: ChatSessionKeyboardKeyName | undefined;
  textInput: string | undefined;
  isCtrlPressed: boolean;
  isShiftPressed?: boolean;
  isMetaPressed: boolean;
};

export type ChatSessionKeyboardEffect =
  | {
      effectType: "active_conversation_turn_interrupt_key_pressed";
    }
  | {
      effectType: "dismiss_active_prompt_context_query";
      dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined;
    }
  | {
      effectType: "execute_selected_slash_command";
      selectedSlashCommand: SlashCommand;
    }
  | {
      effectType: "stream_assistant_response_for_submitted_prompt";
      submittedPromptText: string;
      submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
    }
  | {
      effectType: "enqueue_submitted_prompt";
      submittedPromptText: string;
      submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
    }
  | {
      effectType: "submit_pending_tool_approval_decision";
      decision: "approved" | "denied";
      source: "keyboard";
    }
  | {
      effectType: "scroll_conversation_messages_by_page";
      direction: "up" | "down";
    }
  | {
      effectType: "switch_to_selected_conversation_session";
      conversationSessionId: string;
    }
  | {
      effectType: "request_conversation_session_deletion";
      conversationSessionId: string;
    };

export type PromptSubmissionRejectionReason =
  | "not_submittable"
  | "prompt_submission_already_in_flight";

export type ChatSessionKeyboardInteraction = {
  nextChatSessionState: ChatSessionState;
  shouldConsumeKeyboardInput: boolean;
  chatSessionKeyboardEffect: ChatSessionKeyboardEffect | undefined;
  promptSubmissionRejectionReason: PromptSubmissionRejectionReason | undefined;
};

export function resolveChatSessionInteractionScope(chatSessionState: ChatSessionState): ChatSessionInteractionScope {
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

export function applyChatSessionKeyboardInputToChatSessionState(input: {
  chatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
  isPromptSubmissionInFlight: boolean;
}): ChatSessionKeyboardInteraction {
  const interactionScope = resolveChatSessionInteractionScope(input.chatSessionState);

  if (shouldRequestActiveConversationTurnInterrupt(input.chatSessionState, input.chatSessionKeyboardInput, interactionScope)) {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: input.chatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "active_conversation_turn_interrupt_key_pressed",
      },
    });
  }

  if (shouldIgnorePromptDraftEditingDuringToolApproval(input.chatSessionState, interactionScope)) {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: input.chatSessionState,
      shouldConsumeKeyboardInput: true,
    });
  }

  if (shouldConsumeModeCycleDuringActiveConversationTurn(input.chatSessionState, input.chatSessionKeyboardInput, interactionScope)) {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: input.chatSessionState,
      shouldConsumeKeyboardInput: true,
    });
  }

  if (interactionScope === "prompt_draft_editing" && shouldCycleAssistantOperatingMode(input)) {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: cycleAssistantOperatingMode(input.chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (interactionScope === "command_help_modal") {
    return applyKeyboardInputToCommandHelpModalState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  if (interactionScope === "conversation_session_selection") {
    return applyKeyboardInputToConversationSessionSelectionState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  if (interactionScope === "model_selection") {
    return applyKeyboardInputToModelSelectionState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  if (interactionScope === "reasoning_effort_selection") {
    return applyKeyboardInputToReasoningEffortSelectionState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  if (interactionScope === "slash_command_selection") {
    return applyKeyboardInputToSlashCommandSelectionState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  if (interactionScope === "prompt_context_selection") {
    return applyKeyboardInputToPromptContextSelectionState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  if (interactionScope === "tool_approval") {
    return applyKeyboardInputToToolApprovalState(input.chatSessionState, input.chatSessionKeyboardInput);
  }

  return applyKeyboardInputToPromptDraftEditingState({
    chatSessionState: input.chatSessionState,
    chatSessionKeyboardInput: input.chatSessionKeyboardInput,
    isPromptSubmissionInFlight: input.isPromptSubmissionInFlight,
  });
}

function shouldIgnorePromptDraftEditingDuringToolApproval(
  chatSessionState: ChatSessionState,
  interactionScope: ChatSessionInteractionScope,
): boolean {
  return interactionScope === "prompt_draft_editing" &&
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval";
}

function shouldConsumeModeCycleDuringActiveConversationTurn(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
  interactionScope: ChatSessionInteractionScope,
): boolean {
  return interactionScope === "prompt_draft_editing" &&
    chatSessionState.conversationTurnStatus === "streaming_assistant_response" &&
    chatSessionKeyboardInput.keyName === "tab" &&
    !chatSessionKeyboardInput.isCtrlPressed &&
    !chatSessionKeyboardInput.isMetaPressed;
}

function shouldRequestActiveConversationTurnInterrupt(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
  interactionScope: ChatSessionInteractionScope,
): boolean {
  return (
    (interactionScope === "prompt_draft_editing" || interactionScope === "tool_approval") &&
    (chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
      chatSessionState.conversationTurnStatus === "waiting_for_tool_approval") &&
    chatSessionKeyboardInput.keyName === "escape" &&
    !chatSessionKeyboardInput.isCtrlPressed &&
    !chatSessionKeyboardInput.isMetaPressed
  );
}

function applyKeyboardInputToCommandHelpModalState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionKeyboardInput.keyName === "escape") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: hideCommandHelpModal(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
}

function applyKeyboardInputToConversationSessionSelectionState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionKeyboardInput.keyName === "escape") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: hideConversationSessionSelection(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
    return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
  }

  if (chatSessionKeyboardInput.keyName === "up") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedConversationSessionSelectionUp(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "down") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedConversationSessionSelectionDown(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "return") {
    const conversationSessionSelection = selectHighlightedConversationSession(chatSessionState);
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: conversationSessionSelection.nextChatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: conversationSessionSelection.selectedConversationSession
        ? {
            effectType: "switch_to_selected_conversation_session",
            conversationSessionId: conversationSessionSelection.selectedConversationSession.sessionId,
          }
        : undefined,
    });
  }

  if (chatSessionKeyboardInput.keyName === "delete" || chatSessionKeyboardInput.keyName === "backspace") {
    const conversationSessionForDeletion = selectHighlightedConversationSessionForDeletion(chatSessionState);
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: chatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: conversationSessionForDeletion
        ? {
            effectType: "request_conversation_session_deletion",
            conversationSessionId: conversationSessionForDeletion.sessionId,
          }
        : undefined,
    });
  }

  return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
}

function applyKeyboardInputToModelSelectionState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionKeyboardInput.keyName === "escape") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: hideModelAndReasoningSelection(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
  }

  if (chatSessionKeyboardInput.keyName === "up") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedModelSelectionUp(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "down") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedModelSelectionDown(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "return") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: confirmHighlightedModelSelection(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
}

function applyKeyboardInputToReasoningEffortSelectionState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
  }

  if (chatSessionKeyboardInput.keyName === "escape") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: hideModelAndReasoningSelection(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "up") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedReasoningEffortChoiceUp(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "down") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedReasoningEffortChoiceDown(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "return") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: confirmHighlightedReasoningEffortChoice(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
}

function applyKeyboardInputToSlashCommandSelectionState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionState.slashCommandSelectionState.step !== "showing_slash_commands") {
    return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
  }

  if (chatSessionKeyboardInput.keyName === "escape") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: hideSlashCommandSelection(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "up") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedSlashCommandSelectionUp(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "down") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedSlashCommandSelectionDown(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "return") {
    const slashCommandSelection = selectHighlightedSlashCommand(chatSessionState);
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: slashCommandSelection.nextChatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: slashCommandSelection.selectedSlashCommand
        ? {
            effectType: "execute_selected_slash_command",
            selectedSlashCommand: slashCommandSelection.selectedSlashCommand,
          }
        : undefined,
    });
  }

  return applyKeyboardInputToPromptDraftEditingKeys(chatSessionState, chatSessionKeyboardInput);
}

function applyKeyboardInputToPromptContextSelectionState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
  }

  if (chatSessionKeyboardInput.keyName === "escape") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: hidePromptContextSelection(chatSessionState),
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "dismiss_active_prompt_context_query",
        dismissedPromptContextQueryIdentity: buildPromptContextQueryIdentity(
          extractActivePromptContextQueryFromPromptDraft(
            chatSessionState.promptDraft,
            chatSessionState.promptDraftCursorOffset,
          ),
        ),
      },
    });
  }

  if (chatSessionKeyboardInput.keyName === "up") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedPromptContextCandidateUp(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "down") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: moveHighlightedPromptContextCandidateDown(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "return") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: selectHighlightedPromptContextCandidate(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  return applyKeyboardInputToPromptDraftEditingKeys(chatSessionState, chatSessionKeyboardInput);
}

function applyKeyboardInputToToolApprovalState(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionKeyboardInput.isCtrlPressed || chatSessionKeyboardInput.isMetaPressed) {
    return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
  }

  if (chatSessionKeyboardInput.textInput?.toLowerCase() === "y") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: chatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "submit_pending_tool_approval_decision",
        decision: "approved",
        source: "keyboard",
      },
    });
  }

  if (chatSessionKeyboardInput.textInput?.toLowerCase() === "n") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: chatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "submit_pending_tool_approval_decision",
        decision: "denied",
        source: "keyboard",
      },
    });
  }

  return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
}

function applyKeyboardInputToPromptDraftEditingState(input: {
  chatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
  isPromptSubmissionInFlight: boolean;
}): ChatSessionKeyboardInteraction {
  if (input.chatSessionKeyboardInput.keyName === "return") {
    if (input.chatSessionState.conversationTurnStatus === "streaming_assistant_response") {
      const queuedPromptDraftSubmission = queuePromptDraftForLaterSubmission(input.chatSessionState);
      if (queuedPromptDraftSubmission.submittedPromptText === undefined) {
        return createChatSessionKeyboardInteraction({
          nextChatSessionState: queuedPromptDraftSubmission.nextChatSessionState,
          shouldConsumeKeyboardInput: true,
          promptSubmissionRejectionReason: "not_submittable",
        });
      }

      return createChatSessionKeyboardInteraction({
        nextChatSessionState: queuedPromptDraftSubmission.nextChatSessionState,
        shouldConsumeKeyboardInput: true,
        chatSessionKeyboardEffect: {
          effectType: "enqueue_submitted_prompt",
          submittedPromptText: queuedPromptDraftSubmission.submittedPromptText,
          submittedPromptImageAttachments: queuedPromptDraftSubmission.submittedPromptImageAttachments,
        },
      });
    }

    if (input.isPromptSubmissionInFlight) {
      return createChatSessionKeyboardInteraction({
        nextChatSessionState: input.chatSessionState,
        shouldConsumeKeyboardInput: true,
        promptSubmissionRejectionReason: "prompt_submission_already_in_flight",
      });
    }

    const promptDraftSubmission = submitPromptDraft(input.chatSessionState);
    if (promptDraftSubmission.submittedPromptText === undefined) {
      return createChatSessionKeyboardInteraction({
        nextChatSessionState: promptDraftSubmission.nextChatSessionState,
        shouldConsumeKeyboardInput: true,
        promptSubmissionRejectionReason: "not_submittable",
      });
    }

    return createChatSessionKeyboardInteraction({
      nextChatSessionState: promptDraftSubmission.nextChatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "stream_assistant_response_for_submitted_prompt",
        submittedPromptText: promptDraftSubmission.submittedPromptText,
        submittedPromptImageAttachments: promptDraftSubmission.submittedPromptImageAttachments,
      },
    });
  }

  return applyKeyboardInputToPromptDraftEditingKeys(input.chatSessionState, input.chatSessionKeyboardInput);
}

function applyKeyboardInputToPromptDraftEditingKeys(
  chatSessionState: ChatSessionState,
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): ChatSessionKeyboardInteraction {
  if (chatSessionKeyboardInput.keyName === "left") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: movePromptDraftCursorLeft(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "right") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: movePromptDraftCursorRight(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "home") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: movePromptDraftCursorToStart(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "end") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: movePromptDraftCursorToEnd(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "pageup") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: chatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "scroll_conversation_messages_by_page",
        direction: "up",
      },
    });
  }

  if (chatSessionKeyboardInput.keyName === "pagedown") {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: chatSessionState,
      shouldConsumeKeyboardInput: true,
      chatSessionKeyboardEffect: {
        effectType: "scroll_conversation_messages_by_page",
        direction: "down",
      },
    });
  }

  if (chatSessionKeyboardInput.keyName === "backspace") {
    const nextChatSessionState = removePromptImageAttachmentPlaceholderBeforeCursor(chatSessionState);
    if (nextChatSessionState !== chatSessionState) {
      return createChatSessionKeyboardInteraction({
        nextChatSessionState,
        shouldConsumeKeyboardInput: true,
      });
    }

    return createChatSessionKeyboardInteraction({
      nextChatSessionState: removePromptDraftCharacterBeforeCursor(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (chatSessionKeyboardInput.keyName === "delete") {
    const nextChatSessionState = removePromptImageAttachmentPlaceholderAtCursor(chatSessionState);
    if (nextChatSessionState !== chatSessionState) {
      return createChatSessionKeyboardInteraction({
        nextChatSessionState,
        shouldConsumeKeyboardInput: true,
      });
    }

    return createChatSessionKeyboardInteraction({
      nextChatSessionState: removePromptDraftCharacterAtCursor(chatSessionState),
      shouldConsumeKeyboardInput: true,
    });
  }

  if (isPlainTextInsertion(chatSessionKeyboardInput)) {
    return createChatSessionKeyboardInteraction({
      nextChatSessionState: insertTextIntoPromptDraftAtCursor(chatSessionState, chatSessionKeyboardInput.textInput),
      shouldConsumeKeyboardInput: true,
    });
  }

  return createUnchangedChatSessionKeyboardInteraction(chatSessionState);
}

function shouldCycleAssistantOperatingMode(input: {
  chatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
}): boolean {
  return input.chatSessionState.conversationTurnStatus === "waiting_for_user_input" &&
    input.chatSessionKeyboardInput.keyName === "tab" &&
    !input.chatSessionKeyboardInput.isCtrlPressed &&
    !input.chatSessionKeyboardInput.isMetaPressed;
}

function isPlainTextInsertion(
  chatSessionKeyboardInput: ChatSessionKeyboardInput,
): chatSessionKeyboardInput is ChatSessionKeyboardInput & { textInput: string } {
  return chatSessionKeyboardInput.textInput !== undefined &&
    chatSessionKeyboardInput.textInput.length > 0 &&
    chatSessionKeyboardInput.textInput !== "\t" &&
    !chatSessionKeyboardInput.isCtrlPressed &&
    !chatSessionKeyboardInput.isMetaPressed;
}

function createUnchangedChatSessionKeyboardInteraction(chatSessionState: ChatSessionState): ChatSessionKeyboardInteraction {
  return createChatSessionKeyboardInteraction({
    nextChatSessionState: chatSessionState,
    shouldConsumeKeyboardInput: false,
  });
}

function createChatSessionKeyboardInteraction(input: {
  nextChatSessionState: ChatSessionState;
  shouldConsumeKeyboardInput: boolean;
  chatSessionKeyboardEffect?: ChatSessionKeyboardEffect | undefined;
  promptSubmissionRejectionReason?: PromptSubmissionRejectionReason | undefined;
}): ChatSessionKeyboardInteraction {
  return {
    nextChatSessionState: input.nextChatSessionState,
    shouldConsumeKeyboardInput: input.shouldConsumeKeyboardInput,
    chatSessionKeyboardEffect: input.chatSessionKeyboardEffect,
    promptSubmissionRejectionReason: input.promptSubmissionRejectionReason,
  };
}
