import type { TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import { useChatAppController } from "@buli/chat-app-controller";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ChatScreenProps } from "../ChatScreen.tsx";
import type { ChatScreenMainAreaProps } from "../components/ChatScreenMainArea.tsx";
import type { ChatScreenLayoutProps } from "../components/ChatScreenLayout.tsx";
import type {
  LiveInteractionChromeProps,
  LiveInteractionChromeStatusExtraProps,
} from "../components/LiveInteractionChrome.tsx";
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
  const stableLiveStatusExtraPropsRef = useRef<LiveInteractionChromeStatusExtraProps | undefined>(undefined);
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
    availableSkills: chatScreenProps.availableSkills,
    initialConversationSessionId: chatScreenProps.initialConversationSessionId,
    initialConversationSessionEntries: chatScreenProps.initialConversationSessionEntries,
    loadInitialConversationSessionEntries: chatScreenProps.loadInitialConversationSessionEntries,
    onInitialConversationSessionEntriesHydrated: chatScreenProps.onInitialConversationSessionEntriesHydrated,
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
    diagnosticLogger,
    scrollConversationMessagesToBottom,
    scrollConversationMessagesByPage,
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
    readConversationSessionCompactionStatus: chatAppController.readConversationSessionCompactionStatus,
    applyChatAppKeyboardInput: chatAppController.applyChatAppKeyboardInput,
    applyPromptDraftEditToChatApp: chatAppController.applyPromptDraftEditToChatApp,
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp:
      chatAppController.removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp:
      chatAppController.removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt: chatAppController.pasteClipboardImageAttachmentIntoChatAppPrompt,
    diagnosticLogger,
  });

  const interactionViewModelBuildStartedAtMs = Date.now();
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
    contextMeterTokenLimit,
    shouldRenderMinimumHeightPromptStrip,
  } = buildChatScreenInteractionViewModel({
    promptState: chatAppController.promptComposerState,
    selectionState: chatAppController.selectionState,
    conversationSessionCompactionStatus: chatAppController.interactionStatusState.conversationSessionCompactionStatus,
    reasoningSummaryDisplayMode: chatAppController.transcriptState.reasoningSummaryDisplayMode,
    availableSkills: chatScreenProps.availableSkills,
    terminalRowCount,
    terminalColumnCount,
    terminalSizeTierForChatScreen,
  });
  const interactionViewModelBuildDurationMs = Date.now() - interactionViewModelBuildStartedAtMs;
  const transcriptViewModelBuildStartedAtMs = Date.now();
  const stableTranscriptViewModel = buildStableChatScreenTranscriptViewModel({
    chatSessionState: chatAppController.transcriptState,
    requestedVisibleConversationMessageCount,
    previousCache: chatScreenTranscriptViewModelCacheRef.current,
  });
  const transcriptViewModelBuildDurationMs = Date.now() - transcriptViewModelBuildStartedAtMs;
  chatScreenTranscriptViewModelCacheRef.current = stableTranscriptViewModel.nextCache;
  const {
    conversationTranscriptWindow,
    orderedConversationMessagePartCount,
    visibleConversationMessageIds,
    visibleConversationMessagePartCount,
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
        renderedConversationMessagePartCount: visibleConversationMessagePartCount,
        interactionViewModelBuildDurationMs,
        transcriptViewModelBuildDurationMs,
      }),
    );
  }, [
    diagnosticLogger,
    orderedConversationMessagePartCount,
    conversationTranscriptWindow.totalConversationMessageCount,
    conversationTranscriptWindow.hiddenOlderConversationMessageCount,
    conversationTranscriptWindow.visibleConversationMessageCount,
    visibleConversationMessagePartCount,
    interactionViewModelBuildDurationMs,
    transcriptViewModelBuildDurationMs,
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
    contextMeterTokenLimit,
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
        reasoningSummaryDisplayMode: chatAppController.transcriptState.reasoningSummaryDisplayMode,
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
    chatAppController.transcriptState.reasoningSummaryDisplayMode,
    diagnosticLogger,
  ]);

  const pendingToolApprovalDecisionCallbacks = {
    onPendingToolApprovalApproved: approvePendingToolApprovalRequest,
    onPendingToolApprovalDenied: denyPendingToolApprovalRequest,
  };

  const currentMainAreaProps: ChatScreenMainAreaProps = {
    isCommandHelpModalVisible: chatAppController.transcriptState.isCommandHelpModalVisible,
    reasoningSummaryDisplayMode: chatAppController.transcriptState.reasoningSummaryDisplayMode,
    inputPanelAccentColor,
    availableCommandHelpModalRowCount,
    terminalSizeTierForChatScreen,
    availableChatSlashCommands,
    chatAppRenderStore: chatAppController.chatAppRenderStore,
    visibleConversationMessageIds,
    hiddenOlderConversationMessageCount: conversationTranscriptWindow.hiddenOlderConversationMessageCount,
    olderConversationMessageRevealCount: conversationTranscriptWindow.olderConversationMessageRevealCount,
    pendingToolApprovalDecisionCallbacks,
    conversationMessageScrollBoxRef,
    onRevealOlderConversationMessages: revealOlderConversationMessages,
    onCommandHelpCloseRequested: chatAppController.hideCommandHelpModalInChatApp,
  };
  const currentStatusStackProps: LiveInteractionStatusStackProps = {
    chatAppRenderStore: chatAppController.chatAppRenderStore,
    shouldHideQueuedPromptPreviews: shouldRenderMinimumHeightPromptStrip,
    inputPanelAccentColor,
    onConversationSessionDeletionRequested: chatAppController.requestConversationSessionDeletion,
  };
  const currentLiveStatusExtraProps: LiveInteractionChromeStatusExtraProps = {
    chatAppRenderStore: chatAppController.chatAppRenderStore,
  };
  const mainAreaProps = selectShallowStableObject({
    previousValue: stableMainAreaPropsRef.current,
    nextValue: currentMainAreaProps,
    equalityByProperty: {
      pendingToolApprovalDecisionCallbacks: () => true,
      onRevealOlderConversationMessages: () => true,
      onCommandHelpCloseRequested: () => true,
    },
  });
  const statusStackProps = selectShallowStableObject({
    previousValue: stableStatusStackPropsRef.current,
    nextValue: currentStatusStackProps,
    equalityByProperty: {
      onConversationSessionDeletionRequested: () => true,
    },
  });
  const liveStatusExtraProps = selectShallowStableObject({
    previousValue: stableLiveStatusExtraPropsRef.current,
    nextValue: currentLiveStatusExtraProps,
  });
  const currentPromptComposerProps: PromptComposerChromeProps = {
    chatAppRenderStore: chatAppController.chatAppRenderStore,
    conversationSessionCompactionStatus: chatAppController.interactionStatusState.conversationSessionCompactionStatus,
    shouldRenderMinimumHeightPromptStrip,
    isPromptInputDisabled,
    queuedPromptCount: shouldRenderMinimumHeightPromptStrip ? 0 : chatAppController.promptComposerState.queuedPromptCount,
    isActiveTurnInterruptConfirmationArmed: chatAppController.promptComposerState.isActiveTurnInterruptConfirmationArmed,
    inputPanelAccentColor,
    promptInputHintOverride,
    shortModeLabel,
    nextShortModeLabel,
    nextModeAccentColor,
    reasoningEffortLabel,
    totalContextTokensUsed,
    contextMeterTokenLimit,
    onPromptDraftEdited: applyPromptTextareaEditToChatScreen,
    onPromptSubmitted: submitPromptDraftFromPromptTextarea,
    onNativeClipboardPasteRequested: pasteClipboardImageAttachmentIntoPrompt,
    onSummarizedPromptTextPasted: chatAppController.insertSummarizedPastedTextIntoChatAppPrompt,
  };
  const promptComposerProps = selectShallowStableObject({
    previousValue: stablePromptComposerPropsRef.current,
    nextValue: currentPromptComposerProps,
    equalityByProperty: {
      onPromptDraftEdited: () => true,
      onPromptSubmitted: () => true,
      onNativeClipboardPasteRequested: () => true,
      onSummarizedPromptTextPasted: () => true,
    },
  });
  const liveInteractionChromeProps = selectShallowStableObject({
    previousValue: stableLiveInteractionChromePropsRef.current,
    nextValue: {
      statusStackProps,
      liveStatusExtraProps,
      promptComposerProps,
    },
  });
  stableMainAreaPropsRef.current = mainAreaProps;
  stableStatusStackPropsRef.current = statusStackProps;
  stableLiveStatusExtraPropsRef.current = liveStatusExtraProps;
  stablePromptComposerPropsRef.current = promptComposerProps;
  stableLiveInteractionChromePropsRef.current = liveInteractionChromeProps;

  return {
    mainAreaProps,
    liveInteractionChromeProps,
  };
}

