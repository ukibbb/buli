import type {
  AvailableAssistantModel,
  BuliDiagnosticLogger,
  ConversationSessionModelSelection,
} from "@buli/contracts";
import {
  applyChatSessionKeyboardInputToChatSessionState,
  applyChatSlashCommandToChatSessionState,
  refreshChatSlashCommandSelectionForCurrentState,
  replacePromptDraftFromEditor,
  readConversationSessionModelSelectionFromChatSessionState,
  type ChatSessionKeyboardEffect,
  type ChatSessionKeyboardInput,
  type ChatSessionState,
  type ChatSlashCommandApplicationEffect,
  type PromptContextQueryIdentity,
} from "@buli/chat-session-state";
import { useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { logChatAppControllerDiagnosticEvent } from "./diagnostics.ts";
import type {
  PendingToolApprovalDecisionSubmission,
  QueuedChatAppPrompt,
  SubmittedChatAppPrompt,
} from "./useChatAppAssistantTurnActions.ts";
import { useChatAppModelSelectionActions } from "./useChatAppModelSelectionActions.ts";

type MutableValueRef<T> = { current: T };

export type ChatAppPromptDraftEdit = {
  promptDraft: string;
  promptDraftCursorOffset: number;
};

export type ChatAppKeyboardInputApplication = {
  shouldConsumeKeyboardInput: boolean;
};

export type UseChatAppKeyboardActionsInput = {
  chatSessionState: ChatSessionState;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  isConversationCompactionInFlightRef: MutableValueRef<boolean>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  requestActiveConversationTurnInterrupt: () => void;
  dismissActivePromptContextQuery: (dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined) => void;
  refreshPromptContextSelectionForChatSessionState: (chatSessionState: ChatSessionState) => void;
  loadConversationSessionsForSelection: () => Promise<void>;
  switchToConversationSession: (conversationSessionId: string) => Promise<void>;
  requestConversationSessionDeletion: (conversationSessionId: string) => Promise<void>;
  exportCurrentConversationSession: () => Promise<void>;
  compactCurrentConversationSession: () => Promise<void>;
  clearCurrentConversationSession: () => void;
  onConversationSessionModelSelectionChanged?:
    | ((modelSelection: ConversationSessionModelSelection) => void | Promise<void>)
    | undefined;
  streamAssistantResponseForSubmittedPrompt: (submittedPrompt: SubmittedChatAppPrompt) => Promise<void>;
  enqueueQueuedSubmittedPrompt: (queuedChatAppPrompt: QueuedChatAppPrompt) => number;
  submitPendingToolApprovalDecision: (submission: PendingToolApprovalDecisionSubmission) => void;
  scrollConversationMessagesToBottom: () => void;
  scrollConversationMessagesByPage: (direction: "up" | "down") => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type UseChatAppKeyboardActionsResult = {
  applyChatAppKeyboardInput: (input: { chatSessionKeyboardInput: ChatSessionKeyboardInput }) => ChatAppKeyboardInputApplication;
  applyPromptDraftEditToChatApp: (promptDraftEdit: ChatAppPromptDraftEdit) => void;
};

export function useChatAppKeyboardActions(input: UseChatAppKeyboardActionsInput): UseChatAppKeyboardActionsResult {
  const { loadAvailableModelsForSelection } = useChatAppModelSelectionActions({
    loadAvailableAssistantModels: input.loadAvailableAssistantModels,
    latestChatSessionStateRef: input.latestChatSessionStateRef,
    setChatSessionState: input.setChatSessionState,
    diagnosticLogger: input.diagnosticLogger,
  });

  const applyChatSlashCommandApplicationEffectToChatApp = useEffectEvent(
    (chatSlashCommandApplicationEffect: ChatSlashCommandApplicationEffect | undefined) => {
      if (!chatSlashCommandApplicationEffect) {
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "clear_current_conversation_session") {
        input.clearCurrentConversationSession();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "load_conversation_sessions") {
        void input.loadConversationSessionsForSelection();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "compact_current_conversation_session") {
        void input.compactCurrentConversationSession();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "export_current_conversation_session") {
        void input.exportCurrentConversationSession();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "load_available_assistant_models") {
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_open_requested", {
          source: "slash_command",
        });
        void loadAvailableModelsForSelection();
        return;
      }

      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.reasoning_summary_visibility_toggled", {
        isReasoningSummaryVisible: chatSlashCommandApplicationEffect.isReasoningSummaryVisible,
      });
    },
  );

  const executeSlashCommand = useEffectEvent((slashCommandValue: string) => {
    const chatSlashCommandApplication = applyChatSlashCommandToChatSessionState(
      input.latestChatSessionStateRef.current,
      slashCommandValue,
    );
    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(
      chatSlashCommandApplication.nextChatSessionState,
    );
    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
    input.refreshPromptContextSelectionForChatSessionState(nextChatSessionState);
    applyChatSlashCommandApplicationEffectToChatApp(chatSlashCommandApplication.chatSlashCommandApplicationEffect);
  });

  const applyChatSessionKeyboardEffectToChatApp = useEffectEvent((keyboardEffectInput: {
    chatSessionKeyboardEffect: ChatSessionKeyboardEffect;
    previousChatSessionState: ChatSessionState;
  }) => {
    switch (keyboardEffectInput.chatSessionKeyboardEffect.effectType) {
      case "active_conversation_turn_interrupt_key_pressed":
        input.requestActiveConversationTurnInterrupt();
        return;
      case "dismiss_active_prompt_context_query":
        if (keyboardEffectInput.previousChatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates") {
          logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_selection_closed", {
            reason: "keyboard_escape",
            promptContextCandidateCount:
              keyboardEffectInput.previousChatSessionState.promptContextSelectionState.promptContextCandidates.length,
          });
        }
        input.dismissActivePromptContextQuery(keyboardEffectInput.chatSessionKeyboardEffect.dismissedPromptContextQueryIdentity);
        return;
      case "execute_selected_slash_command":
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.slash_command_selected", {
          slashCommand: keyboardEffectInput.chatSessionKeyboardEffect.selectedSlashCommand.value,
        });
        executeSlashCommand(keyboardEffectInput.chatSessionKeyboardEffect.selectedSlashCommand.value);
        return;
      case "stream_assistant_response_for_submitted_prompt":
        input.isPromptSubmissionInFlightRef.current = true;
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_submitted", {
          submittedPromptLength: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptText.length,
          submittedPromptImageAttachmentCount: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptImageAttachments.length,
          selectedModelId: keyboardEffectInput.previousChatSessionState.selectedModelId,
          selectedReasoningEffort: keyboardEffectInput.previousChatSessionState.selectedReasoningEffort ?? null,
        });
        input.scrollConversationMessagesToBottom();
        void input.streamAssistantResponseForSubmittedPrompt({
          submittedPromptText: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptText,
          submittedPromptImageAttachments: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptImageAttachments,
        });
        return;
      case "enqueue_submitted_prompt": {
        const queuedPromptCount = input.enqueueQueuedSubmittedPrompt({
          submittedPromptText: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptText,
          submittedPromptImageAttachments: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptImageAttachments,
        });
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_queued", {
          submittedPromptLength: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptText.length,
          submittedPromptImageAttachmentCount: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptImageAttachments.length,
          queuedPromptCount,
        });
        return;
      }
      case "submit_pending_tool_approval_decision":
        input.submitPendingToolApprovalDecision({
          decision: keyboardEffectInput.chatSessionKeyboardEffect.decision,
          source: keyboardEffectInput.chatSessionKeyboardEffect.source,
        });
        return;
      case "scroll_conversation_messages_by_page":
        input.scrollConversationMessagesByPage(keyboardEffectInput.chatSessionKeyboardEffect.direction);
        return;
      case "switch_to_selected_conversation_session":
        void input.switchToConversationSession(keyboardEffectInput.chatSessionKeyboardEffect.conversationSessionId);
        return;
      case "request_conversation_session_deletion":
        void input.requestConversationSessionDeletion(keyboardEffectInput.chatSessionKeyboardEffect.conversationSessionId);
        return;
    }
  });

  const applyChatAppKeyboardInput = useEffectEvent((keyboardInput: {
    chatSessionKeyboardInput: ChatSessionKeyboardInput;
  }): ChatAppKeyboardInputApplication => {
    const previousChatSessionState = input.latestChatSessionStateRef.current;
    const keyboardInteraction = applyChatSessionKeyboardInputToChatSessionState({
      chatSessionState: previousChatSessionState,
      chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      isPromptSubmissionInFlight: input.isPromptSubmissionInFlightRef.current || input.isConversationCompactionInFlightRef.current,
    });

    if (keyboardInteraction.promptSubmissionRejectionReason) {
      logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_submission_ignored", {
        promptDraftLength: previousChatSessionState.promptDraft.length,
        conversationTurnStatus: previousChatSessionState.conversationTurnStatus,
        promptContextSelectionStep: previousChatSessionState.promptContextSelectionState.step,
        modelSelectionStep: previousChatSessionState.modelAndReasoningSelectionState.step,
        reason: keyboardInteraction.promptSubmissionRejectionReason,
      });
    }

    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(keyboardInteraction.nextChatSessionState);

    if (nextChatSessionState !== previousChatSessionState) {
      const shouldReportModelSelection = shouldReportConversationSessionModelSelection({
        previousChatSessionState,
        nextChatSessionState,
        chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      });
      if (
        previousChatSessionState.selectedAssistantOperatingMode !==
          nextChatSessionState.selectedAssistantOperatingMode
      ) {
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.assistant_operating_mode_cycled", {
          selectedAssistantOperatingMode: nextChatSessionState.selectedAssistantOperatingMode,
        });
      }

      input.latestChatSessionStateRef.current = nextChatSessionState;
      input.setChatSessionState(nextChatSessionState);
      input.refreshPromptContextSelectionForChatSessionState(nextChatSessionState);
      if (shouldReportModelSelection) {
        const modelSelection = readConversationSessionModelSelectionFromChatSessionState(
          nextChatSessionState,
        );
        logChatAppControllerDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_changed", {
          selectedModelId: modelSelection.selectedModelId,
          selectedModelDefaultReasoningEffort: modelSelection.selectedModelDefaultReasoningEffort ?? null,
          selectedReasoningEffort: modelSelection.selectedReasoningEffort ?? null,
        });
        void input.onConversationSessionModelSelectionChanged?.(modelSelection);
      }
    }

    if (keyboardInteraction.chatSessionKeyboardEffect) {
      applyChatSessionKeyboardEffectToChatApp({
        chatSessionKeyboardEffect: keyboardInteraction.chatSessionKeyboardEffect,
        previousChatSessionState,
      });
    }

    return { shouldConsumeKeyboardInput: keyboardInteraction.shouldConsumeKeyboardInput };
  });

  const applyPromptDraftEditToChatApp = useEffectEvent((promptDraftEdit: ChatAppPromptDraftEdit) => {
    if (input.isConversationCompactionInFlightRef.current) {
      return;
    }

    const previousChatSessionState = input.latestChatSessionStateRef.current;
    const editedChatSessionState = replacePromptDraftFromEditor({
      chatSessionState: previousChatSessionState,
      promptDraft: promptDraftEdit.promptDraft,
      promptDraftCursorOffset: promptDraftEdit.promptDraftCursorOffset,
    });
    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(editedChatSessionState);

    if (nextChatSessionState === previousChatSessionState) {
      return;
    }

    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
    input.refreshPromptContextSelectionForChatSessionState(nextChatSessionState);
  });

  return {
    applyChatAppKeyboardInput,
    applyPromptDraftEditToChatApp,
  };
}

function shouldReportConversationSessionModelSelection(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
}): boolean {
  return hasConversationSessionModelSelectionChanged(input) || hasConversationSessionModelSelectionBeenCommitted(input);
}

function hasConversationSessionModelSelectionChanged(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.selectedModelId !== input.nextChatSessionState.selectedModelId ||
    input.previousChatSessionState.selectedModelDefaultReasoningEffort !==
      input.nextChatSessionState.selectedModelDefaultReasoningEffort ||
    input.previousChatSessionState.selectedReasoningEffort !== input.nextChatSessionState.selectedReasoningEffort;
}

function hasConversationSessionModelSelectionBeenCommitted(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
}): boolean {
  if (input.chatSessionKeyboardInput.keyName !== "return") {
    return false;
  }

  if (input.nextChatSessionState.modelAndReasoningSelectionState.step !== "hidden") {
    return false;
  }

  return input.previousChatSessionState.modelAndReasoningSelectionState.step === "showing_available_models" ||
    input.previousChatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices";
}
