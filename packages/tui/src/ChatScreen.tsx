import os from "node:os";
import type {
  AssistantResponseEvent,
  AvailableAssistantModel,
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionSummary,
  ReasoningEffort,
} from "@buli/contracts";
import {
  determinePromptContextQueryLoadStrategy,
  extractActivePromptContextQueryFromPromptDraft,
  type ActiveConversationTurn,
  type AssistantConversationRunner,
  type PromptContextCandidate,
} from "@buli/engine";
import {
  applyAssistantResponseEventsToChatSessionState,
  clearConversationTranscript,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatSessionState,
  cycleAssistantOperatingMode,
  hideModelAndReasoningSelection,
  hidePromptContextSelection,
  hideSlashCommandSelection,
  hideCommandHelpModal,
  hideConversationSessionSelection,
  insertTextIntoPromptDraftAtCursor,
  listOrderedConversationMessageParts,
  listOrderedConversationMessages,
  moveHighlightedConversationSessionSelectionDown,
  moveHighlightedConversationSessionSelectionUp,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedPromptContextCandidateDown,
  moveHighlightedPromptContextCandidateUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  moveHighlightedSlashCommandSelectionDown,
  moveHighlightedSlashCommandSelectionUp,
  movePromptDraftCursorLeft,
  movePromptDraftCursorRight,
  refreshPromptContextCandidatesForSelection,
  refreshSlashCommandSelectionForPromptDraft,
  removePromptDraftCharacterAtCursor,
  removePromptDraftCharacterBeforeCursor,
  hydrateConversationTranscriptFromSessionEntries,
  selectHighlightedPromptContextCandidate,
  selectHighlightedConversationSession,
  selectHighlightedSlashCommand,
  selectAssistantOperatingMode,
  showAvailableConversationSessionsForSelection,
  showAvailableAssistantModelsForSelection,
  showConversationSessionSelectionLoadingError,
  showConversationSessionSelectionLoadingState,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showPromptContextCandidatesForSelection,
  showCommandHelpModal,
  submitPromptDraft,
  toggleReasoningSummaryVisibility,
  type ChatSessionState,
} from "@buli/chat-session-state";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme, minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import { ConversationMessageList } from "./components/ConversationMessageList.tsx";
import { InputPanel, INPUT_PANEL_NATURAL_ROW_COUNT } from "./components/InputPanel.tsx";
import {
  MinimumHeightPromptStrip,
  MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT,
} from "./components/MinimumHeightPromptStrip.tsx";
import { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
import { PromptContextSelectionPane } from "./components/PromptContextSelectionPane.tsx";
import { SlashCommandSelectionPane } from "./components/SlashCommandSelectionPane.tsx";
import { CommandHelpModal } from "./components/CommandHelpModal.tsx";
import { ConversationSessionSelectionPane } from "./components/ConversationSessionSelectionPane.tsx";
import { TopBar, TOP_BAR_NATURAL_ROW_COUNT } from "./components/TopBar.tsx";
import { ErrorBannerBlock } from "./components/behavior/ErrorBannerBlock.tsx";
import { ToolApprovalRequestBlock } from "./components/behavior/ToolApprovalRequestBlock.tsx";
import { useTerminalSizeTierForChatScreen } from "./components/behavior/useTerminalSizeTierForChatScreen.ts";
import { lookupContextWindowTokenCapacityForModel } from "./modelContextWindowCapacity.ts";
import {
  buildPromptContextQueryIdentity,
  doPromptContextQueriesMatch,
  shouldHideResolvedPromptContextCandidatesForQuery,
  type PromptContextQueryIdentity,
} from "./promptContextQueryIdentity.ts";
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";
import { summarizeAssistantResponseEventsForDiagnostics } from "./assistantResponseEventDiagnostics.ts";
import { buildChatSlashCommands } from "./slashCommands.ts";

const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;
const TRANSCRIPT_WHEEL_SCROLL_ROW_COUNT = 3;
const FUZZY_PROMPT_CONTEXT_QUERY_DEBOUNCE_MS = 120;
const PROMPT_INPUT_REGION_MAX_WIDTH_IN_CELLS = 100;

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
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: () => ConversationSessionSwitchResult | void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type ConversationSessionSwitchResult = {
  conversationSessionId: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ConversationSessionExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

type ConversationSessionExportStatus =
  | { step: "idle" }
  | { step: "failed"; errorMessage: string };

type ChatScreenInteractionScope =
  | "command_help_modal"
  | "model_selection"
  | "reasoning_effort_selection"
  | "conversation_session_selection"
  | "slash_command_selection"
  | "prompt_context_selection"
  | "tool_approval"
  | "prompt_draft_editing";

function resolveChatScreenInteractionScope(chatSessionState: ChatSessionState): ChatScreenInteractionScope {
  if (chatSessionState.isCommandHelpModalVisible) {
    return "command_help_modal";
  }

  if (chatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices") {
    return "reasoning_effort_selection";
  }

  if (chatSessionState.modelAndReasoningSelectionState.step !== "hidden") {
    return "model_selection";
  }

  if (chatSessionState.conversationSessionSelectionState.step !== "hidden") {
    return "conversation_session_selection";
  }

  if (chatSessionState.slashCommandSelectionState.step !== "hidden") {
    return "slash_command_selection";
  }

  if (chatSessionState.promptContextSelectionState.step !== "hidden") {
    return "prompt_context_selection";
  }

  if (
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" &&
    chatSessionState.pendingToolApprovalRequest
  ) {
    return "tool_approval";
  }

  return "prompt_draft_editing";
}

function clampScrollTop(conversationMessageScrollBox: ScrollBoxRenderable, nextScrollTop: number): number {

  return Math.min(
    Math.max(nextScrollTop, 0),
    Math.max(0, conversationMessageScrollBox.scrollHeight - conversationMessageScrollBox.viewport.height),
  );
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
  const terminalSizeTierForChatScreen = useTerminalSizeTierForChatScreen();
  const diagnosticLogger = props.diagnosticLogger;
  const [activeConversationSessionId, setActiveConversationSessionId] = useState<string | undefined>(
    props.initialConversationSessionId,
  );
  const [conversationSessionExportStatus, setConversationSessionExportStatus] = useState<ConversationSessionExportStatus>({
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
  const latestActiveConversationTurnRef = useRef<ActiveConversationTurn | undefined>(undefined);
  const isPromptSubmissionInFlightRef = useRef(false);
  const submittedToolApprovalDecisionApprovalIdRef = useRef<string | undefined>(undefined);
  const latestPromptContextLoadRequestSequenceRef = useRef(0);
  const pendingPromptContextLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissedPromptContextQueryRef = useRef<PromptContextQueryIdentity | undefined>(undefined);
  const conversationMessageScrollBoxRef = useRef<ScrollBoxRenderable | null>(null);

  latestChatSessionStateRef.current = chatSessionState;
  latestActiveConversationSessionIdRef.current = activeConversationSessionId;

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

  useEffect(() => {
    const currentPromptContextQueryIdentity = buildPromptContextQueryIdentity(
      extractActivePromptContextQueryFromPromptDraft(
        chatSessionState.promptDraft,
        chatSessionState.promptDraftCursorOffset,
      ),
    );

    if (!doPromptContextQueriesMatch(currentPromptContextQueryIdentity, dismissedPromptContextQueryRef.current)) {
      dismissedPromptContextQueryRef.current = undefined;
    }
  }, [chatSessionState.promptDraft, chatSessionState.promptDraftCursorOffset]);

  useEffect(() => {
    const pendingApprovalId = chatSessionState.pendingToolApprovalRequest?.approvalId;
    if (!pendingApprovalId || submittedToolApprovalDecisionApprovalIdRef.current !== pendingApprovalId) {
      submittedToolApprovalDecisionApprovalIdRef.current = undefined;
    }
  }, [chatSessionState.pendingToolApprovalRequest?.approvalId]);

  const applyIncomingAssistantResponseEventsToChatScreen = useEffectEvent((assistantResponseEvents: readonly AssistantResponseEvent[]) => {
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.assistant_event_batch_applied", {
      ...summarizeAssistantResponseEventsForDiagnostics(assistantResponseEvents),
      previousConversationTurnStatus: latestChatSessionStateRef.current.conversationTurnStatus,
    });
    startTransition(() => {
      setChatSessionState((currentChatSessionState) =>
        applyAssistantResponseEventsToChatSessionState(currentChatSessionState, assistantResponseEvents),
      );
    });
  });

  const scrollConversationMessagesToBottom = useEffectEvent(() => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollTop = clampScrollTop(
      conversationMessageScrollBox,
      conversationMessageScrollBox.scrollHeight - conversationMessageScrollBox.viewport.height,
    );
  });

  const scrollConversationMessagesByRows = useEffectEvent((rowsToScroll: number) => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollTop = clampScrollTop(
      conversationMessageScrollBox,
      conversationMessageScrollBox.scrollTop + rowsToScroll,
    );
  });

  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPromptText: string) => {
    const conversationTurnRequest = {
      userPromptText: submittedPromptText,
      assistantOperatingMode: latestChatSessionStateRef.current.selectedAssistantOperatingMode,
      selectedModelId: latestChatSessionStateRef.current.selectedModelId,
      ...(latestChatSessionStateRef.current.selectedReasoningEffort
        ? { selectedReasoningEffort: latestChatSessionStateRef.current.selectedReasoningEffort }
        : {}),
    };

    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.assistant_turn_request_created", {
      selectedModelId: conversationTurnRequest.selectedModelId,
      selectedReasoningEffort: conversationTurnRequest.selectedReasoningEffort ?? null,
      assistantOperatingMode: conversationTurnRequest.assistantOperatingMode,
      submittedPromptLength: submittedPromptText.length,
    });

    try {
      await relayAssistantResponseRunnerEvents({
        assistantConversationRunner: props.assistantConversationRunner,
        conversationTurnRequest,
        onConversationTurnStarted: (activeConversationTurn) => {
          latestActiveConversationTurnRef.current = activeConversationTurn;
          logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.active_turn_set", {
            selectedModelId: conversationTurnRequest.selectedModelId,
          });
        },
        onConversationTurnFinished: () => {
          latestActiveConversationTurnRef.current = undefined;
          logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.active_turn_cleared", {
            selectedModelId: conversationTurnRequest.selectedModelId,
          });
        },
        onAssistantResponseEvents: applyIncomingAssistantResponseEventsToChatScreen,
        diagnosticLogger,
      });
    } finally {
      isPromptSubmissionInFlightRef.current = false;
    }
  });

  const invalidatePendingPromptContextLoads = useEffectEvent(() => {
    latestPromptContextLoadRequestSequenceRef.current += 1;
    if (pendingPromptContextLoadTimeoutRef.current !== undefined) {
      clearTimeout(pendingPromptContextLoadTimeoutRef.current);
      pendingPromptContextLoadTimeoutRef.current = undefined;
    }
  });

  const loadPromptContextCandidatesForQuery = useEffectEvent(
    async (input: {
      requestSequence: number;
      promptContextQueryIdentity: PromptContextQueryIdentity;
      promptContextQueryText: string;
    }) => {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_load_started", {
        requestSequence: input.requestSequence,
        promptContextQueryLength: input.promptContextQueryText.length,
      });
      const promptContextCandidates = await props.loadPromptContextCandidates(input.promptContextQueryText);
      if (input.requestSequence !== latestPromptContextLoadRequestSequenceRef.current) {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_load_discarded", {
          requestSequence: input.requestSequence,
          activeRequestSequence: latestPromptContextLoadRequestSequenceRef.current,
          promptContextCandidateCount: promptContextCandidates.length,
        });
        return;
      }

      const refreshedActivePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
        latestChatSessionStateRef.current.promptDraft,
        latestChatSessionStateRef.current.promptDraftCursorOffset,
      );
      const refreshedPromptContextQueryIdentity = buildPromptContextQueryIdentity(refreshedActivePromptContextQuery);
      if (
        shouldHideResolvedPromptContextCandidatesForQuery({
          currentPromptContextQueryIdentity: refreshedPromptContextQueryIdentity,
          dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
          requestedPromptContextQueryIdentity: input.promptContextQueryIdentity,
        })
      ) {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_load_hidden_after_resolution", {
          requestSequence: input.requestSequence,
          promptContextCandidateCount: promptContextCandidates.length,
        });
        return;
      }

      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_load_completed", {
        requestSequence: input.requestSequence,
        promptContextQueryLength: input.promptContextQueryText.length,
        promptContextCandidateCount: promptContextCandidates.length,
      });

      setChatSessionState((currentChatSessionState) =>
        currentChatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" &&
          currentChatSessionState.promptContextSelectionState.promptContextQueryText === input.promptContextQueryText
          ? refreshPromptContextCandidatesForSelection(
            currentChatSessionState,
            input.promptContextQueryText,
            promptContextCandidates,
          )
          : showPromptContextCandidatesForSelection(
            currentChatSessionState,
            input.promptContextQueryText,
            promptContextCandidates,
          ),
      );
    },
  );

  const refreshPromptContextSelectionForCurrentDraft = useEffectEvent(async () => {
    const latestChatSessionState = latestChatSessionStateRef.current;
    const shouldHidePromptContextSelection =
      latestChatSessionState.isCommandHelpModalVisible ||
      latestChatSessionState.conversationTurnStatus !== "waiting_for_user_input" ||
      latestChatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
      latestChatSessionState.conversationSessionSelectionState.step !== "hidden" ||
      latestChatSessionState.slashCommandSelectionState.step !== "hidden";
    if (shouldHidePromptContextSelection) {
      invalidatePendingPromptContextLoads();
      if (latestChatSessionState.promptContextSelectionState.step !== "hidden") {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_selection_hidden", {
          reason: "interaction_scope_changed",
          conversationTurnStatus: latestChatSessionState.conversationTurnStatus,
          modelSelectionStep: latestChatSessionState.modelAndReasoningSelectionState.step,
        });
      }
      setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
      return;
    }

    const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
      latestChatSessionState.promptDraft,
      latestChatSessionState.promptDraftCursorOffset,
    );
    if (!activePromptContextQuery) {
      invalidatePendingPromptContextLoads();
      if (latestChatSessionState.promptContextSelectionState.step !== "hidden") {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_selection_hidden", {
          reason: "no_active_query",
        });
      }
      setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
      return;
    }

    const requestedPromptContextQueryIdentity = buildPromptContextQueryIdentity(activePromptContextQuery);
    if (!requestedPromptContextQueryIdentity) {
      return;
    }

    if (doPromptContextQueriesMatch(requestedPromptContextQueryIdentity, dismissedPromptContextQueryRef.current)) {
      invalidatePendingPromptContextLoads();
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_selection_hidden", {
        reason: "query_dismissed",
        promptContextQueryLength: activePromptContextQuery.decodedQueryText.length,
      });
      setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
      return;
    }

    if (
      latestChatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" &&
      latestChatSessionState.promptContextSelectionState.promptContextQueryText === activePromptContextQuery.decodedQueryText
    ) {
      return;
    }

    invalidatePendingPromptContextLoads();
    const requestSequence = latestPromptContextLoadRequestSequenceRef.current;
    const promptContextQueryLoadStrategy = determinePromptContextQueryLoadStrategy(activePromptContextQuery.decodedQueryText);
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_load_scheduled", {
      requestSequence,
      promptContextQueryLength: activePromptContextQuery.decodedQueryText.length,
      promptContextQueryLoadStrategy,
    });

    if (promptContextQueryLoadStrategy === "fuzzy_query") {
      pendingPromptContextLoadTimeoutRef.current = setTimeout(() => {
        pendingPromptContextLoadTimeoutRef.current = undefined;
        void loadPromptContextCandidatesForQuery({
          requestSequence,
          promptContextQueryIdentity: requestedPromptContextQueryIdentity,
          promptContextQueryText: activePromptContextQuery.decodedQueryText,
        });
      }, FUZZY_PROMPT_CONTEXT_QUERY_DEBOUNCE_MS);
      return;
    }

    void loadPromptContextCandidatesForQuery({
      requestSequence,
      promptContextQueryIdentity: requestedPromptContextQueryIdentity,
      promptContextQueryText: activePromptContextQuery.decodedQueryText,
    });
  });

  useEffect(
    () => () => {
      if (pendingPromptContextLoadTimeoutRef.current !== undefined) {
        clearTimeout(pendingPromptContextLoadTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshPromptContextSelectionForCurrentDraft();
  }, [
    chatSessionState.promptDraft,
    chatSessionState.promptDraftCursorOffset,
    chatSessionState.conversationTurnStatus,
    chatSessionState.modelAndReasoningSelectionState.step,
    chatSessionState.conversationSessionSelectionState.step,
    chatSessionState.slashCommandSelectionState.step,
    chatSessionState.isCommandHelpModalVisible,
  ]);

  useEffect(() => {
    setChatSessionState((currentChatSessionState) => {
      const shouldHideSlashCommandSelection =
        currentChatSessionState.isCommandHelpModalVisible ||
        currentChatSessionState.conversationTurnStatus !== "waiting_for_user_input" ||
        currentChatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
        currentChatSessionState.conversationSessionSelectionState.step !== "hidden" ||
        currentChatSessionState.promptContextSelectionState.step !== "hidden";

      if (shouldHideSlashCommandSelection) {
        return hideSlashCommandSelection(currentChatSessionState);
      }

      return refreshSlashCommandSelectionForPromptDraft(
        currentChatSessionState,
        buildChatSlashCommands({
          isReasoningSummaryVisible: currentChatSessionState.isReasoningSummaryVisible,
          selectedAssistantOperatingMode: currentChatSessionState.selectedAssistantOperatingMode,
        }),
      );
    });
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

  const loadConversationSessionsForSelection = useEffectEvent(async () => {
    if (!props.loadConversationSessions) {
      setChatSessionState((currentChatSessionState) =>
        showConversationSessionSelectionLoadingError(currentChatSessionState, "Session switching is unavailable."),
      );
      return;
    }

    setChatSessionState((currentChatSessionState) => showConversationSessionSelectionLoadingState(currentChatSessionState));
    try {
      const conversationSessions = await props.loadConversationSessions();
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showAvailableConversationSessionsForSelection(
            currentChatSessionState,
            conversationSessions,
            latestActiveConversationSessionIdRef.current,
          ),
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showConversationSessionSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  const switchToConversationSession = useEffectEvent(async (conversationSessionId: string) => {
    if (!props.switchConversationSession) {
      setChatSessionState((currentChatSessionState) =>
        showConversationSessionSelectionLoadingError(currentChatSessionState, "Session switching is unavailable."),
      );
      return;
    }

    try {
      const switchedConversationSession = await props.switchConversationSession(conversationSessionId);
      setActiveConversationSessionId(switchedConversationSession.conversationSessionId);
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          hydrateConversationTranscriptFromSessionEntries(
            currentChatSessionState,
            switchedConversationSession.conversationSessionEntries,
          ),
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showConversationSessionSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  const exportCurrentConversationSession = useEffectEvent(async () => {
    if (!props.exportCurrentConversationSession) {
      setConversationSessionExportStatus({ step: "failed", errorMessage: "Session export is unavailable." });
      return;
    }

    setConversationSessionExportStatus({ step: "idle" });
    try {
      await props.exportCurrentConversationSession();
    } catch (error) {
      setConversationSessionExportStatus({
        step: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const executeSlashCommand = useEffectEvent((slashCommandValue: string) => {
    switch (slashCommandValue) {
      case "help":
        setChatSessionState((currentChatSessionState) => showCommandHelpModal(currentChatSessionState));
        return;
      case "clear":
        const clearedConversationSession = props.onConversationCleared?.();
        if (clearedConversationSession) {
          setActiveConversationSessionId(clearedConversationSession.conversationSessionId);
          setChatSessionState((currentChatSessionState) =>
            hydrateConversationTranscriptFromSessionEntries(
              currentChatSessionState,
              clearedConversationSession.conversationSessionEntries,
            ),
          );
        } else {
          setChatSessionState((currentChatSessionState) => clearConversationTranscript(currentChatSessionState));
        }
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.conversation_cleared");
        return;
      case "sessions":
        void loadConversationSessionsForSelection();
        return;
      case "export-session":
        void exportCurrentConversationSession();
        return;
      case "plan":
        setChatSessionState((currentChatSessionState) => selectAssistantOperatingMode(currentChatSessionState, "plan"));
        return;
      case "implementation":
        setChatSessionState((currentChatSessionState) =>
          selectAssistantOperatingMode(currentChatSessionState, "implementation"),
        );
        return;
      case "model":
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_open_requested", {
          source: "slash_command",
        });
        void loadAvailableModelsForSelection();
        return;
      case "thinking":
        setChatSessionState((currentChatSessionState) => {
          const nextChatSessionState = toggleReasoningSummaryVisibility(currentChatSessionState);
          logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.reasoning_summary_visibility_toggled", {
            isReasoningSummaryVisible: nextChatSessionState.isReasoningSummaryVisible,
          });
          return nextChatSessionState;
        });
        return;
    }
  });

  const submitPendingToolApprovalDecision = useEffectEvent((input: {
    decision: "approved" | "denied";
    source: "button" | "keyboard";
  }) => {
    const pendingToolApprovalRequest = latestChatSessionStateRef.current.pendingToolApprovalRequest;
    if (!pendingToolApprovalRequest) {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        decision: input.decision,
        source: input.source,
        reason: "no_pending_approval",
      });
      return;
    }

    if (submittedToolApprovalDecisionApprovalIdRef.current === pendingToolApprovalRequest.approvalId) {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: input.decision,
        source: input.source,
        reason: "decision_already_submitted",
      });
      return;
    }

    const activeConversationTurn = latestActiveConversationTurnRef.current;
    if (!activeConversationTurn) {
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.tool_approval_decision_ignored", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: input.decision,
        source: input.source,
        reason: "no_active_turn",
      });
      return;
    }

    submittedToolApprovalDecisionApprovalIdRef.current = pendingToolApprovalRequest.approvalId;
    logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.tool_approval_decision_submitted", {
      approvalId: pendingToolApprovalRequest.approvalId,
      pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
      decision: input.decision,
      source: input.source,
    });

    const resetApprovalDecisionGuardAfterFailure = (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.tool_approval_decision_failed", {
        approvalId: pendingToolApprovalRequest.approvalId,
        pendingToolCallId: pendingToolApprovalRequest.pendingToolCallId,
        decision: input.decision,
        source: input.source,
        errorMessage,
      });
      if (latestChatSessionStateRef.current.pendingToolApprovalRequest?.approvalId === pendingToolApprovalRequest.approvalId) {
        submittedToolApprovalDecisionApprovalIdRef.current = undefined;
      }
    };

    try {
      const approvalDecisionPromise = input.decision === "approved"
        ? activeConversationTurn.approvePendingToolCall(pendingToolApprovalRequest.approvalId)
        : activeConversationTurn.denyPendingToolCall(pendingToolApprovalRequest.approvalId);
      void approvalDecisionPromise.catch(resetApprovalDecisionGuardAfterFailure);
    } catch (error) {
      resetApprovalDecisionGuardAfterFailure(error);
    }
  });

  useKeyboard((keyEvent: KeyEvent) => {
    if (chatSessionState.isCommandHelpModalVisible) {
      return;
    }

    const latestChatSessionState = latestChatSessionStateRef.current;
    const interactionScope = resolveChatScreenInteractionScope(latestChatSessionState);

    if (
      interactionScope === "prompt_draft_editing" &&
      latestChatSessionState.conversationTurnStatus === "waiting_for_user_input" &&
      (keyEvent.name === "tab" || keyEvent.sequence === "\t") &&
      !keyEvent.ctrl &&
      !keyEvent.meta
    ) {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      setChatSessionState((currentChatSessionState) => {
        const nextChatSessionState = cycleAssistantOperatingMode(currentChatSessionState);
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.assistant_operating_mode_cycled", {
          selectedAssistantOperatingMode: nextChatSessionState.selectedAssistantOperatingMode,
        });
        return nextChatSessionState;
      });
      return;
    }

    if (interactionScope === "conversation_session_selection") {
      if (keyEvent.name === "escape") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => hideConversationSessionSelection(currentChatSessionState));
        return;
      }

      if (latestChatSessionState.conversationSessionSelectionState.step !== "showing_conversation_sessions") {
        return;
      }

      if (keyEvent.name === "up") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => moveHighlightedConversationSessionSelectionUp(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "down") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => moveHighlightedConversationSessionSelectionDown(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "return") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        const conversationSessionSelection = selectHighlightedConversationSession(latestChatSessionState);
        if (!conversationSessionSelection.selectedConversationSession) {
          return;
        }

        setChatSessionState(conversationSessionSelection.nextChatSessionState);
        void switchToConversationSession(conversationSessionSelection.selectedConversationSession.sessionId);
      }

      return;
    }

    if (interactionScope === "model_selection") {
      if (keyEvent.name === "escape") {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_closed", {
          reason: "keyboard_escape",
        });
        setChatSessionState((currentChatSessionState) => hideModelAndReasoningSelection(currentChatSessionState));
        return;
      }

      if (latestChatSessionState.modelAndReasoningSelectionState.step === "showing_available_models") {
        if (keyEvent.name === "up") {
          setChatSessionState((currentChatSessionState) => moveHighlightedModelSelectionUp(currentChatSessionState));
          return;
        }

        if (keyEvent.name === "down") {
          setChatSessionState((currentChatSessionState) => moveHighlightedModelSelectionDown(currentChatSessionState));
          return;
        }

        if (keyEvent.name === "return") {
          logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.model_selection_confirmed", {
            highlightedModelIndex: latestChatSessionState.modelAndReasoningSelectionState.highlightedModelIndex,
            availableModelCount: latestChatSessionState.modelAndReasoningSelectionState.availableModels.length,
          });
          setChatSessionState((currentChatSessionState) => confirmHighlightedModelSelection(currentChatSessionState));
        }
      }

      return;
    }

    if (interactionScope === "reasoning_effort_selection") {
      const modelAndReasoningSelectionState = latestChatSessionState.modelAndReasoningSelectionState;
      if (modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
        return;
      }

      if (keyEvent.name === "escape") {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.reasoning_selection_closed", {
          reason: "keyboard_escape",
        });
        setChatSessionState((currentChatSessionState) => hideModelAndReasoningSelection(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "up") {
        setChatSessionState((currentChatSessionState) => moveHighlightedReasoningEffortChoiceUp(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "down") {
        setChatSessionState((currentChatSessionState) => moveHighlightedReasoningEffortChoiceDown(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "return") {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.reasoning_selection_confirmed", {
          highlightedReasoningEffortChoiceIndex:
            modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex,
          reasoningEffortChoiceCount:
            modelAndReasoningSelectionState.availableReasoningEffortChoices.length,
        });
        setChatSessionState((currentChatSessionState) => confirmHighlightedReasoningEffortChoice(currentChatSessionState));
      }

      return;
    }

    if (interactionScope === "slash_command_selection") {
      const slashCommandSelectionState = latestChatSessionState.slashCommandSelectionState;
      if (slashCommandSelectionState.step !== "showing_slash_commands") {
        return;
      }

      if (keyEvent.name === "escape") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => hideSlashCommandSelection(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "up") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => moveHighlightedSlashCommandSelectionUp(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "down") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => moveHighlightedSlashCommandSelectionDown(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "return") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        const slashCommandSelection = selectHighlightedSlashCommand(latestChatSessionState);
        const selectedSlashCommand = slashCommandSelection.selectedSlashCommand;
        if (!selectedSlashCommand) {
          return;
        }

        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.slash_command_selected", {
          slashCommand: selectedSlashCommand.value,
        });
        setChatSessionState(slashCommandSelection.nextChatSessionState);
        executeSlashCommand(selectedSlashCommand.value);
        return;
      }

      if (keyEvent.name === "left") {
        setChatSessionState((currentChatSessionState) => movePromptDraftCursorLeft(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "right") {
        setChatSessionState((currentChatSessionState) => movePromptDraftCursorRight(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "backspace") {
        setChatSessionState((currentChatSessionState) => removePromptDraftCharacterBeforeCursor(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "delete") {
        setChatSessionState((currentChatSessionState) => removePromptDraftCharacterAtCursor(currentChatSessionState));
        return;
      }

      if (keyEvent.sequence && !keyEvent.ctrl && !keyEvent.meta && keyEvent.sequence.length === 1) {
        setChatSessionState((currentChatSessionState) =>
          insertTextIntoPromptDraftAtCursor(currentChatSessionState, keyEvent.sequence),
        );
      }

      return;
    }

    if (interactionScope === "prompt_context_selection") {
      const promptContextSelectionState = latestChatSessionState.promptContextSelectionState;
      if (promptContextSelectionState.step !== "showing_prompt_context_candidates") {
        return;
      }

      if (keyEvent.name === "escape") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_selection_closed", {
          reason: "keyboard_escape",
          promptContextCandidateCount: promptContextSelectionState.promptContextCandidates.length,
        });
        dismissedPromptContextQueryRef.current = buildPromptContextQueryIdentity(
          extractActivePromptContextQueryFromPromptDraft(
            latestChatSessionState.promptDraft,
            latestChatSessionState.promptDraftCursorOffset,
          ),
        );
        setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "up") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => moveHighlightedPromptContextCandidateUp(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "down") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        setChatSessionState((currentChatSessionState) => moveHighlightedPromptContextCandidateDown(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "return") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_context_candidate_selected", {
          highlightedPromptContextCandidateIndex: promptContextSelectionState.highlightedPromptContextCandidateIndex,
          promptContextCandidateCount: promptContextSelectionState.promptContextCandidates.length,
        });
        setChatSessionState((currentChatSessionState) => selectHighlightedPromptContextCandidate(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "left") {
        setChatSessionState((currentChatSessionState) => movePromptDraftCursorLeft(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "right") {
        setChatSessionState((currentChatSessionState) => movePromptDraftCursorRight(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "backspace") {
        setChatSessionState((currentChatSessionState) => removePromptDraftCharacterBeforeCursor(currentChatSessionState));
        return;
      }

      if (keyEvent.name === "delete") {
        setChatSessionState((currentChatSessionState) => removePromptDraftCharacterAtCursor(currentChatSessionState));
        return;
      }

      if (keyEvent.sequence && !keyEvent.ctrl && !keyEvent.meta && keyEvent.sequence.length === 1) {
        setChatSessionState((currentChatSessionState) =>
          insertTextIntoPromptDraftAtCursor(currentChatSessionState, keyEvent.sequence),
        );
      }

      return;
    }

    if (interactionScope === "tool_approval") {
      if (!keyEvent.ctrl && !keyEvent.meta && keyEvent.sequence?.toLowerCase() === "y") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        submitPendingToolApprovalDecision({ decision: "approved", source: "keyboard" });
        return;
      }

      if (!keyEvent.ctrl && !keyEvent.meta && keyEvent.sequence?.toLowerCase() === "n") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        submitPendingToolApprovalDecision({ decision: "denied", source: "keyboard" });
        return;
      }

      return;
    }

    if (keyEvent.name === "left") {
      setChatSessionState((currentChatSessionState) => movePromptDraftCursorLeft(currentChatSessionState));
      return;
    }

    if (keyEvent.name === "right") {
      setChatSessionState((currentChatSessionState) => movePromptDraftCursorRight(currentChatSessionState));
      return;
    }

    if (keyEvent.name === "return") {
      if (isPromptSubmissionInFlightRef.current) {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_submission_ignored", {
          promptDraftLength: latestChatSessionState.promptDraft.length,
          conversationTurnStatus: latestChatSessionState.conversationTurnStatus,
          promptContextSelectionStep: latestChatSessionState.promptContextSelectionState.step,
          modelSelectionStep: latestChatSessionState.modelAndReasoningSelectionState.step,
          reason: "prompt_submission_already_in_flight",
        });
        return;
      }

      const promptDraftSubmission = submitPromptDraft(latestChatSessionState);
      if (!promptDraftSubmission.submittedPromptText) {
        logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_submission_ignored", {
          promptDraftLength: latestChatSessionState.promptDraft.length,
          conversationTurnStatus: latestChatSessionState.conversationTurnStatus,
          promptContextSelectionStep: latestChatSessionState.promptContextSelectionState.step,
          modelSelectionStep: latestChatSessionState.modelAndReasoningSelectionState.step,
          reason: "not_submittable",
        });
        return;
      }

      isPromptSubmissionInFlightRef.current = true;
      logChatScreenDiagnosticEvent(diagnosticLogger, "chat_screen.prompt_submitted", {
        submittedPromptLength: promptDraftSubmission.submittedPromptText.length,
        selectedModelId: latestChatSessionState.selectedModelId,
        selectedReasoningEffort: latestChatSessionState.selectedReasoningEffort ?? null,
      });
      setChatSessionState(promptDraftSubmission.nextChatSessionState);
      scrollConversationMessagesToBottom();
      void streamAssistantResponseForSubmittedPrompt(promptDraftSubmission.submittedPromptText);
      return;
    }

    if (keyEvent.name === "backspace") {
      setChatSessionState((currentChatSessionState) => removePromptDraftCharacterBeforeCursor(currentChatSessionState));
      return;
    }

    if (keyEvent.name === "delete") {
      setChatSessionState((currentChatSessionState) => removePromptDraftCharacterAtCursor(currentChatSessionState));
      return;
    }

    if (keyEvent.sequence && !keyEvent.ctrl && !keyEvent.meta && keyEvent.sequence.length === 1) {
      setChatSessionState((currentChatSessionState) =>
        insertTextIntoPromptDraftAtCursor(currentChatSessionState, keyEvent.sequence),
      );
    }
  });

  const modelAndReasoningSelectionPane =
    chatSessionState.modelAndReasoningSelectionState.step === "loading_available_models" ? (
      <box alignItems="center" flexGrow={1} justifyContent="center">
        <text fg={chatScreenTheme.accentAmber}>Loading models...</text>
      </box>
    ) : chatSessionState.modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
      <ErrorBannerBlock
        titleText="Could not load models"
        errorText={chatSessionState.modelAndReasoningSelectionState.errorMessage}
      />
    ) : chatSessionState.modelAndReasoningSelectionState.step === "showing_available_models" ? (
      <ModelAndReasoningSelectionPane
        visibleChoices={chatSessionState.modelAndReasoningSelectionState.availableModels.map(
          (availableAssistantModel) => availableAssistantModel.displayName,
        )}
        highlightedChoiceIndex={chatSessionState.modelAndReasoningSelectionState.highlightedModelIndex}
        headingText="Choose model"
      />
    ) : chatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices" ? (
      <ModelAndReasoningSelectionPane
        visibleChoices={chatSessionState.modelAndReasoningSelectionState.availableReasoningEffortChoices.map(
          (availableReasoningEffortChoice) => availableReasoningEffortChoice.displayLabel,
        )}
        highlightedChoiceIndex={
          chatSessionState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex
        }
        headingText={`Choose reasoning for ${chatSessionState.modelAndReasoningSelectionState.selectedModel.displayName}`}
      />
    ) : null;

  const isPromptInputDisabled =
    chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden" ||
    chatSessionState.conversationSessionSelectionState.step !== "hidden";
  const availableChatSlashCommands = buildChatSlashCommands({
    isReasoningSummaryVisible: chatSessionState.isReasoningSummaryVisible,
    selectedAssistantOperatingMode: chatSessionState.selectedAssistantOperatingMode,
  });

  const slashCommandSelectionPane =
    chatSessionState.slashCommandSelectionState.step === "showing_slash_commands" ? (
      <SlashCommandSelectionPane
        availableSlashCommands={chatSessionState.slashCommandSelectionState.availableSlashCommands}
        highlightedSlashCommandIndex={chatSessionState.slashCommandSelectionState.highlightedSlashCommandIndex}
      />
    ) : null;

  const conversationSessionSelectionPane =
    chatSessionState.conversationSessionSelectionState.step === "loading_conversation_sessions" ? (
      <box
        borderStyle="rounded"
        borderColor={chatScreenTheme.border}
        backgroundColor={chatScreenTheme.surfaceOne}
        flexDirection="column"
        flexShrink={0}
        marginX={2}
        marginBottom={1}
        paddingX={1}
      >
        <text fg={chatScreenTheme.textMuted}>Sessions</text>
        <text fg={chatScreenTheme.textSecondary}>Loading sessions...</text>
      </box>
    ) : chatSessionState.conversationSessionSelectionState.step === "showing_session_loading_error" ? (
      <box paddingX={2} marginBottom={1}>
        <ErrorBannerBlock
          titleText="Could not load sessions"
          errorText={chatSessionState.conversationSessionSelectionState.errorMessage}
        />
      </box>
    ) : chatSessionState.conversationSessionSelectionState.step === "showing_conversation_sessions" ? (
      <ConversationSessionSelectionPane
        conversationSessions={chatSessionState.conversationSessionSelectionState.conversationSessions}
        highlightedConversationSessionIndex={
          chatSessionState.conversationSessionSelectionState.highlightedConversationSessionIndex
        }
        activeConversationSessionId={chatSessionState.conversationSessionSelectionState.activeConversationSessionId}
      />
    ) : null;

  const promptContextSelectionPane =
    chatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" ? (
      <PromptContextSelectionPane
        promptContextCandidates={chatSessionState.promptContextSelectionState.promptContextCandidates}
        highlightedPromptContextCandidateIndex={
          chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex
        }
      />
    ) : null;

  const conversationSessionExportStatusPane =
    conversationSessionExportStatus.step === "failed" ? (
      <box paddingX={2} marginBottom={1}>
        <ErrorBannerBlock titleText="Could not export session" errorText={conversationSessionExportStatus.errorMessage} />
      </box>
    ) : null;

  const homeDirectoryPath = os.homedir();
  const rawWorkingDirectoryPath = process.cwd();
  const workingDirectoryPath = rawWorkingDirectoryPath.startsWith(homeDirectoryPath)
    ? `~${rawWorkingDirectoryPath.slice(homeDirectoryPath.length)}`
    : rawWorkingDirectoryPath;
  const modeLabel = chatSessionState.selectedAssistantOperatingMode;
  const inputPanelAccentColor = chatSessionState.selectedAssistantOperatingMode === "plan"
    ? chatScreenTheme.accentAmber
    : chatScreenTheme.accentGreen;
  const promptInputHintOverride = chatSessionState.selectedAssistantOperatingMode === "plan"
    ? "read-only planning mode · tab to implementation"
    : undefined;
  const reasoningEffortLabel =
    chatSessionState.selectedReasoningEffort ?? chatSessionState.selectedModelDefaultReasoningEffort ?? "default";
  const inputRegionRowCount =
    terminalSizeTierForChatScreen === minimumTerminalSizeTier
      ? MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT
      : INPUT_PANEL_NATURAL_ROW_COUNT;
  const promptInputRegionColumnCount = Math.min(columns, PROMPT_INPUT_REGION_MAX_WIDTH_IN_CELLS);
  const availableCommandHelpModalRowCount = Math.max(
    0,
    rows - TOP_BAR_NATURAL_ROW_COUNT - CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT - inputRegionRowCount,
  );
  const totalContextTokensUsed =
    chatSessionState.latestTokenUsage?.total ??
    (chatSessionState.latestTokenUsage
      ? chatSessionState.latestTokenUsage.input +
      chatSessionState.latestTokenUsage.output +
      chatSessionState.latestTokenUsage.reasoning
      : undefined);
  const contextWindowTokenCapacity = lookupContextWindowTokenCapacityForModel(chatSessionState.selectedModelId);
  const orderedConversationMessages = listOrderedConversationMessages(chatSessionState);
  const orderedConversationMessagePartCount = orderedConversationMessages.reduce(
    (conversationMessagePartCount, conversationMessage) => conversationMessagePartCount + conversationMessage.partIds.length,
    0,
  );

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
        {chatSessionState.isCommandHelpModalVisible ? (
          <box alignItems="center" flexGrow={1} justifyContent="center">
            <CommandHelpModal
              onCloseRequested={() =>
                setChatSessionState((currentChatSessionState) => hideCommandHelpModal(currentChatSessionState))
              }
              availableModalRowCount={availableCommandHelpModalRowCount}
              terminalSizeTierForChatScreen={terminalSizeTierForChatScreen}
              availableSlashCommands={availableChatSlashCommands}
            />
          </box>
        ) : modelAndReasoningSelectionPane ? (
          modelAndReasoningSelectionPane
        ) : (
          <ConversationMessageList
            conversationMessages={orderedConversationMessages}
            isReasoningSummaryVisible={chatSessionState.isReasoningSummaryVisible}
            resolveConversationMessageParts={(messageId) =>
              listOrderedConversationMessageParts(chatSessionState, messageId)
            }
            conversationMessageScrollBoxRef={conversationMessageScrollBoxRef}
            onConversationMessageWheelScroll={(direction) =>
              scrollConversationMessagesByRows(direction === "up" ? -TRANSCRIPT_WHEEL_SCROLL_ROW_COUNT : TRANSCRIPT_WHEEL_SCROLL_ROW_COUNT)
            }
          />
        )}
      </box>
      <box flexDirection="column" flexShrink={0}>
        {chatSessionState.pendingToolApprovalRequest ? (
          <box paddingX={2}>
            <ToolApprovalRequestBlock
              riskExplanation={chatSessionState.pendingToolApprovalRequest.riskExplanation}
              onApprove={() => {
                submitPendingToolApprovalDecision({ decision: "approved", source: "button" });
              }}
              onDeny={() => {
                submitPendingToolApprovalDecision({ decision: "denied", source: "button" });
              }}
            />
          </box>
        ) : null}
        {conversationSessionExportStatusPane}
        {conversationSessionSelectionPane}
        {slashCommandSelectionPane}
        {promptContextSelectionPane}
        <box
          alignSelf="center"
          flexDirection="column"
          flexShrink={0}
          width={promptInputRegionColumnCount}
        >
          {terminalSizeTierForChatScreen === minimumTerminalSizeTier ? (
            <MinimumHeightPromptStrip
              promptDraft={chatSessionState.promptDraft}
              promptDraftCursorOffset={chatSessionState.promptDraftCursorOffset}
              selectedPromptContextReferenceTexts={chatSessionState.selectedPromptContextReferenceTexts}
              isPromptInputDisabled={isPromptInputDisabled}
              accentColor={inputPanelAccentColor}
              assistantResponseStatus={chatSessionState.conversationTurnStatus}
            />
          ) : (
            <InputPanel
              promptDraft={chatSessionState.promptDraft}
              promptDraftCursorOffset={chatSessionState.promptDraftCursorOffset}
              selectedPromptContextReferenceTexts={chatSessionState.selectedPromptContextReferenceTexts}
              isPromptInputDisabled={isPromptInputDisabled}
              {...(promptInputHintOverride !== undefined ? { promptInputHintOverride } : {})}
              accentColor={inputPanelAccentColor}
              modeLabel={modeLabel}
              modelIdentifier={chatSessionState.selectedModelId}
              reasoningEffortLabel={reasoningEffortLabel}
              assistantResponseStatus={chatSessionState.conversationTurnStatus}
              totalContextTokensUsed={totalContextTokensUsed}
              contextWindowTokenCapacity={contextWindowTokenCapacity}
            />
          )}
        </box>
      </box>
    </box>
  );
}