type ShallowStablePropertyEquality<T extends object> = {
  readonly [Property in keyof T]?: (previousProperty: T[Property], nextProperty: T[Property]) => boolean;
};

function selectShallowStableObject<T extends object>(input: {
  previousValue: T | undefined;
  nextValue: T;
  equalityByProperty?: ShallowStablePropertyEquality<T> | undefined;
}): T {
  if (!input.previousValue) {
    return input.nextValue;
  }

  const nextPropertyKeys = Object.keys(input.nextValue) as (keyof T)[];
  const previousPropertyKeys = Object.keys(input.previousValue) as (keyof T)[];
  if (previousPropertyKeys.length !== nextPropertyKeys.length) {
    return input.nextValue;
  }

  for (const propertyKey of nextPropertyKeys) {
    if (!(propertyKey in input.previousValue)) {
      return input.nextValue;
    }

    const arePropertiesEqual = input.equalityByProperty?.[propertyKey];
    const isPropertyStable = arePropertiesEqual
      ? arePropertiesEqual(input.previousValue[propertyKey], input.nextValue[propertyKey])
      : Object.is(input.previousValue[propertyKey], input.nextValue[propertyKey]);
    if (!isPropertyStable) {
      return input.nextValue;
    }
  }

  return input.previousValue;
}
