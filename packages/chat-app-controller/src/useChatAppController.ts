import type {
  AvailableAssistantModel,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
  ReasoningEffort,
} from "@buli/contracts";
import type {
  ConversationAutoCompactionRequest,
  ConversationAutoCompactionResult,
  ConversationCompactionRequest,
  AssistantConversationRunner,
} from "@buli/engine";
import type { PromptContextCandidate } from "@buli/prompt-context-core";
import {
  createInitialChatSessionState,
  hideCommandHelpModal,
  hydrateConversationTranscriptFromSessionEntries,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { useEffectEvent, useRef, useState } from "react";
import type { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";
import type { ConversationSessionCompactionStatus, ConversationSessionExportStatus } from "./conversationSessionStatus.ts";
import {
  useChatAppAssistantTurnActions,
  type QueuedChatAppPrompt,
  type PendingToolApprovalDecisionSubmission,
} from "./useChatAppAssistantTurnActions.ts";
import {
  useChatAppConversationSessionActions,
  type ConversationSessionCompactionResult,
  type ConversationSessionDeleteResult,
  type ConversationSessionExportResult,
  type ConversationSessionSwitchResult,
} from "./useChatAppConversationSessionActions.ts";
import { useChatAppActiveTurnInterrupt } from "./useChatAppActiveTurnInterrupt.ts";
import {
  useChatAppKeyboardActions,
  type UseChatAppKeyboardActionsResult,
} from "./useChatAppKeyboardActions.ts";
import { useChatAppPromptContextSelectionRefresh } from "./useChatAppPromptContextSelectionRefresh.ts";
import {
  useChatAppPromptImageAttachmentActions,
  type UseChatAppPromptImageAttachmentActionsResult,
} from "./useChatAppPromptImageAttachmentActions.ts";

export type ChatAppConversationTranscriptScrollDirection = "up" | "down";

export type UseChatAppControllerInput = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort | undefined;
  selectedReasoningEffort?: ReasoningEffort | undefined;
  initialConversationSessionId?: string | undefined;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[] | undefined;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  loadConversationSessions?: (() => Promise<readonly ConversationSessionSummary[]> | readonly ConversationSessionSummary[]) | undefined;
  switchConversationSession?:
    | ((conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult)
    | undefined;
  deleteConversationSession?:
    | ((conversationSessionId: string) => Promise<ConversationSessionDeleteResult> | ConversationSessionDeleteResult)
    | undefined;
  exportCurrentConversationSession?: (() => Promise<ConversationSessionExportResult> | ConversationSessionExportResult) | undefined;
  compactCurrentConversationSession?:
    | ((input: ConversationCompactionRequest) => Promise<ConversationSessionCompactionResult> | ConversationSessionCompactionResult)
    | undefined;
  autoCompactCurrentConversationSession?:
    | ((input: ConversationAutoCompactionRequest) => Promise<ConversationAutoCompactionResult> | ConversationAutoCompactionResult)
    | undefined;
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: (() => ConversationSessionSwitchResult | void) | undefined;
  onConversationSessionModelSelectionChanged?:
    | ((modelSelection: ConversationSessionModelSelection) => void | Promise<void>)
    | undefined;
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator | undefined;
  scrollConversationMessagesToBottom: () => void;
  scrollConversationMessagesByPage: (direction: ChatAppConversationTranscriptScrollDirection) => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type UseChatAppControllerResult = {
  activeConversationSessionId: string | undefined;
  chatSessionState: ChatSessionState;
  transcriptState: ChatAppTranscriptState;
  promptComposerState: ChatAppPromptComposerState;
  interactionStatusState: ChatAppInteractionStatusState;
  selectionState: ChatAppSelectionState;
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
  isActiveTurnInterruptConfirmationArmed: boolean;
  applyChatAppKeyboardInput: UseChatAppKeyboardActionsResult["applyChatAppKeyboardInput"];
  applyPromptDraftEditToChatApp: UseChatAppKeyboardActionsResult["applyPromptDraftEditToChatApp"];
  removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp:
    UseChatAppPromptImageAttachmentActionsResult["removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp"];
  removePromptImageAttachmentPlaceholderAtCursorFromChatApp:
    UseChatAppPromptImageAttachmentActionsResult["removePromptImageAttachmentPlaceholderAtCursorFromChatApp"];
  pasteClipboardImageAttachmentIntoChatAppPrompt:
    UseChatAppPromptImageAttachmentActionsResult["pasteClipboardImageAttachmentIntoChatAppPrompt"];
  submitPendingToolApprovalDecision: (submission: PendingToolApprovalDecisionSubmission) => void;
  requestConversationSessionDeletion: (conversationSessionId: string) => Promise<void>;
  hideCommandHelpModalInChatApp: () => void;
  readLatestChatSessionState: () => ChatSessionState;
  readIsConversationCompactionInFlight: () => boolean;
};

export type ChatAppTranscriptState = Pick<
  ChatSessionState,
  | "conversationMessagesById"
  | "conversationMessagePartsById"
  | "orderedConversationMessageIds"
  | "conversationMessagePartCount"
  | "isReasoningSummaryVisible"
  | "isCommandHelpModalVisible"
>;

export type ChatAppPromptComposerState = Pick<
  ChatSessionState,
  | "conversationTurnStatus"
  | "promptDraft"
  | "promptDraftCursorOffset"
  | "pendingPromptImageAttachments"
  | "selectedPromptContextReferenceTexts"
  | "selectedAssistantOperatingMode"
  | "selectedModelId"
  | "selectedModelDefaultReasoningEffort"
  | "selectedReasoningEffort"
  | "latestContextWindowUsage"
> & {
  queuedPromptCount: number;
  isActiveTurnInterruptConfirmationArmed: boolean;
};

export type ChatAppInteractionStatusState = Pick<ChatSessionState, "conversationTurnStatus" | "pendingToolApprovalRequest"> & {
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
};

export type ChatAppSelectionState = Pick<
  ChatSessionState,
  | "conversationSessionSelectionState"
  | "modelAndReasoningSelectionState"
  | "slashCommandSelectionState"
  | "promptContextSelectionState"
  | "isCommandHelpModalVisible"
>;

export function useChatAppController(input: UseChatAppControllerInput): UseChatAppControllerResult {
  const [activeConversationSessionId, setActiveConversationSessionId] = useState<string | undefined>(
    input.initialConversationSessionId,
  );
  const [conversationSessionExportStatus, setConversationSessionExportStatus] = useState<ConversationSessionExportStatus>({
    step: "idle",
  });
  const [conversationSessionCompactionStatus, setConversationSessionCompactionStatus] = useState<ConversationSessionCompactionStatus>({
    step: "idle",
  });
  const [queuedPromptCount, setQueuedPromptCount] = useState(0);
  const [chatSessionState, setChatSessionState] = useState(() => {
    const initialChatSessionState = createInitialChatSessionState({
      selectedModelId: input.selectedModelId,
      ...(input.selectedModelDefaultReasoningEffort
        ? { selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort }
        : {}),
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    });
    return input.initialConversationSessionEntries
      ? hydrateConversationTranscriptFromSessionEntries(initialChatSessionState, input.initialConversationSessionEntries)
      : initialChatSessionState;
  });

  const latestChatSessionStateRef = useRef<ChatSessionState>(chatSessionState);
  const latestActiveConversationSessionIdRef = useRef<string | undefined>(activeConversationSessionId);
  const isPromptSubmissionInFlightRef = useRef(false);
  const isConversationCompactionInFlightRef = useRef(false);
  const submittedToolApprovalDecisionApprovalIdRef = useRef<string | undefined>(undefined);
  const queuedChatAppPromptsRef = useRef<QueuedChatAppPrompt[]>([]);
  const stableTranscriptStateRef = useRef<ChatAppTranscriptState | undefined>(undefined);
  const stablePromptComposerStateRef = useRef<ChatAppPromptComposerState | undefined>(undefined);
  const stableInteractionStatusStateRef = useRef<ChatAppInteractionStatusState | undefined>(undefined);
  const stableSelectionStateRef = useRef<ChatAppSelectionState | undefined>(undefined);

  latestChatSessionStateRef.current = chatSessionState;
  latestActiveConversationSessionIdRef.current = activeConversationSessionId;

  const {
    isActiveTurnInterruptConfirmationArmed,
    getActiveConversationTurn,
    registerActiveConversationTurnStarted,
    registerActiveConversationTurnFinished,
    registerActiveConversationTurnSettlement,
    requestActiveConversationTurnInterrupt,
  } = useChatAppActiveTurnInterrupt({
    activeConversationTurnShutdownCoordinator: input.activeConversationTurnShutdownCoordinator,
    diagnosticLogger: input.diagnosticLogger,
  });
  const { dismissActivePromptContextQuery } = useChatAppPromptContextSelectionRefresh({
    chatSessionState,
    setChatSessionState,
    loadPromptContextCandidates: input.loadPromptContextCandidates,
    diagnosticLogger: input.diagnosticLogger,
  });
  const enqueueQueuedSubmittedPrompt = useEffectEvent((queuedChatAppPrompt: QueuedChatAppPrompt): number => {
    const nextQueuedChatAppPrompts = [...queuedChatAppPromptsRef.current, queuedChatAppPrompt];
    queuedChatAppPromptsRef.current = nextQueuedChatAppPrompts;
    setQueuedPromptCount(nextQueuedChatAppPrompts.length);
    return nextQueuedChatAppPrompts.length;
  });
  const dequeueQueuedSubmittedPrompt = useEffectEvent((): QueuedChatAppPrompt | undefined => {
    const [nextQueuedChatAppPrompt, ...remainingQueuedChatAppPrompts] = queuedChatAppPromptsRef.current;
    if (!nextQueuedChatAppPrompt) {
      return undefined;
    }

    queuedChatAppPromptsRef.current = remainingQueuedChatAppPrompts;
    setQueuedPromptCount(remainingQueuedChatAppPrompts.length);
    return nextQueuedChatAppPrompt;
  });
  const {
    loadConversationSessionsForSelection,
    switchToConversationSession,
    requestConversationSessionDeletion,
    exportCurrentConversationSession,
    compactCurrentConversationSession,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    clearCurrentConversationSession,
  } = useChatAppConversationSessionActions({
    loadConversationSessions: input.loadConversationSessions,
    switchConversationSession: input.switchConversationSession,
    deleteConversationSession: input.deleteConversationSession,
    exportCurrentConversationSession: input.exportCurrentConversationSession,
    compactCurrentConversationSession: input.compactCurrentConversationSession,
    autoCompactCurrentConversationSession: input.autoCompactCurrentConversationSession,
    onConversationCleared: input.onConversationCleared,
    latestChatSessionStateRef,
    latestActiveConversationSessionIdRef,
    isPromptSubmissionInFlightRef,
    isConversationCompactionInFlightRef,
    setChatSessionState,
    setActiveConversationSessionId,
    setConversationSessionExportStatus,
    setConversationSessionCompactionStatus,
    diagnosticLogger: input.diagnosticLogger,
  });
  const {
    streamAssistantResponseForSubmittedPrompt,
    submitPendingToolApprovalDecision,
  } = useChatAppAssistantTurnActions({
    chatSessionState,
    assistantConversationRunner: input.assistantConversationRunner,
    latestChatSessionStateRef,
    isPromptSubmissionInFlightRef,
    submittedToolApprovalDecisionApprovalIdRef,
    setChatSessionState,
    getActiveConversationTurn,
    registerActiveConversationTurnStarted,
    registerActiveConversationTurnFinished,
    registerActiveConversationTurnSettlement,
    dequeueQueuedSubmittedPrompt,
    scrollConversationMessagesToBottom: input.scrollConversationMessagesToBottom,
    autoCompactCurrentConversationSessionAfterAssistantTurn,
    diagnosticLogger: input.diagnosticLogger,
  });
  const {
    applyChatAppKeyboardInput,
    applyPromptDraftEditToChatApp,
  } = useChatAppKeyboardActions({
    chatSessionState,
    loadAvailableAssistantModels: input.loadAvailableAssistantModels,
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
    onConversationSessionModelSelectionChanged: input.onConversationSessionModelSelectionChanged,
    streamAssistantResponseForSubmittedPrompt,
    enqueueQueuedSubmittedPrompt,
    submitPendingToolApprovalDecision,
    scrollConversationMessagesToBottom: input.scrollConversationMessagesToBottom,
    scrollConversationMessagesByPage: input.scrollConversationMessagesByPage,
    diagnosticLogger: input.diagnosticLogger,
  });
  const {
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt,
  } = useChatAppPromptImageAttachmentActions({
    latestChatSessionStateRef,
    isConversationCompactionInFlightRef,
    setChatSessionState,
    diagnosticLogger: input.diagnosticLogger,
  });

  const hideCommandHelpModalInChatApp = useEffectEvent(() => {
    setChatSessionState((currentChatSessionState) => {
      const nextChatSessionState = hideCommandHelpModal(currentChatSessionState);
      latestChatSessionStateRef.current = nextChatSessionState;
      return nextChatSessionState;
    });
  });
  const readLatestChatSessionState = useEffectEvent((): ChatSessionState => latestChatSessionStateRef.current);
  const readIsConversationCompactionInFlight = useEffectEvent((): boolean => isConversationCompactionInFlightRef.current);

  const transcriptState = selectStableChatAppTranscriptState({
    previousState: stableTranscriptStateRef.current,
    nextState: buildChatAppTranscriptState(chatSessionState),
  });
  const promptComposerState = selectStableChatAppPromptComposerState({
    previousState: stablePromptComposerStateRef.current,
    nextState: buildChatAppPromptComposerState({
      chatSessionState,
      queuedPromptCount,
      isActiveTurnInterruptConfirmationArmed,
    }),
  });
  const interactionStatusState = selectStableChatAppInteractionStatusState({
    previousState: stableInteractionStatusStateRef.current,
    nextState: buildChatAppInteractionStatusState({
      chatSessionState,
      conversationSessionExportStatus,
      conversationSessionCompactionStatus,
    }),
  });
  const selectionState = selectStableChatAppSelectionState({
    previousState: stableSelectionStateRef.current,
    nextState: buildChatAppSelectionState(chatSessionState),
  });
  stableTranscriptStateRef.current = transcriptState;
  stablePromptComposerStateRef.current = promptComposerState;
  stableInteractionStatusStateRef.current = interactionStatusState;
  stableSelectionStateRef.current = selectionState;

  return {
    activeConversationSessionId,
    chatSessionState,
    transcriptState,
    promptComposerState,
    interactionStatusState,
    selectionState,
    conversationSessionExportStatus,
    conversationSessionCompactionStatus,
    queuedPromptCount,
    isActiveTurnInterruptConfirmationArmed,
    applyChatAppKeyboardInput,
    applyPromptDraftEditToChatApp,
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt,
    submitPendingToolApprovalDecision,
    requestConversationSessionDeletion,
    hideCommandHelpModalInChatApp,
    readLatestChatSessionState,
    readIsConversationCompactionInFlight,
  };
}

function buildChatAppTranscriptState(chatSessionState: ChatSessionState): ChatAppTranscriptState {
  return {
    conversationMessagesById: chatSessionState.conversationMessagesById,
    conversationMessagePartsById: chatSessionState.conversationMessagePartsById,
    orderedConversationMessageIds: chatSessionState.orderedConversationMessageIds,
    conversationMessagePartCount: chatSessionState.conversationMessagePartCount,
    isReasoningSummaryVisible: chatSessionState.isReasoningSummaryVisible,
    isCommandHelpModalVisible: chatSessionState.isCommandHelpModalVisible,
  };
}

function buildChatAppPromptComposerState(input: {
  chatSessionState: ChatSessionState;
  queuedPromptCount: number;
  isActiveTurnInterruptConfirmationArmed: boolean;
}): ChatAppPromptComposerState {
  return {
    conversationTurnStatus: input.chatSessionState.conversationTurnStatus,
    promptDraft: input.chatSessionState.promptDraft,
    promptDraftCursorOffset: input.chatSessionState.promptDraftCursorOffset,
    pendingPromptImageAttachments: input.chatSessionState.pendingPromptImageAttachments,
    selectedPromptContextReferenceTexts: input.chatSessionState.selectedPromptContextReferenceTexts,
    selectedAssistantOperatingMode: input.chatSessionState.selectedAssistantOperatingMode,
    selectedModelId: input.chatSessionState.selectedModelId,
    selectedModelDefaultReasoningEffort: input.chatSessionState.selectedModelDefaultReasoningEffort,
    selectedReasoningEffort: input.chatSessionState.selectedReasoningEffort,
    latestContextWindowUsage: input.chatSessionState.latestContextWindowUsage,
    queuedPromptCount: input.queuedPromptCount,
    isActiveTurnInterruptConfirmationArmed: input.isActiveTurnInterruptConfirmationArmed,
  };
}

function buildChatAppInteractionStatusState(input: {
  chatSessionState: ChatSessionState;
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
}): ChatAppInteractionStatusState {
  return {
    conversationTurnStatus: input.chatSessionState.conversationTurnStatus,
    pendingToolApprovalRequest: input.chatSessionState.pendingToolApprovalRequest,
    conversationSessionExportStatus: input.conversationSessionExportStatus,
    conversationSessionCompactionStatus: input.conversationSessionCompactionStatus,
  };
}

function buildChatAppSelectionState(chatSessionState: ChatSessionState): ChatAppSelectionState {
  return {
    conversationSessionSelectionState: chatSessionState.conversationSessionSelectionState,
    modelAndReasoningSelectionState: chatSessionState.modelAndReasoningSelectionState,
    slashCommandSelectionState: chatSessionState.slashCommandSelectionState,
    promptContextSelectionState: chatSessionState.promptContextSelectionState,
    isCommandHelpModalVisible: chatSessionState.isCommandHelpModalVisible,
  };
}

function selectStableChatAppTranscriptState(input: {
  previousState: ChatAppTranscriptState | undefined;
  nextState: ChatAppTranscriptState;
}): ChatAppTranscriptState {
  if (
    input.previousState &&
    input.previousState.conversationMessagesById === input.nextState.conversationMessagesById &&
    input.previousState.conversationMessagePartsById === input.nextState.conversationMessagePartsById &&
    input.previousState.orderedConversationMessageIds === input.nextState.orderedConversationMessageIds &&
    input.previousState.conversationMessagePartCount === input.nextState.conversationMessagePartCount &&
    input.previousState.isReasoningSummaryVisible === input.nextState.isReasoningSummaryVisible &&
    input.previousState.isCommandHelpModalVisible === input.nextState.isCommandHelpModalVisible
  ) {
    return input.previousState;
  }

  return input.nextState;
}

function selectStableChatAppPromptComposerState(input: {
  previousState: ChatAppPromptComposerState | undefined;
  nextState: ChatAppPromptComposerState;
}): ChatAppPromptComposerState {
  if (
    input.previousState &&
    input.previousState.conversationTurnStatus === input.nextState.conversationTurnStatus &&
    input.previousState.promptDraft === input.nextState.promptDraft &&
    input.previousState.promptDraftCursorOffset === input.nextState.promptDraftCursorOffset &&
    input.previousState.pendingPromptImageAttachments === input.nextState.pendingPromptImageAttachments &&
    input.previousState.selectedPromptContextReferenceTexts === input.nextState.selectedPromptContextReferenceTexts &&
    input.previousState.selectedAssistantOperatingMode === input.nextState.selectedAssistantOperatingMode &&
    input.previousState.selectedModelId === input.nextState.selectedModelId &&
    input.previousState.selectedModelDefaultReasoningEffort === input.nextState.selectedModelDefaultReasoningEffort &&
    input.previousState.selectedReasoningEffort === input.nextState.selectedReasoningEffort &&
    input.previousState.latestContextWindowUsage === input.nextState.latestContextWindowUsage &&
    input.previousState.queuedPromptCount === input.nextState.queuedPromptCount &&
    input.previousState.isActiveTurnInterruptConfirmationArmed === input.nextState.isActiveTurnInterruptConfirmationArmed
  ) {
    return input.previousState;
  }

  return input.nextState;
}

function selectStableChatAppInteractionStatusState(input: {
  previousState: ChatAppInteractionStatusState | undefined;
  nextState: ChatAppInteractionStatusState;
}): ChatAppInteractionStatusState {
  if (
    input.previousState &&
    input.previousState.conversationTurnStatus === input.nextState.conversationTurnStatus &&
    input.previousState.pendingToolApprovalRequest === input.nextState.pendingToolApprovalRequest &&
    input.previousState.conversationSessionExportStatus === input.nextState.conversationSessionExportStatus &&
    input.previousState.conversationSessionCompactionStatus === input.nextState.conversationSessionCompactionStatus
  ) {
    return input.previousState;
  }

  return input.nextState;
}

function selectStableChatAppSelectionState(input: {
  previousState: ChatAppSelectionState | undefined;
  nextState: ChatAppSelectionState;
}): ChatAppSelectionState {
  if (
    input.previousState &&
    input.previousState.conversationSessionSelectionState === input.nextState.conversationSessionSelectionState &&
    input.previousState.modelAndReasoningSelectionState === input.nextState.modelAndReasoningSelectionState &&
    input.previousState.slashCommandSelectionState === input.nextState.slashCommandSelectionState &&
    input.previousState.promptContextSelectionState === input.nextState.promptContextSelectionState &&
    input.previousState.isCommandHelpModalVisible === input.nextState.isCommandHelpModalVisible
  ) {
    return input.previousState;
  }

  return input.nextState;
}
