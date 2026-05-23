import type { TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import { useChatAppController } from "@buli/chat-app-controller";
import { listOrderedConversationMessageParts } from "@buli/chat-session-state";
import { useEffect, useEffectEvent, useState } from "react";
import type { ChatScreenProps } from "../ChatScreen.tsx";
import type { ChatScreenLayoutProps } from "../components/ChatScreenLayout.tsx";
import { buildChatScreenRenderSnapshotDiagnosticFields } from "./chatScreenRenderSnapshotDiagnostics.ts";
import { buildChatScreenViewModel } from "./chatScreenViewModel.ts";
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
    conversationTranscriptWindow,
    orderedConversationMessagePartCount,
    shouldRenderMinimumHeightPromptStrip,
  } = buildChatScreenViewModel({
    chatSessionState: chatAppController.chatSessionState,
    conversationSessionCompactionStatus: chatAppController.conversationSessionCompactionStatus,
    terminalRowCount,
    terminalColumnCount,
    terminalSizeTierForChatScreen,
    requestedVisibleConversationMessageCount,
  });
  const revealOlderConversationMessages = useEffectEvent(() => {
    setRequestedVisibleConversationMessageCount((currentVisibleConversationMessageCount) =>
      revealOlderConversationTranscriptMessages({
        currentVisibleConversationMessageCount,
        totalConversationMessageCount: conversationTranscriptWindow.totalConversationMessageCount,
      })
    );
  });

  useEffect(() => {
    logChatScreenDiagnosticEvent(
      diagnosticLogger,
      "chat_screen.render_snapshot",
      buildChatScreenRenderSnapshotDiagnosticFields({
        chatSessionState: chatAppController.chatSessionState,
        conversationSessionCompactionStatus: chatAppController.conversationSessionCompactionStatus,
        terminalRowCount,
        terminalColumnCount,
        terminalSizeTierForChatScreen,
        orderedConversationMessageCount: conversationTranscriptWindow.totalConversationMessageCount,
        renderedConversationMessageCount: conversationTranscriptWindow.visibleConversationMessageCount,
        hiddenOlderConversationMessageCount: conversationTranscriptWindow.hiddenOlderConversationMessageCount,
        orderedConversationMessagePartCount,
        totalContextTokensUsed,
        contextWindowTokenCapacity,
      }),
    );
  }, [
    chatAppController.chatSessionState.conversationTurnStatus,
    chatAppController.chatSessionState.conversationSessionSelectionState.step,
    chatAppController.chatSessionState.isCommandHelpModalVisible,
    chatAppController.chatSessionState.modelAndReasoningSelectionState.step,
    chatAppController.chatSessionState.pendingToolApprovalRequest,
    chatAppController.chatSessionState.pendingPromptImageAttachments.length,
    chatAppController.chatSessionState.promptContextSelectionState.step,
    chatAppController.chatSessionState.promptDraft.length,
    chatAppController.chatSessionState.isReasoningSummaryVisible,
    chatAppController.chatSessionState.selectedAssistantOperatingMode,
    chatAppController.chatSessionState.selectedModelId,
    chatAppController.chatSessionState.selectedModelDefaultReasoningEffort,
    chatAppController.chatSessionState.selectedPromptContextReferenceTexts.length,
    chatAppController.chatSessionState.selectedReasoningEffort,
    chatAppController.chatSessionState.slashCommandSelectionState.step,
    contextWindowTokenCapacity,
    chatAppController.conversationSessionCompactionStatus,
    diagnosticLogger,
    orderedConversationMessagePartCount,
    conversationTranscriptWindow.totalConversationMessageCount,
    conversationTranscriptWindow.hiddenOlderConversationMessageCount,
    conversationTranscriptWindow.visibleConversationMessageCount,
    terminalColumnCount,
    terminalRowCount,
    terminalSizeTierForChatScreen,
    totalContextTokensUsed,
  ]);

  return {
    mainAreaProps: {
      chatSessionState: chatAppController.chatSessionState,
      inputPanelAccentColor,
      availableCommandHelpModalRowCount,
      terminalSizeTierForChatScreen,
      terminalColumnCount,
      availableChatSlashCommands,
      orderedConversationMessages: conversationTranscriptWindow.visibleConversationMessages,
      hiddenOlderConversationMessageCount: conversationTranscriptWindow.hiddenOlderConversationMessageCount,
      olderConversationMessageRevealCount: conversationTranscriptWindow.olderConversationMessageRevealCount,
      conversationMessageScrollBoxRef,
      resolveConversationMessageParts: (messageId) => listOrderedConversationMessageParts(chatAppController.chatSessionState, messageId),
      onRevealOlderConversationMessages: revealOlderConversationMessages,
      onCommandHelpCloseRequested: chatAppController.hideCommandHelpModalInChatApp,
    },
    liveInteractionChromeProps: {
      statusStackProps: {
        chatSessionState: chatAppController.chatSessionState,
        conversationSessionExportStatus: chatAppController.conversationSessionExportStatus,
        conversationSessionCompactionStatus: chatAppController.conversationSessionCompactionStatus,
        inputPanelAccentColor,
        onPendingToolApprovalApproved: () => {
          chatAppController.submitPendingToolApprovalDecision({ decision: "approved", source: "button" });
        },
        onPendingToolApprovalDenied: () => {
          chatAppController.submitPendingToolApprovalDecision({ decision: "denied", source: "button" });
        },
        onConversationSessionDeletionRequested: chatAppController.requestConversationSessionDeletion,
      },
      promptComposerProps: {
        chatSessionState: chatAppController.chatSessionState,
        shouldRenderMinimumHeightPromptStrip,
        isPromptInputDisabled,
        isActiveTurnInterruptConfirmationArmed: chatAppController.isActiveTurnInterruptConfirmationArmed,
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
      },
    },
  };
}
