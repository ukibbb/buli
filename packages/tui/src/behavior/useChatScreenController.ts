import type { TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import { useChatAppController } from "@buli/chat-app-controller";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ChatScreenProps } from "../ChatScreen.tsx";
import type { ChatScreenMainAreaProps } from "../components/ChatScreenMainArea.tsx";
import type { ChatScreenLayoutProps } from "../components/ChatScreenLayout.tsx";
import type { LiveInteractionChromeProps } from "../components/LiveInteractionChrome.tsx";
import type { LiveInteractionStatusStackProps } from "../components/LiveInteractionStatusStack.tsx";
import type { PromptComposerChromeProps } from "../components/PromptComposerChrome.tsx";
import {
  buildChatScreenInteractionStatusDiagnosticFields,
  buildChatScreenPromptRenderDiagnosticFields,
  buildChatScreenTranscriptRenderDiagnosticFields,
} from "./chatScreenRenderSnapshotDiagnostics.ts";
import {
  buildChatScreenInteractionViewModel,
  buildStableChatScreenTranscriptViewModel,
  type ChatScreenTranscriptViewModelCache,
} from "./chatScreenViewModel.ts";
import {
  DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT,
  revealOlderConversationTranscriptMessages,
} from "./conversationTranscriptWindow.ts";
import { useChatScreenKeyboardInputActions } from "./useChatScreenKeyboardInputActions.ts";
import { useConversationTranscriptViewport } from "./useConversationTranscriptViewport.ts";
import { logTuiDiagnosticEvent as logChatScreenDiagnosticEvent } from "../diagnostics/logTuiDiagnosticEvent.ts";

export type UseChatScreenControllerInput = {
  chatScreenProps: ChatScreenProps;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
};

export type UseChatScreenControllerResult = Pick<
  ChatScreenLayoutProps,
  "mainAreaProps" | "liveInteractionChromeProps"
>;

