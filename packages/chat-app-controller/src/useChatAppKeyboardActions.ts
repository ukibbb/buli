import type {
  AvailableAssistantModel,
  ConversationSessionModelSelection,
} from "@buli/contracts";
import {
  applyChatSessionKeyboardInputToChatSessionState,
  applyChatSlashCommandToChatSessionState,
  insertSummarizedPastedTextIntoPromptDraft,
  refreshChatSlashCommandSelectionForCurrentState,
  replacePromptDraftFromEditor,
  readConversationSessionModelSelectionFromChatSessionState,
  type ChatSessionKeyboardEffect,
  type ChatSessionKeyboardInput,
  type ChatSessionState,
  type ChatSlashCommandSkill,
  type ChatSlashCommandApplicationEffect,
  type PromptContextQueryIdentity,
} from "@buli/chat-session-state";
import { useEffectEvent, type Dispatch, type SetStateAction } from "react";
import type {
  PendingToolApprovalDecisionSubmission,
  QueuedChatAppPrompt,
  SubmittedChatAppPrompt,
} from "./useChatAppAssistantTurnActions.ts";
import { useChatAppModelSelectionActions } from "./useChatAppModelSelectionActions.ts";
import { canChatAppPromptDraftBeEdited } from "./chatAppPromptDraftEditability.ts";
import {
  isAutoConversationSessionCompactionRunning,
  isConversationSessionCompactionBlockingPromptInput,
  type ConversationSessionCompactionStatus,
} from "./conversationSessionStatus.ts";

type MutableValueRef<T> = { current: T };

export type ChatAppPromptDraftEdit = {
  promptDraft: string;
  promptDraftCursorOffset: number;
};

export type ChatAppSummarizedPromptTextPaste = {
  pastedText: string;
  replacementStartOffset?: number;
  replacementEndOffset?: number;
};

export type ChatAppKeyboardInputApplication = {
  shouldConsumeKeyboardInput: boolean;
};

export type UseChatAppKeyboardActionsInput = {
  availableSkills?: readonly ChatSlashCommandSkill[] | undefined;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
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
};

export type UseChatAppKeyboardActionsResult = {
  applyChatAppKeyboardInput: (input: { chatSessionKeyboardInput: ChatSessionKeyboardInput }) => ChatAppKeyboardInputApplication;
  applyPromptDraftEditToChatApp: (promptDraftEdit: ChatAppPromptDraftEdit) => void;
  insertSummarizedPastedTextIntoChatAppPrompt: (summarizedPromptTextPaste: ChatAppSummarizedPromptTextPaste) => void;
};

