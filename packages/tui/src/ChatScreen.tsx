import os from "node:os";
import type {
  AvailableAssistantModel,
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionSummary,
  ReasoningEffort,
  UserPromptImageAttachment,
} from "@buli/contracts";
import {
  type AssistantConversationRunner,
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
  type ConversationCompactionRequest,
} from "@buli/engine";
import type { PromptContextCandidate } from "@buli/prompt-context-core";
import {
  appendPromptImageAttachmentToDraft,
  applyChatSessionKeyboardInputToChatSessionState,
  applyChatSlashCommandToChatSessionState,
  createInitialChatSessionState,
  hideCommandHelpModal,
  listOrderedConversationMessageParts,
  refreshChatSlashCommandSelectionForCurrentState,
  removeLastPromptImageAttachmentFromDraft,
  replacePromptDraftFromEditor,
  hydrateConversationTranscriptFromSessionEntries,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  type ChatSessionKeyboardInput,
  type ChatSessionState,
  type ChatSessionKeyboardEffect,
  type ChatSlashCommandApplicationEffect,
} from "@buli/chat-session-state";
import { useKeyboard, usePaste, useTerminalDimensions } from "@opentui/react";
import { type KeyEvent, type PasteEvent, type ScrollBoxRenderable } from "@opentui/core";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme, classifyTerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import { ChatScreenInputArea } from "./components/ChatScreenInputArea.tsx";
import { ChatScreenMainArea } from "./components/ChatScreenMainArea.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { buildChatScreenViewModel } from "./behavior/chatScreenViewModel.ts";
import { formatChatScreenWorkingDirectoryPath } from "./behavior/chatScreenWorkingDirectoryLabel.ts";
import {
  normalizeOpenTuiKeyEventForChatSession,
} from "./behavior/openTuiKeyboardInputAdapter.ts";
import { normalizeOpenTuiPasteEventText } from "./behavior/normalizeOpenTuiPasteEventText.ts";
import { readNativeClipboardImageAttachment } from "./clipboard/readNativeClipboardImageAttachment.ts";
import { useChatScreenActiveTurnInterrupt } from "./behavior/useChatScreenActiveTurnInterrupt.ts";
import type { ConversationSessionCompactionStatus, ConversationSessionExportStatus } from "./behavior/chatScreenConversationSessionStatus.ts";
import { useChatScreenAssistantTurnActions } from "./behavior/useChatScreenAssistantTurnActions.ts";
import {
  useChatScreenConversationSessionActions,
  type ConversationSessionCompactionResult,
  type ConversationSessionExportResult,
  type ConversationSessionSwitchResult,
} from "./behavior/useChatScreenConversationSessionActions.ts";
import { useChatScreenPromptContextSelectionRefresh } from "./behavior/useChatScreenPromptContextSelectionRefresh.ts";
import type { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort;
  selectedReasoningEffort?: ReasoningEffort;
  initialConversationSessionId?: string;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[];
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  loadConversationSessions?: () => Promise<readonly ConversationSessionSummary[]> | readonly ConversationSessionSummary[];
  switchConversationSession?: (conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult;
  exportCurrentConversationSession?: () => Promise<ConversationSessionExportResult> | ConversationSessionExportResult;
  compactCurrentConversationSession?: (
    input: ConversationCompactionRequest,
  ) => Promise<ConversationSessionCompactionResult> | ConversationSessionCompactionResult;
  autoCompactCurrentConversationSession?: (
    input: ConversationAutoCompactionRequest,
  ) => Promise<ConversationAutoCompactionResult> | ConversationAutoCompactionResult;
  readClipboardImageAttachment?: () => Promise<UserPromptImageAttachment | undefined>;
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: () => ConversationSessionSwitchResult | void;
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type {
  ConversationSessionCompactionResult,
  ConversationSessionExportResult,
  ConversationSessionSwitchResult,
} from "./behavior/useChatScreenConversationSessionActions.ts";

type OpenTuiConsumableInputEvent = Pick<KeyEvent, "preventDefault" | "stopPropagation">;

function canPromptTextareaEditChatSessionState(chatSessionState: ChatSessionState): boolean {
  return chatSessionState.conversationTurnStatus === "waiting_for_user_input" &&
    !chatSessionState.isCommandHelpModalVisible &&
    chatSessionState.modelAndReasoningSelectionState.step === "hidden" &&
    chatSessionState.conversationSessionSelectionState.step === "hidden";
}

function shouldPromptTextareaHandleKeyboardInput(input: {
  chatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
}): boolean {
  if (!canPromptTextareaEditChatSessionState(input.chatSessionState)) {
    return false;
  }

  if (
    input.chatSessionKeyboardInput.keyName === "tab" ||
    input.chatSessionKeyboardInput.keyName === "pageup" ||
    input.chatSessionKeyboardInput.keyName === "pagedown"
  ) {
    return false;
  }

  if (
    input.chatSessionState.slashCommandSelectionState.step !== "hidden" ||
    input.chatSessionState.promptContextSelectionState.step !== "hidden"
  ) {
    return isPromptTextareaEditingKeyboardInput(input.chatSessionKeyboardInput) &&
      input.chatSessionKeyboardInput.keyName !== "up" &&
      input.chatSessionKeyboardInput.keyName !== "down" &&
      input.chatSessionKeyboardInput.keyName !== "return" &&
      input.chatSessionKeyboardInput.keyName !== "escape";
  }

  return isPromptTextareaEditingKeyboardInput(input.chatSessionKeyboardInput) &&
    input.chatSessionKeyboardInput.keyName !== "escape";
}

function isPromptTextareaEditingKeyboardInput(chatSessionKeyboardInput: ChatSessionKeyboardInput): boolean {
  if (chatSessionKeyboardInput.textInput !== undefined) {
    return true;
  }

  return chatSessionKeyboardInput.keyName === "backspace" ||
    chatSessionKeyboardInput.keyName === "delete" ||
    chatSessionKeyboardInput.keyName === "down" ||
    chatSessionKeyboardInput.keyName === "end" ||
    chatSessionKeyboardInput.keyName === "home" ||
    chatSessionKeyboardInput.keyName === "left" ||
    chatSessionKeyboardInput.keyName === "return" ||
    chatSessionKeyboardInput.keyName === "right" ||
    chatSessionKeyboardInput.keyName === "up";
}

function logChatScreenDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  diagnosticLogger?.({
    subsystem: "tui",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

export function ChatScreen(props: ChatScreenProps) {
  const { height: rows, width: columns } = useTerminalDimensions();
  const terminalSizeTierForChatScreen = classifyTerminalSizeTierForChatScreen({
    rowCount: rows,
    columnCount: columns,
  });
  const diagnosticLogger = props.diagnosticLogger;
  const [activeConversationSessionId, setActiveConversationSessionId] = useState<string | undefined>(
    props.initialConversationSessionId,
  );
  const [conversationSessionExportStatus, setConversationSessionExportStatus] = useState<ConversationSessionExportStatus>({
    step: "idle",
  });
  const [conversationSessionCompactionStatus, setConversationSessionCompactionStatus] = useState<ConversationSessionCompactionStatus>({
    step: "idle",
  });
  const [chatSessionState, setChatSessionState] = useState(() => {
    const initialChatSessionState = createInitialChatSessionState({
      selectedModelId: props.selectedModelId,
      ...(props.selectedModelDefaultReasoningEffort
        ? { selectedModelDefaultReasoningEffort: props.selectedModelDefaultReasoningEffort }
        : {}),
      ...(props.selectedReasoningEffort ? { selectedReasoningEffort: props.selectedReasoningEffort } : {}),
    });
    return props.initialConversationSessionEntries
      ? hydrateConversationTranscriptFromSessionEntries(initialChatSessionState, props.initialConversationSessionEntries)
      : initialChatSessionState;
  });

  const latestChatSessionStateRef = useRef<ChatSessionState>(chatSessionState);
  const latestActiveConversationSessionIdRef = useRef<string | undefined>(activeConversationSessionId);
  const isPromptSubmissionInFlightRef = useRef(false);
  const isConversationCompactionInFlightRef = useRef(false);
  const submittedToolApprovalDecisionApprovalIdRef = useRef<string | undefined>(undefined);
  const conversationMessageScrollBoxRef = useRef<ScrollBoxRenderable | null>(null);

  latestChatSessionStateRef.current = chatSessionState;
  latestActiveConversationSessionIdRef.current = activeConversationSessionId;

  const {
    isActiveTurnInterruptConfirmationArmed,
    getActiveConversationTurn,
    registerActiveConversationTurnStarted,
    registerActiveConversationTurnFinished,
    registerActiveConversationTurnSettlement,
    requestActiveConversationTurnInterrupt,
  } = useChatScreenActiveTurnInterrupt({
    activeConversationTurnShutdownCoordinator: props.activeConversationTurnShutdownCoordinator,
    diagnosticLogger,
  });
  const { dismissActivePromptContextQuery } = useChatScreenPromptContextSelectionRefresh({
    chatSessionState,
    setChatSessionState,
    loadPromptContextCandidates: props.loadPromptContextCandidates,
    diagnosticLogger,
  });
  const {
    loadConversationSessionsForSelection,
    switchToConversationSession,
    exportCurrentConversationSession,
    compactCurrentConversationSession,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    clearCurrentConversationSession,
  } = useChatScreenConversationSessionActions({
    loadConversationSessions: props.loadConversationSessions,
    switchConversationSession: props.switchConversationSession,
    exportCurrentConversationSession: props.exportCurrentConversationSession,
    compactCurrentConversationSession: props.compactCurrentConversationSession,
    autoCompactCurrentConversationSession: props.autoCompactCurrentConversationSession,
    onConversationCleared: props.onConversationCleared,
    latestChatSessionStateRef,
    latestActiveConversationSessionIdRef,
    isPromptSubmissionInFlightRef,
    isConversationCompactionInFlightRef,
    setChatSessionState,
    setActiveConversationSessionId,
    setConversationSessionExportStatus,
    setConversationSessionCompactionStatus,
    diagnosticLogger,
  });
  const {
    streamAssistantResponseForSubmittedPrompt,
    submitPendingToolApprovalDecision,
  } = useChatScreenAssistantTurnActions({
    chatSessionState,
    assistantConversationRunner: props.assistantConversationRunner,
    latestChatSessionStateRef,
    isPromptSubmissionInFlightRef,
    submittedToolApprovalDecisionApprovalIdRef,
    setChatSessionState,
    getActiveConversationTurn,
    registerActiveConversationTurnStarted,
    registerActiveConversationTurnFinished,
    registerActiveConversationTurnSettlement,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    diagnosticLogger,
  });

  useEffect(() => {
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.mounted", {
      selectedModelId: props.selectedModelId,
      selectedModelDefaultReasoningEffort: props.selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: props.selectedReasoningEffort ?? null,
    });

    return () => {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.unmounted", {
        selectedModelId: props.selectedModelId,
      });
    };
  }, [diagnosticLogger, props.selectedModelDefaultReasoningEffort, props.selectedModelId, props.selectedReasoningEffort]);

  const scrollConversationMessagesToBottom = useEffectEvent(() => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollTo(conversationMessageScrollBox.scrollHeight);
  });

  const scrollConversationMessagesByPage = useEffectEvent((direction: "up" | "down") => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollBy(direction === "up" ? -1 : 1, "viewport");
  });

  useEffect(() => {
    setChatSessionState((currentChatSessionState) =>
      refreshChatSlashCommandSelectionForCurrentState(currentChatSessionState)
    );
  }, [
    chatSessionState.promptDraft,
    chatSessionState.promptDraftCursorOffset,
    chatSessionState.conversationTurnStatus,
    chatSessionState.modelAndReasoningSelectionState.step,
    chatSessionState.conversationSessionSelectionState.step,
    chatSessionState.promptContextSelectionState.step,
    chatSessionState.isCommandHelpModalVisible,
    chatSessionState.isReasoningSummaryVisible,
    chatSessionState.selectedAssistantOperatingMode,
  ]);

  const loadAvailableModelsForSelection = useEffectEvent(async () => {
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_load_started", {
      currentSelectedModelId: latestChatSessionStateRef.current.selectedModelId,
    });
    setChatSessionState((currentChatSessionState) => showModelSelectionLoadingState(currentChatSessionState));

    try {
      const availableAssistantModels = await props.loadAvailableAssistantModels();
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_load_completed", {
        availableModelCount: availableAssistantModels.length,
      });
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showAvailableAssistantModelsForSelection(currentChatSessionState, availableAssistantModels),
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_load_failed", {
        errorMessage,
      });
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showModelSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  const applyChatSlashCommandApplicationEffectToChatScreen = useEffectEvent(
    (chatSlashCommandApplicationEffect: ChatSlashCommandApplicationEffect | undefined) => {
      if (!chatSlashCommandApplicationEffect) {
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "clear_current_conversation_session") {
        clearCurrentConversationSession();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "load_conversation_sessions") {
        void loadConversationSessionsForSelection();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "compact_current_conversation_session") {
        void compactCurrentConversationSession();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "export_current_conversation_session") {
        void exportCurrentConversationSession();
        return;
      }

      if (chatSlashCommandApplicationEffect.effectType === "load_available_assistant_models") {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_open_requested", {
          source: "slash_command",
        });
        void loadAvailableModelsForSelection();
        return;
      }

      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.reasoning_summary_visibility_toggled", {
        isReasoningSummaryVisible: chatSlashCommandApplicationEffect.isReasoningSummaryVisible,
      });
    },
  );

  const executeSlashCommand = useEffectEvent((slashCommandValue: string) => {
    const chatSlashCommandApplication = applyChatSlashCommandToChatSessionState(
      latestChatSessionStateRef.current,
      slashCommandValue,
    );
    latestChatSessionStateRef.current = chatSlashCommandApplication.nextChatSessionState;
    setChatSessionState(chatSlashCommandApplication.nextChatSessionState);
    applyChatSlashCommandApplicationEffectToChatScreen(chatSlashCommandApplication.chatSlashCommandApplicationEffect);
  });

  const applyChatSessionKeyboardEffectToChatScreen = useEffectEvent((input: {
    chatSessionKeyboardEffect: ChatSessionKeyboardEffect;
    previousChatSessionState: ChatSessionState;
  }) => {
    switch (input.chatSessionKeyboardEffect.effectType) {
      case "active_conversation_turn_interrupt_key_pressed":
        requestActiveConversationTurnInterrupt();
        return;
      case "dismiss_active_prompt_context_query":
        if (input.previousChatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates") {
          logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_selection_closed", {
            reason: "keyboard_escape",
            promptContextCandidateCount:
              input.previousChatSessionState.promptContextSelectionState.promptContextCandidates.length,
          });
        }
        dismissActivePromptContextQuery(input.chatSessionKeyboardEffect.dismissedPromptContextQueryIdentity);
        return;
      case "execute_selected_slash_command":
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.slash_command_selected", {
          slashCommand: input.chatSessionKeyboardEffect.selectedSlashCommand.value,
        });
        executeSlashCommand(input.chatSessionKeyboardEffect.selectedSlashCommand.value);
        return;
      case "stream_assistant_response_for_submitted_prompt":
        isPromptSubmissionInFlightRef.current = true;
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_submitted", {
          submittedPromptLength: input.chatSessionKeyboardEffect.submittedPromptText.length,
          submittedPromptImageAttachmentCount: input.chatSessionKeyboardEffect.submittedPromptImageAttachments.length,
          selectedModelId: input.previousChatSessionState.selectedModelId,
          selectedReasoningEffort: input.previousChatSessionState.selectedReasoningEffort ?? null,
        });
        scrollConversationMessagesToBottom();
        void streamAssistantResponseForSubmittedPrompt({
          submittedPromptText: input.chatSessionKeyboardEffect.submittedPromptText,
          submittedPromptImageAttachments: input.chatSessionKeyboardEffect.submittedPromptImageAttachments,
        });
        return;
      case "submit_pending_tool_approval_decision":
        submitPendingToolApprovalDecision({
          decision: input.chatSessionKeyboardEffect.decision,
          source: input.chatSessionKeyboardEffect.source,
        });
        return;
      case "scroll_conversation_messages_by_page":
        scrollConversationMessagesByPage(input.chatSessionKeyboardEffect.direction);
        return;
      case "switch_to_selected_conversation_session":
        void switchToConversationSession(input.chatSessionKeyboardEffect.conversationSessionId);
        return;
    }
  });

  const applyKeyboardInputToChatScreen = useEffectEvent((input: {
    chatSessionKeyboardInput: ChatSessionKeyboardInput;
    inputEvent?: OpenTuiConsumableInputEvent;
    shouldRespectPromptTextareaOwnership?: boolean;
  }) => {
    const previousChatSessionState = latestChatSessionStateRef.current;
    if (input.chatSessionKeyboardInput.keyName === "paste") {
      input.inputEvent?.preventDefault();
      input.inputEvent?.stopPropagation();
      void pasteClipboardImageAttachmentIntoPrompt();
      return;
    }

    if (
      input.chatSessionKeyboardInput.keyName === "backspace" &&
      previousChatSessionState.promptDraft.length === 0 &&
      previousChatSessionState.pendingPromptImageAttachments.length > 0
    ) {
      input.inputEvent?.preventDefault();
      input.inputEvent?.stopPropagation();
      const nextChatSessionState = removeLastPromptImageAttachmentFromDraft(previousChatSessionState);
      latestChatSessionStateRef.current = nextChatSessionState;
      setChatSessionState(nextChatSessionState);
      return;
    }

    if (
      input.shouldRespectPromptTextareaOwnership !== false &&
      shouldPromptTextareaHandleKeyboardInput({
        chatSessionState: previousChatSessionState,
        chatSessionKeyboardInput: input.chatSessionKeyboardInput,
      })
    ) {
      return;
    }

    const keyboardInteraction = applyChatSessionKeyboardInputToChatSessionState({
      chatSessionState: previousChatSessionState,
      chatSessionKeyboardInput: input.chatSessionKeyboardInput,
      isPromptSubmissionInFlight: isPromptSubmissionInFlightRef.current,
    });

    if (keyboardInteraction.shouldConsumeKeyboardInput) {
      input.inputEvent?.preventDefault();
      input.inputEvent?.stopPropagation();
    }

    if (keyboardInteraction.promptSubmissionRejectionReason) {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_submission_ignored", {
        promptDraftLength: previousChatSessionState.promptDraft.length,
        conversationTurnStatus: previousChatSessionState.conversationTurnStatus,
        promptContextSelectionStep: previousChatSessionState.promptContextSelectionState.step,
        modelSelectionStep: previousChatSessionState.modelAndReasoningSelectionState.step,
        reason: keyboardInteraction.promptSubmissionRejectionReason,
      });
    }

    if (keyboardInteraction.nextChatSessionState !== previousChatSessionState) {
      if (
        previousChatSessionState.selectedAssistantOperatingMode !==
          keyboardInteraction.nextChatSessionState.selectedAssistantOperatingMode
      ) {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.assistant_operating_mode_cycled", {
          selectedAssistantOperatingMode: keyboardInteraction.nextChatSessionState.selectedAssistantOperatingMode,
        });
      }

      latestChatSessionStateRef.current = keyboardInteraction.nextChatSessionState;
      setChatSessionState(keyboardInteraction.nextChatSessionState);
    }

    if (keyboardInteraction.chatSessionKeyboardEffect) {
      applyChatSessionKeyboardEffectToChatScreen({
        chatSessionKeyboardEffect: keyboardInteraction.chatSessionKeyboardEffect,
        previousChatSessionState,
      });
    }
  });

  const applyPromptTextareaEditToChatScreen = useEffectEvent((input: {
    promptDraft: string;
    promptDraftCursorOffset: number;
  }) => {
    const previousChatSessionState = latestChatSessionStateRef.current;
    const nextChatSessionState = replacePromptDraftFromEditor({
      chatSessionState: previousChatSessionState,
      promptDraft: input.promptDraft,
      promptDraftCursorOffset: input.promptDraftCursorOffset,
    });

    if (nextChatSessionState === previousChatSessionState) {
      return;
    }

    latestChatSessionStateRef.current = nextChatSessionState;
    setChatSessionState(nextChatSessionState);
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
    const previousChatSessionState = latestChatSessionStateRef.current;
    if (!canPromptTextareaEditChatSessionState(previousChatSessionState)) {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.clipboard_image_paste_ignored", {
        conversationTurnStatus: previousChatSessionState.conversationTurnStatus,
      });
      return;
    }

    const readClipboardImageAttachment = props.readClipboardImageAttachment ?? readNativeClipboardImageAttachment;
    const clipboardImageAttachment = await readClipboardImageAttachment().catch(() => undefined);
    if (!clipboardImageAttachment) {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.clipboard_image_paste_no_image");
      return;
    }

    const nextChatSessionState = appendPromptImageAttachmentToDraft(
      latestChatSessionStateRef.current,
      clipboardImageAttachment,
    );
    latestChatSessionStateRef.current = nextChatSessionState;
    setChatSessionState(nextChatSessionState);
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.clipboard_image_pasted", {
      pendingPromptImageAttachmentCount: nextChatSessionState.pendingPromptImageAttachments.length,
      mimeType: clipboardImageAttachment.mimeType,
      dataUrlLength: clipboardImageAttachment.dataUrl.length,
    });
  });

  const handlePasteOutsidePromptTextarea = useEffectEvent((pasteEvent: PasteEvent) => {
    if (canPromptTextareaEditChatSessionState(latestChatSessionStateRef.current)) {
      return;
    }

    pasteEvent.preventDefault();
    pasteEvent.stopPropagation();

    const pastedText = normalizeOpenTuiPasteEventText(pasteEvent);
    if (pastedText.length === 0) {
      return;
    }

    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.paste_ignored", {
      conversationTurnStatus: latestChatSessionStateRef.current.conversationTurnStatus,
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

  const homeDirectoryPath = os.homedir();
  const rawWorkingDirectoryPath = process.cwd();
  const workingDirectoryPath = formatChatScreenWorkingDirectoryPath({
    homeDirectoryPath,
    workingDirectoryPath: rawWorkingDirectoryPath,
  });
  const {
    isPromptInputDisabled,
    availableChatSlashCommands,
    modeLabel,
    inputPanelAccentColor,
    promptInputHintOverride,
    reasoningEffortLabel,
    availableCommandHelpModalRowCount,
    totalContextTokensUsed,
    contextWindowTokenCapacity,
    orderedConversationMessages,
    orderedConversationMessagePartCount,
    shouldRenderMinimumHeightPromptStrip,
  } = buildChatScreenViewModel({
    chatSessionState,
    terminalRowCount: rows,
    terminalColumnCount: columns,
    terminalSizeTierForChatScreen,
  });

  useEffect(() => {
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.render_snapshot", {
      rows,
      terminalSizeTier: terminalSizeTierForChatScreen,
      conversationTurnStatus: chatSessionState.conversationTurnStatus,
      selectedAssistantOperatingMode: chatSessionState.selectedAssistantOperatingMode,
      selectedModelId: chatSessionState.selectedModelId,
      selectedModelDefaultReasoningEffort: chatSessionState.selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: chatSessionState.selectedReasoningEffort ?? null,
      promptDraftLength: chatSessionState.promptDraft.length,
      selectedPromptContextReferenceCount: chatSessionState.selectedPromptContextReferenceTexts.length,
      conversationMessageCount: orderedConversationMessages.length,
      conversationMessagePartCount: orderedConversationMessagePartCount,
      hasPendingToolApprovalRequest: chatSessionState.pendingToolApprovalRequest !== undefined,
      promptContextSelectionStep: chatSessionState.promptContextSelectionState.step,
      slashCommandSelectionStep: chatSessionState.slashCommandSelectionState.step,
      modelSelectionStep: chatSessionState.modelAndReasoningSelectionState.step,
      isCommandHelpModalVisible: chatSessionState.isCommandHelpModalVisible,
      isReasoningSummaryVisible: chatSessionState.isReasoningSummaryVisible,
      totalContextTokensUsed: totalContextTokensUsed ?? null,
      contextWindowTokenCapacity: contextWindowTokenCapacity ?? null,
    });
  }, [
    chatSessionState.conversationTurnStatus,
    chatSessionState.isCommandHelpModalVisible,
    chatSessionState.modelAndReasoningSelectionState.step,
    chatSessionState.pendingToolApprovalRequest,
    chatSessionState.pendingPromptImageAttachments.length,
    chatSessionState.promptContextSelectionState.step,
    chatSessionState.promptDraft.length,
    chatSessionState.isReasoningSummaryVisible,
    chatSessionState.selectedAssistantOperatingMode,
    chatSessionState.selectedModelId,
    chatSessionState.selectedModelDefaultReasoningEffort,
    chatSessionState.selectedPromptContextReferenceTexts.length,
    chatSessionState.selectedReasoningEffort,
    chatSessionState.slashCommandSelectionState.step,
    contextWindowTokenCapacity,
    diagnosticLogger,
    orderedConversationMessagePartCount,
    orderedConversationMessages.length,
    rows,
    terminalSizeTierForChatScreen,
    totalContextTokensUsed,
  ]);

  return (
    <box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={rows}>
      <TopBar workingDirectoryPath={workingDirectoryPath} />
      <box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={2} paddingTop={1}>
        <ChatScreenMainArea
          chatSessionState={chatSessionState}
          inputPanelAccentColor={inputPanelAccentColor}
          availableCommandHelpModalRowCount={availableCommandHelpModalRowCount}
          terminalSizeTierForChatScreen={terminalSizeTierForChatScreen}
          availableChatSlashCommands={availableChatSlashCommands}
          orderedConversationMessages={orderedConversationMessages}
          conversationMessageScrollBoxRef={conversationMessageScrollBoxRef}
          resolveConversationMessageParts={(messageId) => listOrderedConversationMessageParts(chatSessionState, messageId)}
          onCommandHelpCloseRequested={() =>
            setChatSessionState((currentChatSessionState) => hideCommandHelpModal(currentChatSessionState))
          }
        />
      </box>
      <ChatScreenInputArea
        chatSessionState={chatSessionState}
        conversationSessionExportStatus={conversationSessionExportStatus}
        conversationSessionCompactionStatus={conversationSessionCompactionStatus}
        shouldRenderMinimumHeightPromptStrip={shouldRenderMinimumHeightPromptStrip}
        isPromptInputDisabled={isPromptInputDisabled}
        isActiveTurnInterruptConfirmationArmed={isActiveTurnInterruptConfirmationArmed}
        inputPanelAccentColor={inputPanelAccentColor}
        promptInputHintOverride={promptInputHintOverride}
        modeLabel={modeLabel}
        reasoningEffortLabel={reasoningEffortLabel}
        totalContextTokensUsed={totalContextTokensUsed}
        contextWindowTokenCapacity={contextWindowTokenCapacity}
        onPendingToolApprovalApproved={() => {
          submitPendingToolApprovalDecision({ decision: "approved", source: "button" });
        }}
        onPendingToolApprovalDenied={() => {
          submitPendingToolApprovalDecision({ decision: "denied", source: "button" });
        }}
        onPromptDraftEdited={applyPromptTextareaEditToChatScreen}
        onPromptSubmitted={submitPromptDraftFromPromptTextarea}
        onNativeClipboardPasteRequested={pasteClipboardImageAttachmentIntoPrompt}
      />
    </box>
  );
}