export function useChatScreenController(input: UseChatScreenControllerInput): UseChatScreenControllerResult {
  const { chatScreenProps, terminalColumnCount, terminalRowCount, terminalSizeTierForChatScreen } = input;
  const diagnosticLogger = chatScreenProps.diagnosticLogger;
  const [requestedVisibleConversationMessageCount, setRequestedVisibleConversationMessageCount] = useState(
    DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT,
  );
  const chatScreenTranscriptViewModelCacheRef = useRef<ChatScreenTranscriptViewModelCache | undefined>(undefined);
  const stableMainAreaPropsRef = useRef<ChatScreenMainAreaProps | undefined>(undefined);
  const stableStatusStackPropsRef = useRef<LiveInteractionStatusStackProps | undefined>(undefined);
  const stablePromptComposerPropsRef = useRef<PromptComposerChromeProps | undefined>(undefined);
  const stableLiveInteractionChromePropsRef = useRef<LiveInteractionChromeProps | undefined>(undefined);

  const {
    conversationMessageScrollBoxRef,
    scrollConversationMessagesToBottom,
    scrollConversationMessagesByPage,
  } = useConversationTranscriptViewport();

  const chatAppController = useChatAppController({
    selectedModelId: chatScreenProps.selectedModelId,
    selectedModelDefaultReasoningEffort: chatScreenProps.selectedModelDefaultReasoningEffort,
    selectedReasoningEffort: chatScreenProps.selectedReasoningEffort,
    initialConversationSessionId: chatScreenProps.initialConversationSessionId,
    initialConversationSessionEntries: chatScreenProps.initialConversationSessionEntries,
    loadAvailableAssistantModels: chatScreenProps.loadAvailableAssistantModels,
    loadPromptContextCandidates: chatScreenProps.loadPromptContextCandidates,
    loadConversationSessions: chatScreenProps.loadConversationSessions,
    switchConversationSession: chatScreenProps.switchConversationSession,
    deleteConversationSession: chatScreenProps.deleteConversationSession,
    exportCurrentConversationSession: chatScreenProps.exportCurrentConversationSession,
    compactCurrentConversationSession: chatScreenProps.compactCurrentConversationSession,
    autoCompactCurrentConversationSession: chatScreenProps.autoCompactCurrentConversationSession,
    assistantConversationRunner: chatScreenProps.assistantConversationRunner,
    onConversationCleared: chatScreenProps.onConversationCleared,
    onConversationSessionModelSelectionChanged: chatScreenProps.onConversationSessionModelSelectionChanged,
    activeConversationTurnShutdownCoordinator: chatScreenProps.activeConversationTurnShutdownCoordinator,
    scrollConversationMessagesToBottom,
    scrollConversationMessagesByPage,
    diagnosticLogger,
  });

  useEffect(() => {
    setRequestedVisibleConversationMessageCount(DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT);
  }, [chatAppController.activeConversationSessionId]);

  useEffect(() => {
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.mounted", {
      selectedModelId: chatScreenProps.selectedModelId,
      selectedModelDefaultReasoningEffort: chatScreenProps.selectedModelDefaultReasoningEffort ?? null,
      selectedReasoningEffort: chatScreenProps.selectedReasoningEffort ?? null,
    });

    return () => {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.unmounted", {
        selectedModelId: chatScreenProps.selectedModelId,
      });
    };
  }, [
    diagnosticLogger,
    chatScreenProps.selectedModelDefaultReasoningEffort,
    chatScreenProps.selectedModelId,
    chatScreenProps.selectedReasoningEffort,
  ]);

  const {
    applyPromptTextareaEditToChatScreen,
    submitPromptDraftFromPromptTextarea,
    pasteClipboardImageAttachmentIntoPrompt,
  } = useChatScreenKeyboardInputActions({
    readClipboardImageAttachment: chatScreenProps.readClipboardImageAttachment,
    readLatestChatSessionState: chatAppController.readLatestChatSessionState,
    readIsConversationCompactionInFlight: chatAppController.readIsConversationCompactionInFlight,
    applyChatAppKeyboardInput: chatAppController.applyChatAppKeyboardInput,
    applyPromptDraftEditToChatApp: chatAppController.applyPromptDraftEditToChatApp,
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp:
      chatAppController.removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp:
      chatAppController.removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt: chatAppController.pasteClipboardImageAttachmentIntoChatAppPrompt,
    diagnosticLogger,
  });

  const {
    isPromptInputDisabled,
    availableChatSlashCommands,
    shortModeLabel,
    nextShortModeLabel,
    nextModeAccentColor,
    inputPanelAccentColor,
    promptInputHintOverride,
    reasoningEffortLabel,
    availableCommandHelpModalRowCount,
    totalContextTokensUsed,
    contextWindowTokenCapacity,
    shouldRenderMinimumHeightPromptStrip,
  } = buildChatScreenInteractionViewModel({
    promptState: chatAppController.promptComposerState,
    selectionState: chatAppController.selectionState,
    conversationSessionCompactionStatus: chatAppController.interactionStatusState.conversationSessionCompactionStatus,
    isReasoningSummaryVisible: chatAppController.transcriptState.isReasoningSummaryVisible,
    terminalRowCount,
    terminalColumnCount,
    terminalSizeTierForChatScreen,
  });
  const stableTranscriptViewModel = buildStableChatScreenTranscriptViewModel({
    chatSessionState: chatAppController.transcriptState,
    requestedVisibleConversationMessageCount,
    previousCache: chatScreenTranscriptViewModelCacheRef.current,
  });
  chatScreenTranscriptViewModelCacheRef.current = stableTranscriptViewModel.nextCache;
  const {
    conversationTranscriptWindow,
    orderedConversationMessagePartCount,
  } = stableTranscriptViewModel.transcriptViewModel;
  const revealOlderConversationMessages = useEffectEvent(() => {
    setRequestedVisibleConversationMessageCount((currentVisibleConversationMessageCount) =>
      revealOlderConversationTranscriptMessages({
        currentVisibleConversationMessageCount,
        totalConversationMessageCount: conversationTranscriptWindow.totalConversationMessageCount,
      })
    );
  });
  const approvePendingToolApprovalRequest = useEffectEvent((): void => {
    chatAppController.submitPendingToolApprovalDecision({ decision: "approved", source: "button" });
  });
  const denyPendingToolApprovalRequest = useEffectEvent((): void => {
    chatAppController.submitPendingToolApprovalDecision({ decision: "denied", source: "button" });
  });

  useEffect(() => {
    logChatScreenDiagnosticEvent(
      diagnosticLogger,
      "chat_screen.transcript_render_snapshot",
      buildChatScreenTranscriptRenderDiagnosticFields({
        terminalRowCount,
        terminalColumnCount,
        terminalSizeTierForChatScreen,
        orderedConversationMessageCount: conversationTranscriptWindow.totalConversationMessageCount,
        renderedConversationMessageCount: conversationTranscriptWindow.visibleConversationMessageCount,
        hiddenOlderConversationMessageCount: conversationTranscriptWindow.hiddenOlderConversationMessageCount,
        orderedConversationMessagePartCount,
      }),
    );
  }, [
    diagnosticLogger,
    orderedConversationMessagePartCount,
    conversationTranscriptWindow.totalConversationMessageCount,
    conversationTranscriptWindow.hiddenOlderConversationMessageCount,
    conversationTranscriptWindow.visibleConversationMessageCount,
    terminalColumnCount,
    terminalRowCount,
    terminalSizeTierForChatScreen,
  ]);

  useEffect(() => {
    logChatScreenDiagnosticEvent(
      diagnosticLogger,
      "chat_screen.prompt_render_snapshot",
      buildChatScreenPromptRenderDiagnosticFields({
        conversationTurnStatus: chatAppController.promptComposerState.conversationTurnStatus,
        selectedAssistantOperatingMode: chatAppController.promptComposerState.selectedAssistantOperatingMode,
        selectedModelId: chatAppController.promptComposerState.selectedModelId,
        selectedModelDefaultReasoningEffort: chatAppController.promptComposerState.selectedModelDefaultReasoningEffort,
        selectedReasoningEffort: chatAppController.promptComposerState.selectedReasoningEffort,
        promptDraftLength: chatAppController.promptComposerState.promptDraft.length,
        pendingPromptImageAttachmentCount: chatAppController.promptComposerState.pendingPromptImageAttachments.length,
        selectedPromptContextReferenceCount: chatAppController.promptComposerState.selectedPromptContextReferenceTexts.length,
        queuedPromptCount: chatAppController.promptComposerState.queuedPromptCount,
        totalContextTokensUsed,
        contextWindowTokenCapacity,
      }),
    );
  }, [
    chatAppController.promptComposerState.conversationTurnStatus,
    chatAppController.promptComposerState.pendingPromptImageAttachments.length,
    chatAppController.promptComposerState.promptDraft.length,
    chatAppController.promptComposerState.queuedPromptCount,
    chatAppController.promptComposerState.selectedAssistantOperatingMode,
    chatAppController.promptComposerState.selectedModelId,
    chatAppController.promptComposerState.selectedModelDefaultReasoningEffort,
    chatAppController.promptComposerState.selectedPromptContextReferenceTexts.length,
    chatAppController.promptComposerState.selectedReasoningEffort,
    contextWindowTokenCapacity,
    diagnosticLogger,
    totalContextTokensUsed,
  ]);

  useEffect(() => {
    logChatScreenDiagnosticEvent(
      diagnosticLogger,
      "chat_screen.status_render_snapshot",
      buildChatScreenInteractionStatusDiagnosticFields({
        conversationTurnStatus: chatAppController.interactionStatusState.conversationTurnStatus,
        selectionState: chatAppController.selectionState,
        conversationSessionCompactionStatus: chatAppController.interactionStatusState.conversationSessionCompactionStatus,
        hasPendingToolApprovalRequest: chatAppController.interactionStatusState.pendingToolApprovalRequest !== undefined,
        isReasoningSummaryVisible: chatAppController.transcriptState.isReasoningSummaryVisible,
      }),
    );
  }, [
    chatAppController.interactionStatusState.conversationSessionCompactionStatus,
    chatAppController.interactionStatusState.conversationTurnStatus,
    chatAppController.interactionStatusState.pendingToolApprovalRequest,
    chatAppController.selectionState.conversationSessionSelectionState.step,
    chatAppController.selectionState.isCommandHelpModalVisible,
    chatAppController.selectionState.modelAndReasoningSelectionState.step,
    chatAppController.selectionState.promptContextSelectionState.step,
    chatAppController.selectionState.slashCommandSelectionState.step,
    chatAppController.transcriptState.isReasoningSummaryVisible,
    diagnosticLogger,
  ]);

  const currentMainAreaProps: ChatScreenMainAreaProps = {
    isCommandHelpModalVisible: chatAppController.transcriptState.isCommandHelpModalVisible,
    isReasoningSummaryVisible: chatAppController.transcriptState.isReasoningSummaryVisible,
    inputPanelAccentColor,
    availableCommandHelpModalRowCount,
    terminalSizeTierForChatScreen,
    terminalColumnCount,
    availableChatSlashCommands,
    orderedConversationMessages: conversationTranscriptWindow.visibleConversationMessages,
    conversationMessagePartsById: chatAppController.transcriptState.conversationMessagePartsById,
    hiddenOlderConversationMessageCount: conversationTranscriptWindow.hiddenOlderConversationMessageCount,
    olderConversationMessageRevealCount: conversationTranscriptWindow.olderConversationMessageRevealCount,
    conversationMessageScrollBoxRef,
    onRevealOlderConversationMessages: revealOlderConversationMessages,
    onCommandHelpCloseRequested: chatAppController.hideCommandHelpModalInChatApp,
  };
  const currentStatusStackProps: LiveInteractionStatusStackProps = {
    pendingToolApprovalRequest: chatAppController.interactionStatusState.pendingToolApprovalRequest,
    conversationSessionSelectionState: chatAppController.selectionState.conversationSessionSelectionState,
    modelAndReasoningSelectionState: chatAppController.selectionState.modelAndReasoningSelectionState,
    slashCommandSelectionState: chatAppController.selectionState.slashCommandSelectionState,
    promptContextSelectionState: chatAppController.selectionState.promptContextSelectionState,
    conversationSessionExportStatus: chatAppController.interactionStatusState.conversationSessionExportStatus,
    conversationSessionCompactionStatus: chatAppController.interactionStatusState.conversationSessionCompactionStatus,
    inputPanelAccentColor,
    onPendingToolApprovalApproved: approvePendingToolApprovalRequest,
    onPendingToolApprovalDenied: denyPendingToolApprovalRequest,
    onConversationSessionDeletionRequested: chatAppController.requestConversationSessionDeletion,
  };
  const mainAreaProps = selectStableChatScreenMainAreaProps({
    previousMainAreaProps: stableMainAreaPropsRef.current,
    nextMainAreaProps: currentMainAreaProps,
  });
  const statusStackProps = selectStableLiveInteractionStatusStackProps({
    previousStatusStackProps: stableStatusStackPropsRef.current,
    nextStatusStackProps: currentStatusStackProps,
  });
  const currentPromptComposerProps: PromptComposerChromeProps = {
    conversationTurnStatus: chatAppController.promptComposerState.conversationTurnStatus,
    promptDraft: chatAppController.promptComposerState.promptDraft,
    promptDraftCursorOffset: chatAppController.promptComposerState.promptDraftCursorOffset,
    pendingPromptImageAttachments: chatAppController.promptComposerState.pendingPromptImageAttachments,
    selectedPromptContextReferenceTexts: chatAppController.promptComposerState.selectedPromptContextReferenceTexts,
    selectedModelId: chatAppController.promptComposerState.selectedModelId,
    shouldRenderMinimumHeightPromptStrip,
    isPromptInputDisabled,
    queuedPromptCount: chatAppController.promptComposerState.queuedPromptCount,
    isActiveTurnInterruptConfirmationArmed: chatAppController.promptComposerState.isActiveTurnInterruptConfirmationArmed,
    inputPanelAccentColor,
    promptInputHintOverride,
    shortModeLabel,
    nextShortModeLabel,
    nextModeAccentColor,
    reasoningEffortLabel,
    totalContextTokensUsed,
    contextWindowTokenCapacity,
    onPromptDraftEdited: applyPromptTextareaEditToChatScreen,
    onPromptSubmitted: submitPromptDraftFromPromptTextarea,
    onNativeClipboardPasteRequested: pasteClipboardImageAttachmentIntoPrompt,
  };
  const promptComposerProps = selectStablePromptComposerChromeProps({
    previousPromptComposerProps: stablePromptComposerPropsRef.current,
    nextPromptComposerProps: currentPromptComposerProps,
  });
  const liveInteractionChromeProps = selectStableLiveInteractionChromeProps({
    previousLiveInteractionChromeProps: stableLiveInteractionChromePropsRef.current,
    nextLiveInteractionChromeProps: {
      statusStackProps,
      promptComposerProps,
    },
  });
  stableMainAreaPropsRef.current = mainAreaProps;
  stableStatusStackPropsRef.current = statusStackProps;
  stablePromptComposerPropsRef.current = promptComposerProps;
  stableLiveInteractionChromePropsRef.current = liveInteractionChromeProps;

  return {
    mainAreaProps,
    liveInteractionChromeProps,
  };
}

