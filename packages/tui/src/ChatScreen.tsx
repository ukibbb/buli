import os from "node:os";
import type {
  AvailableAssistantModel,
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
  createInitialChatSessionState,
  hideCommandHelpModal,
  listOrderedConversationMessageParts,
  hydrateConversationTranscriptFromSessionEntries,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { useTerminalDimensions } from "@opentui/react";
import { type ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme, classifyTerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import { ChatScreenInputArea } from "./components/ChatScreenInputArea.tsx";
import { ChatScreenMainArea } from "./components/ChatScreenMainArea.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { buildChatScreenViewModel } from "./behavior/chatScreenViewModel.ts";
import { buildChatScreenRenderSnapshotDiagnosticFields } from "./behavior/chatScreenRenderSnapshotDiagnostics.ts";
import { formatChatScreenWorkingDirectoryPath } from "./behavior/chatScreenWorkingDirectoryLabel.ts";
import {
  buildConversationTranscriptWindow,
  DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT,
  revealOlderConversationTranscriptMessages,
} from "./behavior/conversationTranscriptWindow.ts";
import { useChatScreenActiveTurnInterrupt } from "./behavior/useChatScreenActiveTurnInterrupt.ts";
import type { ConversationSessionCompactionStatus, ConversationSessionExportStatus } from "./behavior/chatScreenConversationSessionStatus.ts";
import { useChatScreenAssistantTurnActions } from "./behavior/useChatScreenAssistantTurnActions.ts";
import {
  useChatScreenConversationSessionActions,
  type ConversationSessionCompactionResult,
  type ConversationSessionDeleteResult,
  type ConversationSessionExportResult,
  type ConversationSessionSwitchResult,
} from "./behavior/useChatScreenConversationSessionActions.ts";
import { useChatScreenKeyboardInputActions } from "./behavior/useChatScreenKeyboardInputActions.ts";
import { useChatScreenPromptContextSelectionRefresh } from "./behavior/useChatScreenPromptContextSelectionRefresh.ts";
import type { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";
import { logTuiDiagnosticEvent as logChatScreenDiagnosticEvent } from "./diagnostics/logTuiDiagnosticEvent.ts";

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
  deleteConversationSession?: (conversationSessionId: string) => Promise<ConversationSessionDeleteResult> | ConversationSessionDeleteResult;
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
  ConversationSessionDeleteResult,
  ConversationSessionExportResult,
  ConversationSessionSwitchResult,
} from "./behavior/useChatScreenConversationSessionActions.ts";

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
  const [requestedVisibleConversationMessageCount, setRequestedVisibleConversationMessageCount] = useState(
    DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT,
  );

  latestChatSessionStateRef.current = chatSessionState;
  latestActiveConversationSessionIdRef.current = activeConversationSessionId;

  useEffect(() => {
    setRequestedVisibleConversationMessageCount(DEFAULT_VISIBLE_CONVERSATION_MESSAGE_COUNT);
  }, [activeConversationSessionId]);

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
    requestConversationSessionDeletion,
    exportCurrentConversationSession,
    compactCurrentConversationSession,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    clearCurrentConversationSession,
  } = useChatScreenConversationSessionActions({
    loadConversationSessions: props.loadConversationSessions,
    switchConversationSession: props.switchConversationSession,
    deleteConversationSession: props.deleteConversationSession,
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

  const {
    applyPromptTextareaEditToChatScreen,
    submitPromptDraftFromPromptTextarea,
    pasteClipboardImageAttachmentIntoPrompt,
  } = useChatScreenKeyboardInputActions({
    chatSessionState,
    loadAvailableAssistantModels: props.loadAvailableAssistantModels,
    readClipboardImageAttachment: props.readClipboardImageAttachment,
    latestChatSessionStateRef,
    isPromptSubmissionInFlightRef,
    isConversationCompactionInFlightRef,
    setChatSessionState,
    requestActiveConversationTurnInterrupt,
    dismissActivePromptContextQuery,
    loadConversationSessionsForSelection,
    switchToConversationSession,
    requestConversationSessionDeletion,
    exportCurrentConversationSession,
    compactCurrentConversationSession,
    clearCurrentConversationSession,
    streamAssistantResponseForSubmittedPrompt,
    submitPendingToolApprovalDecision,
    scrollConversationMessagesToBottom,
    scrollConversationMessagesByPage,
    diagnosticLogger,
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
    conversationSessionCompactionStatus,
    terminalRowCount: rows,
    terminalColumnCount: columns,
    terminalSizeTierForChatScreen,
  });
  const conversationTranscriptWindow = buildConversationTranscriptWindow({
    conversationMessages: orderedConversationMessages,
    requestedVisibleConversationMessageCount,
  });
  const revealOlderConversationMessages = useEffectEvent(() => {
    setRequestedVisibleConversationMessageCount((currentVisibleConversationMessageCount) =>
      revealOlderConversationTranscriptMessages({
        currentVisibleConversationMessageCount,
        totalConversationMessageCount: orderedConversationMessages.length,
      })
    );
  });

  useEffect(() => {
    logChatScreenDiagnosticEvent(
      diagnosticLogger,
      "chat_screen.render_snapshot",
      buildChatScreenRenderSnapshotDiagnosticFields({
        chatSessionState,
        conversationSessionCompactionStatus,
        terminalRowCount: rows,
        terminalColumnCount: columns,
        terminalSizeTierForChatScreen,
        orderedConversationMessageCount: orderedConversationMessages.length,
        renderedConversationMessageCount: conversationTranscriptWindow.visibleConversationMessageCount,
        hiddenOlderConversationMessageCount: conversationTranscriptWindow.hiddenOlderConversationMessageCount,
        orderedConversationMessagePartCount,
        totalContextTokensUsed,
        contextWindowTokenCapacity,
      }),
    );
  }, [
    chatSessionState.conversationTurnStatus,
    chatSessionState.conversationSessionSelectionState.step,
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
    conversationSessionCompactionStatus,
    columns,
    diagnosticLogger,
    orderedConversationMessagePartCount,
    orderedConversationMessages.length,
    conversationTranscriptWindow.hiddenOlderConversationMessageCount,
    conversationTranscriptWindow.visibleConversationMessageCount,
    rows,
    terminalSizeTierForChatScreen,
    totalContextTokensUsed,
  ]);

  return (
    <box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={rows} width={columns}>
      <TopBar workingDirectoryPath={workingDirectoryPath} accentColor={inputPanelAccentColor} />
      <box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={2} paddingTop={1}>
        <ChatScreenMainArea
          chatSessionState={chatSessionState}
          inputPanelAccentColor={inputPanelAccentColor}
          availableCommandHelpModalRowCount={availableCommandHelpModalRowCount}
          terminalSizeTierForChatScreen={terminalSizeTierForChatScreen}
          terminalColumnCount={columns}
          availableChatSlashCommands={availableChatSlashCommands}
          orderedConversationMessages={conversationTranscriptWindow.visibleConversationMessages}
          hiddenOlderConversationMessageCount={conversationTranscriptWindow.hiddenOlderConversationMessageCount}
          olderConversationMessageRevealCount={conversationTranscriptWindow.olderConversationMessageRevealCount}
          conversationMessageScrollBoxRef={conversationMessageScrollBoxRef}
          resolveConversationMessageParts={(messageId) => listOrderedConversationMessageParts(chatSessionState, messageId)}
          onRevealOlderConversationMessages={revealOlderConversationMessages}
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
        onConversationSessionDeletionRequested={requestConversationSessionDeletion}
      />
    </box>
  );
}
