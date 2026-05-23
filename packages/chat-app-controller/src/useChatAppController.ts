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
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
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

  return {
    activeConversationSessionId,
    chatSessionState,
    conversationSessionExportStatus,
    conversationSessionCompactionStatus,
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