function selectStableChatScreenMainAreaProps(input: {
  previousMainAreaProps: ChatScreenMainAreaProps | undefined;
  nextMainAreaProps: ChatScreenMainAreaProps;
}): ChatScreenMainAreaProps {
  if (
    input.previousMainAreaProps &&
    input.previousMainAreaProps.isCommandHelpModalVisible === input.nextMainAreaProps.isCommandHelpModalVisible &&
    input.previousMainAreaProps.isReasoningSummaryVisible === input.nextMainAreaProps.isReasoningSummaryVisible &&
    input.previousMainAreaProps.inputPanelAccentColor === input.nextMainAreaProps.inputPanelAccentColor &&
    input.previousMainAreaProps.availableCommandHelpModalRowCount === input.nextMainAreaProps.availableCommandHelpModalRowCount &&
    input.previousMainAreaProps.terminalSizeTierForChatScreen === input.nextMainAreaProps.terminalSizeTierForChatScreen &&
    input.previousMainAreaProps.terminalColumnCount === input.nextMainAreaProps.terminalColumnCount &&
    input.previousMainAreaProps.availableChatSlashCommands === input.nextMainAreaProps.availableChatSlashCommands &&
    input.previousMainAreaProps.orderedConversationMessages === input.nextMainAreaProps.orderedConversationMessages &&
    input.previousMainAreaProps.conversationMessagePartsById === input.nextMainAreaProps.conversationMessagePartsById &&
    input.previousMainAreaProps.hiddenOlderConversationMessageCount === input.nextMainAreaProps.hiddenOlderConversationMessageCount &&
    input.previousMainAreaProps.olderConversationMessageRevealCount === input.nextMainAreaProps.olderConversationMessageRevealCount &&
    input.previousMainAreaProps.conversationMessageScrollBoxRef === input.nextMainAreaProps.conversationMessageScrollBoxRef
  ) {
    return input.previousMainAreaProps;
  }

  return input.nextMainAreaProps;
}

