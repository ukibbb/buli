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
  type ChatSlashCommandSkill,
} from "@buli/chat-session-state";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ActiveConversationTurnShutdownCoordinator } from "./activeConversationTurnShutdown.ts";
import {
  buildChatAppRenderStoreChangeSetFromChatSessionStateChange,
  createChatAppRenderStore,
  type ChatAppControllerChromeRenderState,
  type ChatAppRenderStore,
} from "./chatAppRenderStore.ts";
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
  availableSkills?: readonly ChatSlashCommandSkill[] | undefined;
  initialConversationSessionId?: string | undefined;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[] | undefined;
  loadInitialConversationSessionEntries?:
    | ((conversationSessionId: string) => Promise<InitialConversationSessionEntriesLoadResult> | InitialConversationSessionEntriesLoadResult)
    | undefined;
  onInitialConversationSessionEntriesHydrated?:
    | ((initialConversationSessionEntriesLoadResult: InitialConversationSessionEntriesLoadResult) => void | Promise<void>)
    | undefined;
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
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
  scrollConversationMessagesToBottom: () => void;
  scrollConversationMessagesByPage: (direction: ChatAppConversationTranscriptScrollDirection) => void;
};

export type InitialConversationSessionEntriesLoadResult = {
  conversationSessionId: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type UseChatAppControllerResult = {
  activeConversationSessionId: string | undefined;
  chatSessionState: ChatSessionState;
  chatAppRenderStore: ChatAppRenderStore;
  transcriptState: ChatAppTranscriptState;
  promptComposerState: ChatAppPromptComposerState;
  interactionStatusState: ChatAppInteractionStatusState;
  selectionState: ChatAppSelectionState;
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
  queuedPromptPreviews: readonly QueuedChatAppPromptPreview[];
  isActiveTurnInterruptConfirmationArmed: boolean;
  applyChatAppKeyboardInput: UseChatAppKeyboardActionsResult["applyChatAppKeyboardInput"];
  applyPromptDraftEditToChatApp: UseChatAppKeyboardActionsResult["applyPromptDraftEditToChatApp"];
  insertSummarizedPastedTextIntoChatAppPrompt: UseChatAppKeyboardActionsResult["insertSummarizedPastedTextIntoChatAppPrompt"];
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
  readConversationSessionCompactionStatus: () => ConversationSessionCompactionStatus;
};

export type ChatAppTranscriptState = Pick<
  ChatSessionState,
  | "conversationMessagesById"
  | "conversationMessagePartsById"
  | "orderedConversationMessageIds"
  | "conversationMessagePartCount"
  | "reasoningSummaryDisplayMode"
  | "isCommandHelpModalVisible"
>;

export type ChatAppPromptComposerState = Pick<
  ChatSessionState,
  | "conversationTurnStatus"
  | "promptDraft"
  | "promptDraftCursorOffset"
  | "pendingPromptImageAttachments"
  | "pendingPromptTextPastes"
  | "selectedPromptContextReferenceTexts"
  | "selectedAssistantOperatingMode"
  | "selectedModelId"
  | "selectedModelDefaultReasoningEffort"
  | "selectedReasoningEffort"
  | "latestContextWindowUsage"
> & {
  queuedPromptCount: number;
  queuedPromptPreviews: readonly QueuedChatAppPromptPreview[];
  isActiveTurnInterruptConfirmationArmed: boolean;
  isInitialConversationSessionHydrationPending: boolean;
};

export type QueuedChatAppPromptPreview = {
  queuedPromptId: string;
  submittedPromptText: string;
  submittedPromptImageAttachmentCount: number;
};

type StoredQueuedChatAppPrompt = QueuedChatAppPrompt & {
  queuedPromptId: string;
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
  const shouldLoadInitialConversationSessionEntries = input.initialConversationSessionEntries === undefined &&
    input.initialConversationSessionId !== undefined &&
    input.loadInitialConversationSessionEntries !== undefined;
  const [activeConversationSessionId, setActiveConversationSessionId] = useState<string | undefined>(
    input.initialConversationSessionId,
  );
  const [isInitialConversationSessionHydrationPending, setIsInitialConversationSessionHydrationPending] = useState(
    shouldLoadInitialConversationSessionEntries,
  );
  const [conversationSessionExportStatus, setConversationSessionExportStatus] = useState<ConversationSessionExportStatus>({
    step: "idle",
  });
  const [conversationSessionCompactionStatus, setConversationSessionCompactionStatus] = useState<ConversationSessionCompactionStatus>({
    step: "idle",
  });
  const [queuedPromptCount, setQueuedPromptCount] = useState(0);
  const [queuedPromptPreviews, setQueuedPromptPreviews] = useState<readonly QueuedChatAppPromptPreview[]>([]);
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
  const chatAppRenderStoreRef = useRef<ChatAppRenderStore | undefined>(undefined);
  chatAppRenderStoreRef.current ??= createChatAppRenderStore({
    initialChatSessionState: chatSessionState,
    initialControllerChromeRenderState: {
      conversationSessionExportStatus,
      conversationSessionCompactionStatus,
      queuedPromptCount,
      queuedPromptPreviews,
      isActiveTurnInterruptConfirmationArmed: false,
      isInitialConversationSessionHydrationPending,
    },
  });
  const chatAppRenderStore = chatAppRenderStoreRef.current;

  const latestChatSessionStateRef = useRef<ChatSessionState>(chatSessionState);
  const latestActiveConversationSessionIdRef = useRef<string | undefined>(activeConversationSessionId);
  const isPromptSubmissionInFlightRef = useRef(shouldLoadInitialConversationSessionEntries);
  const isConversationCompactionInFlightRef = useRef(false);
  const isChatAppControllerMountedRef = useRef(true);
  const hasStartedInitialConversationSessionHydrationRef = useRef(false);
  const submittedToolApprovalDecisionApprovalIdRef = useRef<string | undefined>(undefined);
  const queuedChatAppPromptsRef = useRef<StoredQueuedChatAppPrompt[]>([]);
  const nextQueuedPromptIdRef = useRef(0);
  const stableTranscriptStateRef = useRef<ChatAppTranscriptState | undefined>(undefined);
  const stablePromptComposerStateRef = useRef<ChatAppPromptComposerState | undefined>(undefined);
  const stableInteractionStatusStateRef = useRef<ChatAppInteractionStatusState | undefined>(undefined);
  const stableSelectionStateRef = useRef<ChatAppSelectionState | undefined>(undefined);

  latestChatSessionStateRef.current = chatAppRenderStore.readChatSessionState();
  latestActiveConversationSessionIdRef.current = activeConversationSessionId;

  const setChatSessionStateAndUpdateRenderStore = useCallback<Dispatch<SetStateAction<ChatSessionState>>>((chatSessionStateUpdate) => {
    const previousChatSessionState = chatAppRenderStore.readChatSessionState();
    const nextChatSessionState = resolveNextChatSessionStateForControllerStateUpdate({
      previousChatSessionState,
      chatSessionStateUpdate,
    });
    latestChatSessionStateRef.current = nextChatSessionState;
    chatAppRenderStore.replaceChatSessionState({
      nextChatSessionState,
      changeSet: buildChatAppRenderStoreChangeSetFromChatSessionStateChange({
        previousChatSessionState,
        nextChatSessionState,
      }),
    });
    setChatSessionState(nextChatSessionState);
  }, [chatAppRenderStore]);
  const setPromptLocalChatSessionStateAndUpdateRenderStore = useCallback<Dispatch<SetStateAction<ChatSessionState>>>(
    (chatSessionStateUpdate) => {
      const previousChatSessionState = chatAppRenderStore.readChatSessionState();
      const nextChatSessionState = resolveNextChatSessionStateForControllerStateUpdate({
        previousChatSessionState,
        chatSessionStateUpdate,
      });
      latestChatSessionStateRef.current = nextChatSessionState;
      chatAppRenderStore.replaceChatSessionState({
        nextChatSessionState,
        changeSet: buildChatAppRenderStoreChangeSetFromChatSessionStateChange({
          previousChatSessionState,
          nextChatSessionState,
        }),
      });
    },
    [chatAppRenderStore],
  );
  const replaceControllerChromeRenderState = useCallback(
    (buildNextControllerChromeRenderState: (
      currentControllerChromeRenderState: ChatAppControllerChromeRenderState,
    ) => ChatAppControllerChromeRenderState): void => {
      chatAppRenderStore.replaceControllerChromeRenderState({
        nextControllerChromeRenderState: buildNextControllerChromeRenderState(
          chatAppRenderStore.readControllerChromeRenderState(),
        ),
      });
    },
    [chatAppRenderStore],
  );
  const setConversationSessionExportStatusAndUpdateRenderStore = useCallback<Dispatch<SetStateAction<ConversationSessionExportStatus>>>(
    (conversationSessionExportStatusUpdate) => {
      const nextConversationSessionExportStatus = resolveNextControllerStateValue({
        previousValue: chatAppRenderStore.readControllerChromeRenderState().conversationSessionExportStatus,
        valueUpdate: conversationSessionExportStatusUpdate,
      });
      replaceControllerChromeRenderState((currentControllerChromeRenderState) => ({
        ...currentControllerChromeRenderState,
        conversationSessionExportStatus: nextConversationSessionExportStatus,
      }));
      setConversationSessionExportStatus(nextConversationSessionExportStatus);
    },
    [chatAppRenderStore, replaceControllerChromeRenderState],
  );
  const setConversationSessionCompactionStatusAndUpdateRenderStore = useCallback<Dispatch<SetStateAction<ConversationSessionCompactionStatus>>>(
    (conversationSessionCompactionStatusUpdate) => {
      const nextConversationSessionCompactionStatus = resolveNextControllerStateValue({
        previousValue: chatAppRenderStore.readControllerChromeRenderState().conversationSessionCompactionStatus,
        valueUpdate: conversationSessionCompactionStatusUpdate,
      });
      replaceControllerChromeRenderState((currentControllerChromeRenderState) => ({
        ...currentControllerChromeRenderState,
        conversationSessionCompactionStatus: nextConversationSessionCompactionStatus,
      }));
      setConversationSessionCompactionStatus(nextConversationSessionCompactionStatus);
    },
    [chatAppRenderStore, replaceControllerChromeRenderState],
  );
  const setIsInitialConversationSessionHydrationPendingAndUpdateRenderStore = useCallback<Dispatch<SetStateAction<boolean>>>(
    (isInitialConversationSessionHydrationPendingUpdate) => {
      const nextIsInitialConversationSessionHydrationPending = resolveNextControllerStateValue({
        previousValue: chatAppRenderStore.readControllerChromeRenderState().isInitialConversationSessionHydrationPending,
        valueUpdate: isInitialConversationSessionHydrationPendingUpdate,
      });
      replaceControllerChromeRenderState((currentControllerChromeRenderState) => ({
        ...currentControllerChromeRenderState,
        isInitialConversationSessionHydrationPending: nextIsInitialConversationSessionHydrationPending,
      }));
      setIsInitialConversationSessionHydrationPending(nextIsInitialConversationSessionHydrationPending);
    },
    [chatAppRenderStore, replaceControllerChromeRenderState],
  );
  const setActiveTurnInterruptConfirmationArmedInRenderStore = useEffectEvent((isActiveTurnInterruptConfirmationArmed: boolean) => {
    replaceControllerChromeRenderState((currentControllerChromeRenderState) => ({
      ...currentControllerChromeRenderState,
      isActiveTurnInterruptConfirmationArmed,
    }));
  });

  useEffect(() => {
    isChatAppControllerMountedRef.current = true;
    return () => {
      isChatAppControllerMountedRef.current = false;
      queuedChatAppPromptsRef.current = [];
    };
  }, []);

  const {
    isActiveTurnInterruptConfirmationArmed,
    getActiveConversationTurn,
    registerActiveConversationTurnStarted,
    registerActiveConversationTurnFinished,
    registerActiveConversationTurnSettlement,
    requestActiveConversationTurnInterrupt,
  } = useChatAppActiveTurnInterrupt({
    activeConversationTurnShutdownCoordinator: input.activeConversationTurnShutdownCoordinator,
    onActiveTurnInterruptConfirmationArmedChanged: setActiveTurnInterruptConfirmationArmedInRenderStore,
  });
  const {
    dismissActivePromptContextQuery,
    refreshPromptContextSelectionForChatSessionState,
  } = useChatAppPromptContextSelectionRefresh({
    chatSessionState: latestChatSessionStateRef.current,
    setChatSessionState: setPromptLocalChatSessionStateAndUpdateRenderStore,
    loadPromptContextCandidates: input.loadPromptContextCandidates,
  });
  const enqueueQueuedSubmittedPrompt = useEffectEvent((queuedChatAppPrompt: QueuedChatAppPrompt): number => {
    nextQueuedPromptIdRef.current += 1;
    const nextQueuedChatAppPrompts = [
      ...queuedChatAppPromptsRef.current,
      {
        ...queuedChatAppPrompt,
        queuedPromptId: `queued-prompt-${nextQueuedPromptIdRef.current}`,
      },
    ];
    const nextQueuedPromptPreviews = toQueuedChatAppPromptPreviews(nextQueuedChatAppPrompts);
    queuedChatAppPromptsRef.current = nextQueuedChatAppPrompts;
    replaceControllerChromeRenderState((currentControllerChromeRenderState) => ({
      ...currentControllerChromeRenderState,
      queuedPromptCount: nextQueuedChatAppPrompts.length,
      queuedPromptPreviews: nextQueuedPromptPreviews,
    }));
    setQueuedPromptCount(nextQueuedChatAppPrompts.length);
    setQueuedPromptPreviews(nextQueuedPromptPreviews);
    return nextQueuedChatAppPrompts.length;
  });
  const dequeueQueuedSubmittedPrompt = useEffectEvent((): QueuedChatAppPrompt | undefined => {
    const [nextQueuedChatAppPrompt, ...remainingQueuedChatAppPrompts] = queuedChatAppPromptsRef.current;
    if (!nextQueuedChatAppPrompt) {
      return undefined;
    }

    const nextQueuedPromptPreviews = toQueuedChatAppPromptPreviews(remainingQueuedChatAppPrompts);
    queuedChatAppPromptsRef.current = remainingQueuedChatAppPrompts;
    replaceControllerChromeRenderState((currentControllerChromeRenderState) => ({
      ...currentControllerChromeRenderState,
      queuedPromptCount: remainingQueuedChatAppPrompts.length,
      queuedPromptPreviews: nextQueuedPromptPreviews,
    }));
    setQueuedPromptCount(remainingQueuedChatAppPrompts.length);
    setQueuedPromptPreviews(nextQueuedPromptPreviews);
    return nextQueuedChatAppPrompt;
  });
  const {
    hydrateConversationSessionEntriesIntoChatApp,
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
    setChatSessionState: setChatSessionStateAndUpdateRenderStore,
    setActiveConversationSessionId,
    setConversationSessionExportStatus: setConversationSessionExportStatusAndUpdateRenderStore,
    setConversationSessionCompactionStatus: setConversationSessionCompactionStatusAndUpdateRenderStore,
  });

  useEffect(() => {
    if (!shouldLoadInitialConversationSessionEntries) {
      return;
    }

    if (hasStartedInitialConversationSessionHydrationRef.current) {
      return;
    }

    const initialConversationSessionId = input.initialConversationSessionId;
    const loadInitialConversationSessionEntries = input.loadInitialConversationSessionEntries;
    if (!initialConversationSessionId || !loadInitialConversationSessionEntries) {
      return;
    }

    hasStartedInitialConversationSessionHydrationRef.current = true;
    let isInitialConversationSessionHydrationCancelled = false;
    isPromptSubmissionInFlightRef.current = true;
    setIsInitialConversationSessionHydrationPendingAndUpdateRenderStore(true);

    void Promise.resolve()
      .then(() => loadInitialConversationSessionEntries(initialConversationSessionId))
      .then(async (initialConversationSessionEntriesLoadResult) => {
        if (
          isInitialConversationSessionHydrationCancelled ||
          latestActiveConversationSessionIdRef.current !== initialConversationSessionEntriesLoadResult.conversationSessionId
        ) {
          return;
        }

        await input.onInitialConversationSessionEntriesHydrated?.(initialConversationSessionEntriesLoadResult);
        if (
          isInitialConversationSessionHydrationCancelled ||
          latestActiveConversationSessionIdRef.current !== initialConversationSessionEntriesLoadResult.conversationSessionId
        ) {
          return;
        }

        hydrateConversationSessionEntriesIntoChatApp(
          initialConversationSessionEntriesLoadResult.conversationSessionEntries,
        );
      })
      .catch((error: unknown) => {
        if (isInitialConversationSessionHydrationCancelled) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (latestActiveConversationSessionIdRef.current !== initialConversationSessionId) {
          return;
        }

        hydrateConversationSessionEntriesIntoChatApp([
          {
            entryKind: "assistant_message",
            assistantMessageStatus: "failed",
            assistantMessageText: "",
            failureExplanation: `Could not load persisted conversation session: ${errorMessage}`,
          },
        ]);
      })
      .finally(() => {
        if (isInitialConversationSessionHydrationCancelled) {
          return;
        }

        isPromptSubmissionInFlightRef.current = false;
        setIsInitialConversationSessionHydrationPendingAndUpdateRenderStore(false);
      });

    return () => {
      isInitialConversationSessionHydrationCancelled = true;
      hasStartedInitialConversationSessionHydrationRef.current = false;
    };
  }, [
    shouldLoadInitialConversationSessionEntries,
    input.initialConversationSessionId,
    input.loadInitialConversationSessionEntries,
    input.onInitialConversationSessionEntriesHydrated,
    setIsInitialConversationSessionHydrationPendingAndUpdateRenderStore,
  ]);
  const {
    streamAssistantResponseForSubmittedPrompt,
    submitPendingToolApprovalDecision,
  } = useChatAppAssistantTurnActions({
    chatSessionState,
    assistantConversationRunner: input.assistantConversationRunner,
    latestChatSessionStateRef,
    isPromptSubmissionInFlightRef,
    isChatAppControllerMountedRef,
    submittedToolApprovalDecisionApprovalIdRef,
    setChatSessionState: setChatSessionStateAndUpdateRenderStore,
    chatAppRenderStore,
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
    insertSummarizedPastedTextIntoChatAppPrompt,
  } = useChatAppKeyboardActions({
    availableSkills: input.availableSkills,
    conversationSessionCompactionStatus,
    loadAvailableAssistantModels: input.loadAvailableAssistantModels,
    latestChatSessionStateRef,
    isPromptSubmissionInFlightRef,
    setChatSessionState: setChatSessionStateAndUpdateRenderStore,
    setPromptLocalChatSessionState: setPromptLocalChatSessionStateAndUpdateRenderStore,
    requestActiveConversationTurnInterrupt,
    dismissActivePromptContextQuery,
    refreshPromptContextSelectionForChatSessionState,
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
  });
  const {
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt,
  } = useChatAppPromptImageAttachmentActions({
    latestChatSessionStateRef,
    conversationSessionCompactionStatus,
    setChatSessionState: setPromptLocalChatSessionStateAndUpdateRenderStore,
  });

  const hideCommandHelpModalInChatApp = useEffectEvent(() => {
    setChatSessionStateAndUpdateRenderStore((currentChatSessionState) => {
      const nextChatSessionState = hideCommandHelpModal(currentChatSessionState);
      latestChatSessionStateRef.current = nextChatSessionState;
      return nextChatSessionState;
    });
  });
  const readLatestChatSessionState = useEffectEvent((): ChatSessionState => latestChatSessionStateRef.current);
  const readConversationSessionCompactionStatus = useEffectEvent(
    (): ConversationSessionCompactionStatus => conversationSessionCompactionStatus,
  );

  const transcriptState = selectStableChatAppTranscriptState({
    previousState: stableTranscriptStateRef.current,
    nextState: buildChatAppTranscriptState(chatSessionState),
  });
  const promptComposerState = selectStableChatAppPromptComposerState({
    previousState: stablePromptComposerStateRef.current,
    nextState: buildChatAppPromptComposerState({
      chatSessionState,
      queuedPromptCount,
      queuedPromptPreviews,
      isActiveTurnInterruptConfirmationArmed,
      isInitialConversationSessionHydrationPending,
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
    chatAppRenderStore,
    transcriptState,
    promptComposerState,
    interactionStatusState,
    selectionState,
    conversationSessionExportStatus,
    conversationSessionCompactionStatus,
    queuedPromptCount,
    queuedPromptPreviews,
    isActiveTurnInterruptConfirmationArmed,
    applyChatAppKeyboardInput,
    applyPromptDraftEditToChatApp,
    insertSummarizedPastedTextIntoChatAppPrompt,
    removePromptImageAttachmentPlaceholderBeforeCursorFromChatApp,
    removePromptImageAttachmentPlaceholderAtCursorFromChatApp,
    pasteClipboardImageAttachmentIntoChatAppPrompt,
    submitPendingToolApprovalDecision,
    requestConversationSessionDeletion,
    hideCommandHelpModalInChatApp,
    readLatestChatSessionState,
    readConversationSessionCompactionStatus,
  };
}

function resolveNextChatSessionStateForControllerStateUpdate(input: {
  previousChatSessionState: ChatSessionState;
  chatSessionStateUpdate: SetStateAction<ChatSessionState>;
}): ChatSessionState {
  return typeof input.chatSessionStateUpdate === "function"
    ? input.chatSessionStateUpdate(input.previousChatSessionState)
    : input.chatSessionStateUpdate;
}

function resolveNextControllerStateValue<T>(input: {
  previousValue: T;
  valueUpdate: SetStateAction<T>;
}): T {
  if (typeof input.valueUpdate !== "function") {
    return input.valueUpdate;
  }

  const buildNextValue = input.valueUpdate as (previousValue: T) => T;
  return buildNextValue(input.previousValue);
}

function buildChatAppTranscriptState(chatSessionState: ChatSessionState): ChatAppTranscriptState {
  return {
    conversationMessagesById: chatSessionState.conversationMessagesById,
    conversationMessagePartsById: chatSessionState.conversationMessagePartsById,
    orderedConversationMessageIds: chatSessionState.orderedConversationMessageIds,
    conversationMessagePartCount: chatSessionState.conversationMessagePartCount,
    reasoningSummaryDisplayMode: chatSessionState.reasoningSummaryDisplayMode,
    isCommandHelpModalVisible: chatSessionState.isCommandHelpModalVisible,
  };
}

function buildChatAppPromptComposerState(input: {
  chatSessionState: ChatSessionState;
  queuedPromptCount: number;
  queuedPromptPreviews: readonly QueuedChatAppPromptPreview[];
  isActiveTurnInterruptConfirmationArmed: boolean;
  isInitialConversationSessionHydrationPending: boolean;
}): ChatAppPromptComposerState {
  return {
    conversationTurnStatus: input.chatSessionState.conversationTurnStatus,
    promptDraft: input.chatSessionState.promptDraft,
    promptDraftCursorOffset: input.chatSessionState.promptDraftCursorOffset,
    pendingPromptImageAttachments: input.chatSessionState.pendingPromptImageAttachments,
    pendingPromptTextPastes: input.chatSessionState.pendingPromptTextPastes,
    selectedPromptContextReferenceTexts: input.chatSessionState.selectedPromptContextReferenceTexts,
    selectedAssistantOperatingMode: input.chatSessionState.selectedAssistantOperatingMode,
    selectedModelId: input.chatSessionState.selectedModelId,
    selectedModelDefaultReasoningEffort: input.chatSessionState.selectedModelDefaultReasoningEffort,
    selectedReasoningEffort: input.chatSessionState.selectedReasoningEffort,
    latestContextWindowUsage: input.chatSessionState.latestContextWindowUsage,
    queuedPromptCount: input.queuedPromptCount,
    queuedPromptPreviews: input.queuedPromptPreviews,
    isActiveTurnInterruptConfirmationArmed: input.isActiveTurnInterruptConfirmationArmed,
    isInitialConversationSessionHydrationPending: input.isInitialConversationSessionHydrationPending,
  };
}

function toQueuedChatAppPromptPreviews(
  queuedChatAppPrompts: readonly StoredQueuedChatAppPrompt[],
): QueuedChatAppPromptPreview[] {
  return queuedChatAppPrompts.map((queuedChatAppPrompt) => ({
    queuedPromptId: queuedChatAppPrompt.queuedPromptId,
    submittedPromptText: queuedChatAppPrompt.submittedPromptText,
    submittedPromptImageAttachmentCount: queuedChatAppPrompt.submittedPromptImageAttachments.length,
  }));
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
    input.previousState.reasoningSummaryDisplayMode === input.nextState.reasoningSummaryDisplayMode &&
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
    input.previousState.pendingPromptTextPastes === input.nextState.pendingPromptTextPastes &&
    input.previousState.selectedPromptContextReferenceTexts === input.nextState.selectedPromptContextReferenceTexts &&
    input.previousState.selectedAssistantOperatingMode === input.nextState.selectedAssistantOperatingMode &&
    input.previousState.selectedModelId === input.nextState.selectedModelId &&
    input.previousState.selectedModelDefaultReasoningEffort === input.nextState.selectedModelDefaultReasoningEffort &&
    input.previousState.selectedReasoningEffort === input.nextState.selectedReasoningEffort &&
    input.previousState.latestContextWindowUsage === input.nextState.latestContextWindowUsage &&
    input.previousState.queuedPromptCount === input.nextState.queuedPromptCount &&
    input.previousState.queuedPromptPreviews === input.nextState.queuedPromptPreviews &&
    input.previousState.isActiveTurnInterruptConfirmationArmed === input.nextState.isActiveTurnInterruptConfirmationArmed &&
    input.previousState.isInitialConversationSessionHydrationPending ===
      input.nextState.isInitialConversationSessionHydrationPending
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
