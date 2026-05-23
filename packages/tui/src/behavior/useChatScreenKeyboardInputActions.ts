import {
  type AvailableAssistantModel,
  type BuliDiagnosticLogger,
  type ConversationSessionModelSelection,
  type UserPromptImageAttachment,
} from "@buli/contracts";
import {
  appendPromptImageAttachmentToDraft,
  applyChatSessionKeyboardInputToChatSessionState,
  applyChatSlashCommandToChatSessionState,
  refreshChatSlashCommandSelectionForCurrentState,
  removePromptImageAttachmentPlaceholderAtCursor,
  removePromptImageAttachmentPlaceholderBeforeCursor,
  replacePromptDraftFromEditor,
  readConversationSessionModelSelectionFromChatSessionState,
  type ChatSessionKeyboardEffect,
  type ChatSessionKeyboardInput,
  type ChatSessionState,
  type ChatSlashCommandApplicationEffect,
  type PromptContextQueryIdentity,
} from "@buli/chat-session-state";
import { useChatAppModelSelectionActions } from "@buli/chat-app-controller";
import { type KeyEvent, type PasteEvent } from "@opentui/core";
import { useKeyboard, usePaste } from "@opentui/react";
import { useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { readNativeClipboardImageAttachment } from "../clipboard/readNativeClipboardImageAttachment.ts";
import type { PromptTextareaEdit } from "../components/PromptTextarea.tsx";
import { logTuiDiagnosticEvent as logChatScreenDiagnosticEvent } from "../diagnostics/logTuiDiagnosticEvent.ts";
import {
  canPromptTextareaEditChatScreenInput,
  isPromptInteractionKeyboardInput,
  shouldPromptTextareaHandleKeyboardInput,
} from "./chatScreenPromptTextareaKeyboardOwnership.ts";
import {
  normalizeOpenTuiPasteEventText,
  readOpenTuiNonTextPasteMetadata,
} from "./normalizeOpenTuiPasteEventText.ts";
import { normalizeOpenTuiKeyEventForChatSession } from "./openTuiKeyboardInputAdapter.ts";
import type {
  PendingToolApprovalDecisionSubmission,
  SubmittedChatScreenPrompt,
} from "./useChatScreenAssistantTurnActions.ts";

type MutableValueRef<T> = { current: T };

type OpenTuiConsumableInputEvent = Pick<KeyEvent, "preventDefault" | "stopPropagation">;

export type UseChatScreenKeyboardInputActionsInput = {
  chatSessionState: ChatSessionState;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  readClipboardImageAttachment?: (() => Promise<UserPromptImageAttachment | undefined>) | undefined;
  latestChatSessionStateRef: MutableValueRef<ChatSessionState>;
  isPromptSubmissionInFlightRef: MutableValueRef<boolean>;
  isConversationCompactionInFlightRef: MutableValueRef<boolean>;
  setChatSessionState: Dispatch<SetStateAction<ChatSessionState>>;
  requestActiveConversationTurnInterrupt: () => void;
  dismissActivePromptContextQuery: (dismissedPromptContextQueryIdentity: PromptContextQueryIdentity | undefined) => void;
  loadConversationSessionsForSelection: () => Promise<void>;
  switchToConversationSession: (conversationSessionId: string) => Promise<void>;
  requestConversationSessionDeletion: (conversationSessionId: string) => Promise<void>;
  exportCurrentConversationSession: () => Promise<void>;
  compactCurrentConversationSession: () => Promise<void>;
  clearCurrentConversationSession: () => void;
  onConversationSessionModelSelectionChanged?:
    | ((modelSelection: ConversationSessionModelSelection) => void | Promise<void>)
    | undefined;
  streamAssistantResponseForSubmittedPrompt: (submittedPrompt: SubmittedChatScreenPrompt) => Promise<void>;
  submitPendingToolApprovalDecision: (submission: PendingToolApprovalDecisionSubmission) => void;
  scrollConversationMessagesToBottom: () => void;
  scrollConversationMessagesByPage: (direction: "up" | "down") => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type UseChatScreenKeyboardInputActionsResult = {
  applyPromptTextareaEditToChatScreen: (promptTextareaEdit: PromptTextareaEdit) => void;
  submitPromptDraftFromPromptTextarea: () => void;
  pasteClipboardImageAttachmentIntoPrompt: () => Promise<void>;
};

export function useChatScreenKeyboardInputActions(
  input: UseChatScreenKeyboardInputActionsInput,
): UseChatScreenKeyboardInputActionsResult {
  const { loadAvailableModelsForSelection } = useChatAppModelSelectionActions({
    loadAvailableAssistantModels: input.loadAvailableAssistantModels,
    latestChatSessionStateRef: input.latestChatSessionStateRef,
    setChatSessionState: input.setChatSessionState,
    diagnosticLogger: input.diagnosticLogger,
  });

  useEffect(() => {
    input.setChatSessionState((currentChatSessionState) =>
      refreshChatSlashCommandSelectionForCurrentState(currentChatSessionState)
    );
  }, [
    input.chatSessionState.promptDraft,
    input.chatSessionState.promptDraftCursorOffset,
    input.chatSessionState.conversationTurnStatus,
    input.chatSessionState.modelAndReasoningSelectionState.step,
    input.chatSessionState.conversationSessionSelectionState.step,
    input.chatSessionState.promptContextSelectionState.step,
    input.chatSessionState.isCommandHelpModalVisible,
    input.chatSessionState.isReasoningSummaryVisible,
    input.chatSessionState.selectedAssistantOperatingMode,
  ]);

  const applyChatSlashCommandApplicationEffectToChatScreen = useEffectEvent(
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
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_open_requested", {
          source: "slash_command",
        });
        void loadAvailableModelsForSelection();
        return;
      }

      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.reasoning_summary_visibility_toggled", {
        isReasoningSummaryVisible: chatSlashCommandApplicationEffect.isReasoningSummaryVisible,
      });
    },
  );

  const executeSlashCommand = useEffectEvent((slashCommandValue: string) => {
    const chatSlashCommandApplication = applyChatSlashCommandToChatSessionState(
      input.latestChatSessionStateRef.current,
      slashCommandValue,
    );
    input.latestChatSessionStateRef.current = chatSlashCommandApplication.nextChatSessionState;
    input.setChatSessionState(chatSlashCommandApplication.nextChatSessionState);
    applyChatSlashCommandApplicationEffectToChatScreen(chatSlashCommandApplication.chatSlashCommandApplicationEffect);
  });

  const applyChatSessionKeyboardEffectToChatScreen = useEffectEvent((keyboardEffectInput: {
    chatSessionKeyboardEffect: ChatSessionKeyboardEffect;
    previousChatSessionState: ChatSessionState;
  }) => {
    switch (keyboardEffectInput.chatSessionKeyboardEffect.effectType) {
      case "active_conversation_turn_interrupt_key_pressed":
        input.requestActiveConversationTurnInterrupt();
        return;
      case "dismiss_active_prompt_context_query":
        if (keyboardEffectInput.previousChatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates") {
          logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_context_selection_closed", {
            reason: "keyboard_escape",
            promptContextCandidateCount:
              keyboardEffectInput.previousChatSessionState.promptContextSelectionState.promptContextCandidates.length,
          });
        }
        input.dismissActivePromptContextQuery(keyboardEffectInput.chatSessionKeyboardEffect.dismissedPromptContextQueryIdentity);
        return;
      case "execute_selected_slash_command":
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.slash_command_selected", {
          slashCommand: keyboardEffectInput.chatSessionKeyboardEffect.selectedSlashCommand.value,
        });
        executeSlashCommand(keyboardEffectInput.chatSessionKeyboardEffect.selectedSlashCommand.value);
        return;
      case "stream_assistant_response_for_submitted_prompt":
        input.isPromptSubmissionInFlightRef.current = true;
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_submitted", {
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

  const applyKeyboardInputToChatScreen = useEffectEvent((keyboardInput: {
    chatSessionKeyboardInput: ChatSessionKeyboardInput;
    inputEvent?: OpenTuiConsumableInputEvent;
    shouldRespectPromptTextareaOwnership?: boolean;
  }) => {
    const previousChatSessionState = input.latestChatSessionStateRef.current;
    if (keyboardInput.chatSessionKeyboardInput.keyName === "paste") {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
      void pasteClipboardImageAttachmentIntoPrompt();
      return;
    }

    if (
      input.isConversationCompactionInFlightRef.current &&
      isPromptInteractionKeyboardInput(keyboardInput.chatSessionKeyboardInput)
    ) {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
      return;
    }

    const nextChatSessionStateAfterImagePlaceholderDeletion =
      keyboardInput.chatSessionKeyboardInput.keyName === "backspace"
        ? removePromptImageAttachmentPlaceholderBeforeCursor(previousChatSessionState)
        : keyboardInput.chatSessionKeyboardInput.keyName === "delete"
          ? removePromptImageAttachmentPlaceholderAtCursor(previousChatSessionState)
          : previousChatSessionState;
    if (nextChatSessionStateAfterImagePlaceholderDeletion !== previousChatSessionState) {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
      input.latestChatSessionStateRef.current = nextChatSessionStateAfterImagePlaceholderDeletion;
      input.setChatSessionState(nextChatSessionStateAfterImagePlaceholderDeletion);
      return;
    }

    if (
      keyboardInput.shouldRespectPromptTextareaOwnership !== false &&
      shouldPromptTextareaHandleKeyboardInput({
        chatSessionState: previousChatSessionState,
        chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      })
    ) {
      return;
    }

    const keyboardInteraction = applyChatSessionKeyboardInputToChatSessionState({
      chatSessionState: previousChatSessionState,
      chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      isPromptSubmissionInFlight: input.isPromptSubmissionInFlightRef.current || input.isConversationCompactionInFlightRef.current,
    });

    if (keyboardInteraction.shouldConsumeKeyboardInput) {
      keyboardInput.inputEvent?.preventDefault();
      keyboardInput.inputEvent?.stopPropagation();
    }

    if (keyboardInteraction.promptSubmissionRejectionReason) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.prompt_submission_ignored", {
        promptDraftLength: previousChatSessionState.promptDraft.length,
        conversationTurnStatus: previousChatSessionState.conversationTurnStatus,
        promptContextSelectionStep: previousChatSessionState.promptContextSelectionState.step,
        modelSelectionStep: previousChatSessionState.modelAndReasoningSelectionState.step,
        reason: keyboardInteraction.promptSubmissionRejectionReason,
      });
    }

    if (keyboardInteraction.nextChatSessionState !== previousChatSessionState) {
      const shouldReportModelSelection = shouldReportConversationSessionModelSelection({
        previousChatSessionState,
        nextChatSessionState: keyboardInteraction.nextChatSessionState,
        chatSessionKeyboardInput: keyboardInput.chatSessionKeyboardInput,
      });
      if (
        previousChatSessionState.selectedAssistantOperatingMode !==
          keyboardInteraction.nextChatSessionState.selectedAssistantOperatingMode
      ) {
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.assistant_operating_mode_cycled", {
          selectedAssistantOperatingMode: keyboardInteraction.nextChatSessionState.selectedAssistantOperatingMode,
        });
      }

      input.latestChatSessionStateRef.current = keyboardInteraction.nextChatSessionState;
      input.setChatSessionState(keyboardInteraction.nextChatSessionState);
      if (shouldReportModelSelection) {
        const modelSelection = readConversationSessionModelSelectionFromChatSessionState(
          keyboardInteraction.nextChatSessionState,
        );
        logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.model_selection_changed", {
          selectedModelId: modelSelection.selectedModelId,
          selectedModelDefaultReasoningEffort: modelSelection.selectedModelDefaultReasoningEffort ?? null,
          selectedReasoningEffort: modelSelection.selectedReasoningEffort ?? null,
        });
        void input.onConversationSessionModelSelectionChanged?.(modelSelection);
      }
    }

    if (keyboardInteraction.chatSessionKeyboardEffect) {
      applyChatSessionKeyboardEffectToChatScreen({
        chatSessionKeyboardEffect: keyboardInteraction.chatSessionKeyboardEffect,
        previousChatSessionState,
      });
    }
  });

  const applyPromptTextareaEditToChatScreen = useEffectEvent((promptTextareaEdit: PromptTextareaEdit) => {
    if (input.isConversationCompactionInFlightRef.current) {
      return;
    }

    const previousChatSessionState = input.latestChatSessionStateRef.current;
    const nextChatSessionState = replacePromptDraftFromEditor({
      chatSessionState: previousChatSessionState,
      promptDraft: promptTextareaEdit.promptDraft,
      promptDraftCursorOffset: promptTextareaEdit.promptDraftCursorOffset,
    });

    if (nextChatSessionState === previousChatSessionState) {
      return;
    }

    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
  });

  const submitPromptDraftFromPromptTextarea = useEffectEvent(() => {
    applyKeyboardInputToChatScreen({
      chatSessionKeyboardInput: {
        keyName: "return",
        textInput: undefined,
        isCtrlPressed: false,
        isMetaPressed: false,
      },
      shouldRespectPromptTextareaOwnership: false,
    });
  });

  const pasteClipboardImageAttachmentIntoPrompt = useEffectEvent(async () => {
    const previousChatSessionState = input.latestChatSessionStateRef.current;
    if (!canPromptTextareaEditChatScreenInput({
      chatSessionState: previousChatSessionState,
      isConversationCompactionInFlight: input.isConversationCompactionInFlightRef.current,
    })) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_ignored", {
        conversationTurnStatus: previousChatSessionState.conversationTurnStatus,
        reason: input.isConversationCompactionInFlightRef.current ? "conversation_compaction_in_flight" : "prompt_not_editable",
      });
      return;
    }

    const readClipboardImageAttachment = input.readClipboardImageAttachment ?? readNativeClipboardImageAttachment;
    const clipboardImageAttachment = await readClipboardImageAttachment().catch(() => undefined);
    if (!clipboardImageAttachment) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_no_image");
      return;
    }

    const latestChatSessionStateAfterClipboardRead = input.latestChatSessionStateRef.current;
    if (!canPromptTextareaEditChatScreenInput({
      chatSessionState: latestChatSessionStateAfterClipboardRead,
      isConversationCompactionInFlight: input.isConversationCompactionInFlightRef.current,
    })) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_paste_ignored", {
        conversationTurnStatus: latestChatSessionStateAfterClipboardRead.conversationTurnStatus,
        reason: input.isConversationCompactionInFlightRef.current ? "conversation_compaction_in_flight" : "prompt_not_editable",
      });
      return;
    }

    const nextChatSessionState = appendPromptImageAttachmentToDraft(
      latestChatSessionStateAfterClipboardRead,
      clipboardImageAttachment,
    );
    input.latestChatSessionStateRef.current = nextChatSessionState;
    input.setChatSessionState(nextChatSessionState);
    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.clipboard_image_pasted", {
      pendingPromptImageAttachmentCount: nextChatSessionState.pendingPromptImageAttachments.length,
      mimeType: clipboardImageAttachment.mimeType,
      dataUrlLength: clipboardImageAttachment.dataUrl.length,
    });
  });

  const handlePasteOutsidePromptTextarea = useEffectEvent((pasteEvent: PasteEvent) => {
    if (canPromptTextareaEditChatScreenInput({
      chatSessionState: input.latestChatSessionStateRef.current,
      isConversationCompactionInFlight: input.isConversationCompactionInFlightRef.current,
    })) {
      return;
    }

    pasteEvent.preventDefault();
    pasteEvent.stopPropagation();

    const nonTextPasteMetadata = readOpenTuiNonTextPasteMetadata(pasteEvent);
    if (nonTextPasteMetadata) {
      logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.non_text_paste_ignored", {
        conversationTurnStatus: input.latestChatSessionStateRef.current.conversationTurnStatus,
        pasteKind: nonTextPasteMetadata.pasteKind,
        mimeType: nonTextPasteMetadata.mimeType ?? null,
        pastedByteLength: pasteEvent.bytes.length,
      });
      return;
    }

    const pastedText = normalizeOpenTuiPasteEventText(pasteEvent);
    if (pastedText.length === 0) {
      return;
    }

    logChatScreenDiagnosticEvent(input.diagnosticLogger, "chat_screen.paste_ignored", {
      conversationTurnStatus: input.latestChatSessionStateRef.current.conversationTurnStatus,
      pastedTextLength: pastedText.length,
    });
  });

  usePaste(handlePasteOutsidePromptTextarea);

  useKeyboard((keyEvent: KeyEvent) => {
    applyKeyboardInputToChatScreen({
      chatSessionKeyboardInput: normalizeOpenTuiKeyEventForChatSession(keyEvent),
      inputEvent: keyEvent,
    });
  });

  return {
    applyPromptTextareaEditToChatScreen,
    submitPromptDraftFromPromptTextarea,
    pasteClipboardImageAttachmentIntoPrompt,
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