function selectStableLiveInteractionStatusStackProps(input: {
  previousStatusStackProps: LiveInteractionStatusStackProps | undefined;
  nextStatusStackProps: LiveInteractionStatusStackProps;
}): LiveInteractionStatusStackProps {
  if (
    input.previousStatusStackProps &&
    input.previousStatusStackProps.pendingToolApprovalRequest === input.nextStatusStackProps.pendingToolApprovalRequest &&
    input.previousStatusStackProps.conversationSessionSelectionState === input.nextStatusStackProps.conversationSessionSelectionState &&
    input.previousStatusStackProps.modelAndReasoningSelectionState === input.nextStatusStackProps.modelAndReasoningSelectionState &&
    input.previousStatusStackProps.slashCommandSelectionState === input.nextStatusStackProps.slashCommandSelectionState &&
    input.previousStatusStackProps.promptContextSelectionState === input.nextStatusStackProps.promptContextSelectionState &&
    input.previousStatusStackProps.conversationSessionExportStatus === input.nextStatusStackProps.conversationSessionExportStatus &&
    input.previousStatusStackProps.conversationSessionCompactionStatus === input.nextStatusStackProps.conversationSessionCompactionStatus &&
    input.previousStatusStackProps.inputPanelAccentColor === input.nextStatusStackProps.inputPanelAccentColor
  ) {
    return input.previousStatusStackProps;
  }

  return input.nextStatusStackProps;
}