export function useChatAppKeyboardActions(input: UseChatAppKeyboardActionsInput): UseChatAppKeyboardActionsResult {
  const { loadAvailableModelsForSelection } = useChatAppModelSelectionActions({
    loadAvailableAssistantModels: input.loadAvailableAssistantModels,
    setChatSessionState: input.setChatSessionState,
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
        void loadAvailableModelsForSelection();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "stream_assistant_response_for_selected_skill") {
        input.isPromptSubmissionInFlightRef.current = true;
        input.scrollConversationMessagesToBottom();
        void input.streamAssistantResponseForSubmittedPrompt({
          submittedPromptText: chatSlashCommandApplicationEffect.submittedPromptText,
          submittedPromptImageAttachments: [],
          submittedAssistantOperatingMode: input.latestChatSessionStateRef.current.selectedAssistantOperatingMode,
          submittedUserSelectedSkillName: chatSlashCommandApplicationEffect.skillName,
        });
        return;
      }
    },
  );

  const executeSlashCommand = useEffectEvent((slashCommandValue: string) => {
    const chatSlashCommandApplication = applyChatSlashCommandToChatSessionState(
      input.latestChatSessionStateRef.current,
      slashCommandValue,
    );
    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(
      chatSlashCommandApplication.nextChatSessionState,
      input.availableSkills,
    );
    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
    input.refreshPromptContextSelectionForChatSessionState(nextChatSessionState);
    applyChatSlashCommandApplicationEffectToChatApp(chatSlashCommandApplication.chatSlashCommandApplicationEffect);
  });

  const applyChatSessionKeyboardEffectToChatApp = useEffectEvent((keyboardEffectInput: {
    chatSessionKeyboardEffect: ChatSessionKeyboardEffect;
  }) => {
    switch (keyboardEffectInput.chatSessionKeyboardEffect.effectType) {
      case "active_conversation_turn_interrupt_key_pressed":
        input.requestActiveConversationTurnInterrupt();
        return;
      case "dismiss_active_prompt_context_query":
        input.dismissActivePromptContextQuery(keyboardEffectInput.chatSessionKeyboardEffect.dismissedPromptContextQueryIdentity);
        return;
      case "execute_selected_slash_command":
        executeSlashCommand(keyboardEffectInput.chatSessionKeyboardEffect.selectedSlashCommand.value);
        return;
      case "stream_assistant_response_for_submitted_prompt":
        input.isPromptSubmissionInFlightRef.current = true;
        input.scrollConversationMessagesToBottom();
        void input.streamAssistantResponseForSubmittedPrompt({
          submittedPromptText: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptText,
          submittedPromptImageAttachments: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptImageAttachments,
          submittedAssistantOperatingMode: keyboardEffectInput.chatSessionKeyboardEffect.submittedAssistantOperatingMode,
        });
        return;
      case "enqueue_submitted_prompt": {
        input.enqueueQueuedSubmittedPrompt({
          submittedPromptText: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptText,
          submittedPromptImageAttachments: keyboardEffectInput.chatSessionKeyboardEffect.submittedPromptImageAttachments,
          submittedAssistantOperatingMode: keyboardEffectInput.chatSessionKeyboardEffect.submittedAssistantOperatingMode,
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
    const isPromptInputBlockedByCompaction = isConversationSessionCompactionBlockingPromptInput(
      input.conversationSessionCompactionStatus,
    );
    const keyboardInteraction = applyChatSessionKeyboardInputToChatSessionState({
      chatSessionState: previousChatSessionState,
      chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      isPromptSubmissionInFlight: input.isPromptSubmissionInFlightRef.current || isPromptInputBlockedByCompaction,
      shouldQueueSubmittedPrompt: isAutoConversationSessionCompactionRunning(input.conversationSessionCompactionStatus),
    });

    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(
      keyboardInteraction.nextChatSessionState,
      input.availableSkills,
    );

    if (nextChatSessionState !== previousChatSessionState) {
      const shouldReportModelSelection = shouldReportConversationSessionModelSelection({
        previousChatSessionState,
        nextChatSessionState,
        chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      });

      input.latestChatSessionStateRef.current = nextChatSessionState;
      input.setChatSessionState(nextChatSessionState);
      input.refreshPromptContextSelectionForChatSessionState(nextChatSessionState);
      if (shouldReportModelSelection) {
        const modelSelection = readConversationSessionModelSelectionFromChatSessionState(
          nextChatSessionState,
        );
        void input.onConversationSessionModelSelectionChanged?.(modelSelection);
      }
    }

    if (keyboardInteraction.chatSessionKeyboardEffect) {
      applyChatSessionKeyboardEffectToChatApp({
        chatSessionKeyboardEffect: keyboardInteraction.chatSessionKeyboardEffect,
      });
    }

    return { shouldConsumeKeyboardInput: keyboardInteraction.shouldConsumeKeyboardInput };
  });

  const applyPromptDraftEditToChatApp = useEffectEvent((promptDraftEdit: ChatAppPromptDraftEdit) => {
    const previousChatSessionState = input.latestChatSessionStateRef.current;
    if (!canChatAppPromptDraftBeEdited({
      chatSessionState: previousChatSessionState,
      isConversationCompactionBlockingPromptInput: isConversationSessionCompactionBlockingPromptInput(
        input.conversationSessionCompactionStatus,
      ),
    })) {
      return;
    }

    const editedChatSessionState = replacePromptDraftFromEditor({
      chatSessionState: previousChatSessionState,
      promptDraft: promptDraftEdit.promptDraft,
      promptDraftCursorOffset: promptDraftEdit.promptDraftCursorOffset,
    });
    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(editedChatSessionState, input.availableSkills);

    if (nextChatSessionState === previousChatSessionState) {
      return;
    }

    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
    input.refreshPromptContextSelectionForChatSessionState(nextChatSessionState);
  });

  const insertSummarizedPastedTextIntoChatAppPrompt = useEffectEvent((summarizedPromptTextPaste: ChatAppSummarizedPromptTextPaste) => {
    const previousChatSessionState = input.latestChatSessionStateRef.current;
    if (!canChatAppPromptDraftBeEdited({
      chatSessionState: previousChatSessionState,
      isConversationCompactionBlockingPromptInput: isConversationSessionCompactionBlockingPromptInput(
        input.conversationSessionCompactionStatus,
      ),
    })) {
      return;
    }

    const editedChatSessionState = insertSummarizedPastedTextIntoPromptDraft({
      chatSessionState: previousChatSessionState,
      pastedText: summarizedPromptTextPaste.pastedText,
      ...(summarizedPromptTextPaste.replacementStartOffset !== undefined
        ? { replacementStartOffset: summarizedPromptTextPaste.replacementStartOffset }
        : {}),
      ...(summarizedPromptTextPaste.replacementEndOffset !== undefined
        ? { replacementEndOffset: summarizedPromptTextPaste.replacementEndOffset }
        : {}),
    });
    const nextChatSessionState = refreshChatSlashCommandSelectionForCurrentState(editedChatSessionState, input.availableSkills);

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
    insertSummarizedPastedTextIntoChatAppPrompt,
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