function selectStablePromptComposerChromeProps(input: {
  previousPromptComposerProps: PromptComposerChromeProps | undefined;
  nextPromptComposerProps: PromptComposerChromeProps;
}): PromptComposerChromeProps {
  if (
    input.previousPromptComposerProps &&
    input.previousPromptComposerProps.conversationTurnStatus === input.nextPromptComposerProps.conversationTurnStatus &&
    input.previousPromptComposerProps.promptDraft === input.nextPromptComposerProps.promptDraft &&
    input.previousPromptComposerProps.promptDraftCursorOffset === input.nextPromptComposerProps.promptDraftCursorOffset &&
    input.previousPromptComposerProps.pendingPromptImageAttachments === input.nextPromptComposerProps.pendingPromptImageAttachments &&
    input.previousPromptComposerProps.selectedPromptContextReferenceTexts ===
      input.nextPromptComposerProps.selectedPromptContextReferenceTexts &&
    input.previousPromptComposerProps.selectedModelId === input.nextPromptComposerProps.selectedModelId &&
    input.previousPromptComposerProps.shouldRenderMinimumHeightPromptStrip ===
      input.nextPromptComposerProps.shouldRenderMinimumHeightPromptStrip &&
    input.previousPromptComposerProps.isPromptInputDisabled === input.nextPromptComposerProps.isPromptInputDisabled &&
    input.previousPromptComposerProps.queuedPromptCount === input.nextPromptComposerProps.queuedPromptCount &&
    input.previousPromptComposerProps.isActiveTurnInterruptConfirmationArmed ===
      input.nextPromptComposerProps.isActiveTurnInterruptConfirmationArmed &&
    input.previousPromptComposerProps.inputPanelAccentColor === input.nextPromptComposerProps.inputPanelAccentColor &&
    input.previousPromptComposerProps.promptInputHintOverride === input.nextPromptComposerProps.promptInputHintOverride &&
    input.previousPromptComposerProps.shortModeLabel === input.nextPromptComposerProps.shortModeLabel &&
    input.previousPromptComposerProps.nextShortModeLabel === input.nextPromptComposerProps.nextShortModeLabel &&
    input.previousPromptComposerProps.nextModeAccentColor === input.nextPromptComposerProps.nextModeAccentColor &&
    input.previousPromptComposerProps.reasoningEffortLabel === input.nextPromptComposerProps.reasoningEffortLabel &&
    input.previousPromptComposerProps.totalContextTokensUsed === input.nextPromptComposerProps.totalContextTokensUsed &&
    input.previousPromptComposerProps.contextWindowTokenCapacity === input.nextPromptComposerProps.contextWindowTokenCapacity &&
    input.previousPromptComposerProps.onPromptDraftEdited === input.nextPromptComposerProps.onPromptDraftEdited &&
    input.previousPromptComposerProps.onPromptSubmitted === input.nextPromptComposerProps.onPromptSubmitted &&
    input.previousPromptComposerProps.onNativeClipboardPasteRequested === input.nextPromptComposerProps.onNativeClipboardPasteRequested
  ) {
    return input.previousPromptComposerProps;
  }

  return input.nextPromptComposerProps;
}

function selectStableLiveInteractionChromeProps(input: {
  previousLiveInteractionChromeProps: LiveInteractionChromeProps | undefined;
  nextLiveInteractionChromeProps: LiveInteractionChromeProps;
}): LiveInteractionChromeProps {
  if (
    input.previousLiveInteractionChromeProps &&
    input.previousLiveInteractionChromeProps.statusStackProps === input.nextLiveInteractionChromeProps.statusStackProps &&
    input.previousLiveInteractionChromeProps.promptComposerProps === input.nextLiveInteractionChromeProps.promptComposerProps
  ) {
    return input.previousLiveInteractionChromeProps;
  }

  return input.nextLiveInteractionChromeProps;
}
