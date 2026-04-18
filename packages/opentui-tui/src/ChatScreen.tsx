import os from "node:os";
import { type AssistantResponseEvent, type AvailableAssistantModel, type ReasoningEffort } from "@buli/contracts";
import {
  determinePromptContextQueryLoadStrategy,
  extractActivePromptContextQueryFromPromptDraft,
  type ActiveConversationTurn,
  type AssistantConversationRunner,
  type PromptContextCandidate,
} from "@buli/engine";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme, minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import {
  createInitialConversationTranscriptViewportState,
  jumpConversationTranscriptViewportToNewestRows,
  jumpConversationTranscriptViewportToOldestRows,
  reconcileConversationTranscriptViewportAfterObservedScrollPosition,
  reconcileConversationTranscriptViewportAfterMeasurement,
  scrollConversationTranscriptViewportDownByPage,
  scrollConversationTranscriptViewportDownByRows,
  scrollConversationTranscriptViewportUpByPage,
  scrollConversationTranscriptViewportUpByRows,
  type ConversationTranscriptViewportMeasurements,
  type ConversationTranscriptViewportState,
} from "./conversationTranscriptViewportState.ts";
import { ConversationTranscriptPane } from "./components/ConversationTranscriptPane.tsx";
import { InputPanel, INPUT_PANEL_NATURAL_ROW_COUNT } from "./components/InputPanel.tsx";
import {
  MinimumHeightPromptStrip,
  MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT,
} from "./components/MinimumHeightPromptStrip.tsx";
import { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
import { PromptContextSelectionPane } from "./components/PromptContextSelectionPane.tsx";
import { ShortcutsModal } from "./components/ShortcutsModal.tsx";
import { TopBar, TOP_BAR_NATURAL_ROW_COUNT } from "./components/TopBar.tsx";
import { ErrorBannerBlock } from "./components/behavior/ErrorBannerBlock.tsx";
import { useTerminalSizeTierForChatScreen } from "./components/behavior/useTerminalSizeTierForChatScreen.ts";

// The chat screen's middle area renders with paddingTop=1 to keep the
// transcript / modal off the top bar's surface fill. Owned here because the
// padding is part of ChatScreen's layout, not a leaf component's concern.
const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;
const FUZZY_PROMPT_CONTEXT_QUERY_DEBOUNCE_MS = 120;
import {
  applyAssistantResponseEventToChatScreenState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatScreenState,
  hidePromptContextSelection,
  hideModelAndReasoningSelection,
  moveHighlightedPromptContextCandidateDown,
  moveHighlightedPromptContextCandidateUp,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  hideShortcutsHelpModal,
  insertTextIntoPromptDraftAtCursor,
  movePromptDraftCursorLeft,
  movePromptDraftCursorRight,
  removePromptDraftCharacterAtCursor,
  removePromptDraftCharacterBeforeCursor,
  refreshPromptContextCandidatesForSelection,
  selectHighlightedPromptContextCandidate,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showPromptContextCandidatesForSelection,
  showShortcutsHelpModal,
  submitPromptDraft,
  type ChatScreenState,
} from "./chatScreenState.ts";
import { lookupContextWindowTokenCapacityForModel } from "./modelContextWindowCapacity.ts";
import {
  buildPromptContextQueryIdentity,
  doPromptContextQueriesMatch,
  shouldHideResolvedPromptContextCandidatesForQuery,
  type PromptContextQueryIdentity,
} from "./promptContextQueryIdentity.ts";
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  assistantConversationRunner: AssistantConversationRunner;
};

type ChatScreenInteractionScope =
  | "shortcuts_help_modal"
  | "model_selection"
  | "reasoning_effort_selection"
  | "prompt_context_selection"
  | "tool_approval"
  | "prompt_draft_editing";

function resolveChatScreenInteractionScope(chatScreenState: ChatScreenState): ChatScreenInteractionScope {
  if (chatScreenState.isShortcutsHelpModalVisible) {
    return "shortcuts_help_modal";
  }

  if (chatScreenState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices") {
    return "reasoning_effort_selection";
  }

  if (chatScreenState.modelAndReasoningSelectionState.step !== "hidden") {
    return "model_selection";
  }

  if (chatScreenState.promptContextSelectionState.step !== "hidden") {
    return "prompt_context_selection";
  }

  if (
    chatScreenState.assistantResponseStatus === "waiting_for_tool_approval" &&
    chatScreenState.currentPendingToolApprovalId
  ) {
    return "tool_approval";
  }

  return "prompt_draft_editing";
}

export function ChatScreen(props: ChatScreenProps) {
  const { height: rows } = useTerminalDimensions();
  const terminalSizeTierForChatScreen = useTerminalSizeTierForChatScreen();

  const [chatScreenState, setChatScreenState] = useState(() =>
    createInitialChatScreenState({
      selectedModelId: props.selectedModelId,
      ...(props.selectedReasoningEffort ? { selectedReasoningEffort: props.selectedReasoningEffort } : {}),
    }),
  );
  const [conversationTranscriptViewportState, setConversationTranscriptViewportState] = useState<ConversationTranscriptViewportState>(
    () => createInitialConversationTranscriptViewportState(),
  );
  const [latestConversationTranscriptViewportMeasurements, setLatestConversationTranscriptViewportMeasurements] =
    useState<ConversationTranscriptViewportMeasurements | undefined>(undefined);

  // Keyboard handlers and async callbacks created by useEffectEvent close
  // over a stale state snapshot; these refs give them a hatch to the newest
  // value without re-subscribing on every render.
  const latestChatScreenStateRef = useRef<ChatScreenState>(chatScreenState);
  const latestActiveConversationTurnRef = useRef<ActiveConversationTurn | undefined>(undefined);
  const latestConversationTranscriptViewportMeasurementsRef = useRef<ConversationTranscriptViewportMeasurements | undefined>(
    latestConversationTranscriptViewportMeasurements,
  );
  const latestPromptContextLoadRequestSequenceRef = useRef(0);
  const pendingPromptContextLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissedPromptContextQueryRef = useRef<PromptContextQueryIdentity | undefined>(undefined);

  latestChatScreenStateRef.current = chatScreenState;
  latestConversationTranscriptViewportMeasurementsRef.current = latestConversationTranscriptViewportMeasurements;

  useEffect(() => {
    const currentPromptContextQueryIdentity = buildPromptContextQueryIdentity(
      extractActivePromptContextQueryFromPromptDraft(chatScreenState.promptDraft, chatScreenState.promptDraftCursorOffset),
    );

    if (!doPromptContextQueriesMatch(currentPromptContextQueryIdentity, dismissedPromptContextQueryRef.current)) {
      dismissedPromptContextQueryRef.current = undefined;
    }
  }, [chatScreenState.promptDraft, chatScreenState.promptDraftCursorOffset]);

  // During rapid streaming the transcript pane fires height measurements
  // dozens of times per second. Each measurement schedules a state update
  // that forces another full repaint. We coalesce them into at most one
  // dispatch per MIN_INTERVAL_MS so we paint the new content + new offset
  // together rather than once per chunk.
  const lastMeasurementFlushAtMsRef = useRef(0);
  const pendingMeasurementRef = useRef<ConversationTranscriptViewportMeasurements | undefined>(undefined);
  const scheduledMeasurementFlushRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const MEASUREMENT_FLUSH_MIN_INTERVAL_MS = 120;

  const flushMeasurementToState = useEffectEvent(
    (conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements) => {
      // startTransition deprioritises the measurement-driven state updates
      // so they don't preempt user keystrokes routed through useKeyboard.
      startTransition(() => {
        setLatestConversationTranscriptViewportMeasurements((currentConversationTranscriptViewportMeasurements) => {
          if (
            currentConversationTranscriptViewportMeasurements?.visibleViewportHeightInRows ===
              conversationTranscriptViewportMeasurements.visibleViewportHeightInRows &&
            currentConversationTranscriptViewportMeasurements.fullTranscriptContentHeightInRows ===
              conversationTranscriptViewportMeasurements.fullTranscriptContentHeightInRows
          ) {
            return currentConversationTranscriptViewportMeasurements;
          }
          return conversationTranscriptViewportMeasurements;
        });

        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) => {
          const nextConversationTranscriptViewportState = reconcileConversationTranscriptViewportAfterMeasurement(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
          );
          if (
            nextConversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport ===
              currentConversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport &&
            nextConversationTranscriptViewportState.isFollowingNewestTranscriptRows ===
              currentConversationTranscriptViewportState.isFollowingNewestTranscriptRows
          ) {
            return currentConversationTranscriptViewportState;
          }
          return nextConversationTranscriptViewportState;
        });
      });
    },
  );

  const applyMeasuredConversationTranscriptViewport = useEffectEvent(
    (conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements) => {
      const nowMs = Date.now();
      const elapsedSinceLastFlushMs = nowMs - lastMeasurementFlushAtMsRef.current;

      if (elapsedSinceLastFlushMs >= MEASUREMENT_FLUSH_MIN_INTERVAL_MS) {
        lastMeasurementFlushAtMsRef.current = nowMs;
        flushMeasurementToState(conversationTranscriptViewportMeasurements);
        return;
      }

      // Inside the throttle window: keep the most recent measurement and
      // schedule a single trailing-edge flush. Repeated calls collapse onto
      // the already-scheduled timer.
      pendingMeasurementRef.current = conversationTranscriptViewportMeasurements;
      if (scheduledMeasurementFlushRef.current) {
        return;
      }
      scheduledMeasurementFlushRef.current = setTimeout(() => {
        scheduledMeasurementFlushRef.current = undefined;
        const pendingMeasurement = pendingMeasurementRef.current;
        if (!pendingMeasurement) {
          return;
        }
        pendingMeasurementRef.current = undefined;
        lastMeasurementFlushAtMsRef.current = Date.now();
        flushMeasurementToState(pendingMeasurement);
      }, MEASUREMENT_FLUSH_MIN_INTERVAL_MS - elapsedSinceLastFlushMs);
    },
  );

  const applyIncomingAssistantResponseEventToChatScreen = useEffectEvent((assistantResponseEvent: AssistantResponseEvent) => {
    startTransition(() => {
      setChatScreenState((currentChatScreenState) =>
        applyAssistantResponseEventToChatScreenState(currentChatScreenState, assistantResponseEvent),
      );
    });
  });

  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPromptText: string) => {
    const conversationTurnRequest = {
      userPromptText: submittedPromptText,
      selectedModelId: latestChatScreenStateRef.current.selectedModelId,
      ...(latestChatScreenStateRef.current.selectedReasoningEffort
        ? { selectedReasoningEffort: latestChatScreenStateRef.current.selectedReasoningEffort }
        : {}),
    };

    await relayAssistantResponseRunnerEvents({
      assistantConversationRunner: props.assistantConversationRunner,
      conversationTurnRequest,
      onConversationTurnStarted: (activeConversationTurn) => {
        latestActiveConversationTurnRef.current = activeConversationTurn;
      },
      onConversationTurnFinished: () => {
        latestActiveConversationTurnRef.current = undefined;
      },
      onAssistantResponseEvent: applyIncomingAssistantResponseEventToChatScreen,
    });
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
      const promptContextCandidates = await props.loadPromptContextCandidates(input.promptContextQueryText);
      if (input.requestSequence !== latestPromptContextLoadRequestSequenceRef.current) {
        return;
      }

      const refreshedActivePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
        latestChatScreenStateRef.current.promptDraft,
        latestChatScreenStateRef.current.promptDraftCursorOffset,
      );
      const refreshedPromptContextQueryIdentity = buildPromptContextQueryIdentity(refreshedActivePromptContextQuery);
      if (shouldHideResolvedPromptContextCandidatesForQuery({
        currentPromptContextQueryIdentity: refreshedPromptContextQueryIdentity,
        dismissedPromptContextQueryIdentity: dismissedPromptContextQueryRef.current,
        requestedPromptContextQueryIdentity: input.promptContextQueryIdentity,
      })) {
        return;
      }

      setChatScreenState((currentChatScreenState) =>
        currentChatScreenState.promptContextSelectionState.step === "showing_prompt_context_candidates" &&
        currentChatScreenState.promptContextSelectionState.promptContextQueryText === input.promptContextQueryText
          ? refreshPromptContextCandidatesForSelection(
              currentChatScreenState,
              input.promptContextQueryText,
              promptContextCandidates,
            )
          : showPromptContextCandidatesForSelection(
              currentChatScreenState,
              input.promptContextQueryText,
              promptContextCandidates,
            ),
      );
    },
  );

  const refreshPromptContextSelectionForCurrentDraft = useEffectEvent(async () => {
    const latestChatScreenState = latestChatScreenStateRef.current;
    const shouldHidePromptContextSelection =
      latestChatScreenState.isShortcutsHelpModalVisible ||
      latestChatScreenState.assistantResponseStatus !== "waiting_for_user_input" ||
      latestChatScreenState.modelAndReasoningSelectionState.step !== "hidden";
    if (shouldHidePromptContextSelection) {
      invalidatePendingPromptContextLoads();
      setChatScreenState((currentChatScreenState) => hidePromptContextSelection(currentChatScreenState));
      return;
    }

    const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
      latestChatScreenState.promptDraft,
      latestChatScreenState.promptDraftCursorOffset,
    );
    if (!activePromptContextQuery) {
      invalidatePendingPromptContextLoads();
      setChatScreenState((currentChatScreenState) => hidePromptContextSelection(currentChatScreenState));
      return;
    }

    const requestedPromptContextQueryIdentity = buildPromptContextQueryIdentity(activePromptContextQuery);
    if (!requestedPromptContextQueryIdentity) {
      return;
    }

    if (doPromptContextQueriesMatch(requestedPromptContextQueryIdentity, dismissedPromptContextQueryRef.current)) {
      invalidatePendingPromptContextLoads();
      setChatScreenState((currentChatScreenState) => hidePromptContextSelection(currentChatScreenState));
      return;
    }

    if (
      latestChatScreenState.promptContextSelectionState.step === "showing_prompt_context_candidates" &&
      latestChatScreenState.promptContextSelectionState.promptContextQueryText === activePromptContextQuery.decodedQueryText
    ) {
      return;
    }

    invalidatePendingPromptContextLoads();
    const requestSequence = latestPromptContextLoadRequestSequenceRef.current;
    const promptContextQueryLoadStrategy = determinePromptContextQueryLoadStrategy(activePromptContextQuery.decodedQueryText);

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
    chatScreenState.promptDraft,
    chatScreenState.promptDraftCursorOffset,
    chatScreenState.assistantResponseStatus,
    chatScreenState.modelAndReasoningSelectionState.step,
    chatScreenState.isShortcutsHelpModalVisible,
    refreshPromptContextSelectionForCurrentDraft,
  ]);

  const loadAvailableModelsForSelection = useEffectEvent(async () => {
    setChatScreenState((currentChatScreenState) => showModelSelectionLoadingState(currentChatScreenState));

    try {
      const availableAssistantModels = await props.loadAvailableAssistantModels();

      startTransition(() => {
        setChatScreenState((currentChatScreenState) =>
          showAvailableAssistantModelsForSelection(currentChatScreenState, availableAssistantModels),
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      startTransition(() => {
        setChatScreenState((currentChatScreenState) =>
          showModelSelectionLoadingError(currentChatScreenState, errorMessage),
        );
      });
    }
  });

  const scrollConversationTranscriptUpOneRow = useEffectEvent(() => {
    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (!conversationTranscriptViewportMeasurements) {
      return;
    }

    setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
      scrollConversationTranscriptViewportUpByRows(
        currentConversationTranscriptViewportState,
        conversationTranscriptViewportMeasurements,
        1,
      ),
    );
  });

  const scrollConversationTranscriptDownOneRow = useEffectEvent(() => {
    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (!conversationTranscriptViewportMeasurements) {
      return;
    }

    setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
      scrollConversationTranscriptViewportDownByRows(
        currentConversationTranscriptViewportState,
        conversationTranscriptViewportMeasurements,
        1,
      ),
    );
  });

  const scrollConversationTranscriptUpOnePage = useEffectEvent(() => {
    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (!conversationTranscriptViewportMeasurements) {
      return;
    }

    setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
      scrollConversationTranscriptViewportUpByPage(
        currentConversationTranscriptViewportState,
        conversationTranscriptViewportMeasurements,
      ),
    );
  });

  const scrollConversationTranscriptDownOnePage = useEffectEvent(() => {
    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (!conversationTranscriptViewportMeasurements) {
      return;
    }

    setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
      scrollConversationTranscriptViewportDownByPage(
        currentConversationTranscriptViewportState,
        conversationTranscriptViewportMeasurements,
      ),
    );
  });

  const jumpConversationTranscriptToOldestRows = useEffectEvent(() => {
    setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
      jumpConversationTranscriptViewportToOldestRows(currentConversationTranscriptViewportState),
    );
  });

  const jumpConversationTranscriptToNewestRows = useEffectEvent(() => {
    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (!conversationTranscriptViewportMeasurements) {
      return;
    }

    setConversationTranscriptViewportState(
      jumpConversationTranscriptViewportToNewestRows(conversationTranscriptViewportMeasurements),
    );
  });

  const applyObservedConversationTranscriptScrollPosition = useEffectEvent((hiddenTranscriptRowsAboveViewport: number) => {
    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (!conversationTranscriptViewportMeasurements) {
      return;
    }

    setConversationTranscriptViewportState(
      reconcileConversationTranscriptViewportAfterObservedScrollPosition(
        conversationTranscriptViewportMeasurements,
        hiddenTranscriptRowsAboveViewport,
      ),
    );
  });

  useKeyboard((e: KeyEvent) => {
    // The shortcuts modal owns Esc; let ShortcutsModal's own useKeyboard handle it.
    if (chatScreenState.isShortcutsHelpModalVisible) {
      return;
    }

    const latestChatScreenState = latestChatScreenStateRef.current;
    const interactionScope = resolveChatScreenInteractionScope(latestChatScreenState);

    if (interactionScope === "model_selection") {
      if (e.name === "escape") {
        setChatScreenState((currentChatScreenState) => hideModelAndReasoningSelection(currentChatScreenState));
        return;
      }

      if (latestChatScreenState.modelAndReasoningSelectionState.step === "showing_available_models") {
        if (e.name === "up") {
          setChatScreenState((currentChatScreenState) => moveHighlightedModelSelectionUp(currentChatScreenState));
          return;
        }

        if (e.name === "down") {
          setChatScreenState((currentChatScreenState) => moveHighlightedModelSelectionDown(currentChatScreenState));
          return;
        }

        if (e.name === "return") {
          setChatScreenState((currentChatScreenState) => confirmHighlightedModelSelection(currentChatScreenState));
        }
      }

      return;
    }

    if (interactionScope === "reasoning_effort_selection") {
      if (e.name === "escape") {
        setChatScreenState((currentChatScreenState) => hideModelAndReasoningSelection(currentChatScreenState));
        return;
      }

      if (e.name === "up") {
        setChatScreenState((currentChatScreenState) => moveHighlightedReasoningEffortChoiceUp(currentChatScreenState));
        return;
      }

      if (e.name === "down") {
        setChatScreenState((currentChatScreenState) => moveHighlightedReasoningEffortChoiceDown(currentChatScreenState));
        return;
      }

      if (e.name === "return") {
        setChatScreenState((currentChatScreenState) => confirmHighlightedReasoningEffortChoice(currentChatScreenState));
      }

      return;
    }

    if (interactionScope === "prompt_context_selection") {
      if (e.name === "escape") {
        e.preventDefault();
        e.stopPropagation();
        dismissedPromptContextQueryRef.current = buildPromptContextQueryIdentity(
          extractActivePromptContextQueryFromPromptDraft(
            latestChatScreenState.promptDraft,
            latestChatScreenState.promptDraftCursorOffset,
          ),
        );
        setChatScreenState((currentChatScreenState) => hidePromptContextSelection(currentChatScreenState));
        return;
      }

      if (e.name === "up") {
        e.preventDefault();
        e.stopPropagation();
        setChatScreenState((currentChatScreenState) => moveHighlightedPromptContextCandidateUp(currentChatScreenState));
        return;
      }

      if (e.name === "down") {
        e.preventDefault();
        e.stopPropagation();
        setChatScreenState((currentChatScreenState) => moveHighlightedPromptContextCandidateDown(currentChatScreenState));
        return;
      }

      if (e.name === "return") {
        e.preventDefault();
        e.stopPropagation();
        setChatScreenState((currentChatScreenState) => selectHighlightedPromptContextCandidate(currentChatScreenState));
        return;
      }

      if (e.name === "left") {
        setChatScreenState((currentChatScreenState) => movePromptDraftCursorLeft(currentChatScreenState));
        return;
      }

      if (e.name === "right") {
        setChatScreenState((currentChatScreenState) => movePromptDraftCursorRight(currentChatScreenState));
        return;
      }

      if (e.name === "backspace") {
        setChatScreenState((currentChatScreenState) => removePromptDraftCharacterBeforeCursor(currentChatScreenState));
        return;
      }

      if (e.name === "delete") {
        setChatScreenState((currentChatScreenState) => removePromptDraftCharacterAtCursor(currentChatScreenState));
        return;
      }

      if (e.sequence && !e.ctrl && !e.meta && e.sequence.length === 1) {
        setChatScreenState((currentChatScreenState) => insertTextIntoPromptDraftAtCursor(currentChatScreenState, e.sequence));
      }

      return;
    }

    if (interactionScope === "tool_approval") {
      const currentPendingToolApprovalId = latestChatScreenState.currentPendingToolApprovalId;
      if (!currentPendingToolApprovalId) {
        return;
      }

      if (e.sequence === "y" || e.sequence === "Y") {
        void latestActiveConversationTurnRef.current?.approvePendingToolCall(currentPendingToolApprovalId);
        return;
      }

      if (e.sequence === "n" || e.sequence === "N") {
        void latestActiveConversationTurnRef.current?.denyPendingToolCall(currentPendingToolApprovalId);
      }

      return;
    }

    if (e.ctrl && !e.meta && !e.shift && (e.name === "l" || e.sequence === "\f")) {
      if (latestChatScreenState.assistantResponseStatus === "streaming_assistant_response") {
        return;
      }

      void loadAvailableModelsForSelection();
      return;
    }

    if (e.name === "?" && latestChatScreenState.promptDraft.length === 0) {
      setChatScreenState((currentChatScreenState) => showShortcutsHelpModal(currentChatScreenState));
      return;
    }

    if (e.name === "up") {
      scrollConversationTranscriptUpOneRow();
      return;
    }

    if (e.name === "down") {
      scrollConversationTranscriptDownOneRow();
      return;
    }

    if (e.name === "pageup") {
      scrollConversationTranscriptUpOnePage();
      return;
    }

    if (e.name === "pagedown") {
      scrollConversationTranscriptDownOnePage();
      return;
    }

    if (e.name === "home") {
      jumpConversationTranscriptToOldestRows();
      return;
    }

    if (e.name === "end") {
      jumpConversationTranscriptToNewestRows();
      return;
    }

    if (e.name === "left") {
      setChatScreenState((currentChatScreenState) => movePromptDraftCursorLeft(currentChatScreenState));
      return;
    }

    if (e.name === "right") {
      setChatScreenState((currentChatScreenState) => movePromptDraftCursorRight(currentChatScreenState));
      return;
    }

    if (e.name === "return") {
      const promptDraftSubmission = submitPromptDraft(latestChatScreenState);
      if (!promptDraftSubmission.submittedPromptText) {
        return;
      }

      // Phase ordering matters: commit the user message synchronously so the
      // transcript shows it immediately, then kick off streaming which will
      // grow the assistant entry on subsequent events.
      setChatScreenState(promptDraftSubmission.nextChatScreenState);
      void streamAssistantResponseForSubmittedPrompt(promptDraftSubmission.submittedPromptText);
      return;
    }

    if (e.name === "backspace") {
      setChatScreenState((currentChatScreenState) => removePromptDraftCharacterBeforeCursor(currentChatScreenState));
      return;
    }

    if (e.name === "delete") {
      setChatScreenState((currentChatScreenState) => removePromptDraftCharacterAtCursor(currentChatScreenState));
      return;
    }

    if (e.sequence && !e.ctrl && !e.meta && e.sequence.length === 1) {
      setChatScreenState((currentChatScreenState) => insertTextIntoPromptDraftAtCursor(currentChatScreenState, e.sequence));
    }
  });

  const modelAndReasoningSelectionPane =
    chatScreenState.modelAndReasoningSelectionState.step === "loading_available_models" ? (
      <box alignItems="center" flexGrow={1} justifyContent="center">
        <text fg={chatScreenTheme.accentAmber}>{"Loading models..."}</text>
      </box>
    ) : chatScreenState.modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
      <ErrorBannerBlock
        titleText="Could not load models"
        errorText={chatScreenState.modelAndReasoningSelectionState.errorMessage}
        errorHintText="Press Esc to close."
      />
    ) : chatScreenState.modelAndReasoningSelectionState.step === "showing_available_models" ? (
      <ModelAndReasoningSelectionPane
        visibleChoices={chatScreenState.modelAndReasoningSelectionState.availableModels.map(
          (availableAssistantModel) => availableAssistantModel.displayName,
        )}
        highlightedChoiceIndex={chatScreenState.modelAndReasoningSelectionState.highlightedModelIndex}
        headingText="Choose model"
      />
    ) : chatScreenState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices" ? (
      <ModelAndReasoningSelectionPane
        visibleChoices={chatScreenState.modelAndReasoningSelectionState.availableReasoningEffortChoices.map(
          (availableReasoningEffortChoice) => availableReasoningEffortChoice.displayLabel,
        )}
        highlightedChoiceIndex={chatScreenState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex}
        headingText={`Choose reasoning for ${chatScreenState.modelAndReasoningSelectionState.selectedModel.displayName}`}
      />
    ) : null;

  // Idle state intentionally leaves the override undefined so InputPanel
  // renders the coloured `[?] help · shortcuts` footer from the design.
  const promptInputHintOverride = chatScreenState.isShortcutsHelpModalVisible
    ? "[ esc ] close shortcuts"
    : chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
      ? "Selection is open. Press Esc to close it."
      : chatScreenState.promptContextSelectionState.step !== "hidden"
        ? "@ picker · ↑ ↓ choose · enter insert · esc close"
      : chatScreenState.assistantResponseStatus === "waiting_for_tool_approval"
        ? "approval required · [ y ] approve · [ n ] deny"
      : undefined;

  const isPromptInputDisabled =
    chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
    chatScreenState.assistantResponseStatus === "waiting_for_tool_approval" ||
    chatScreenState.modelAndReasoningSelectionState.step !== "hidden";

  const promptContextSelectionPane =
    chatScreenState.promptContextSelectionState.step === "showing_prompt_context_candidates" ? (
      <PromptContextSelectionPane
        promptContextCandidates={chatScreenState.promptContextSelectionState.promptContextCandidates}
        highlightedPromptContextCandidateIndex={
          chatScreenState.promptContextSelectionState.highlightedPromptContextCandidateIndex
        }
      />
    ) : null;

  const homeDirectoryPath = os.homedir();
  const rawWorkingDirectoryPath = process.cwd();
  // Collapse the home prefix to ~ so the path fits comfortably in the top bar.
  const workingDirectoryPath = rawWorkingDirectoryPath.startsWith(homeDirectoryPath)
    ? `~${rawWorkingDirectoryPath.slice(homeDirectoryPath.length)}`
    : rawWorkingDirectoryPath;

  const modeLabel = "implementation";
  const reasoningEffortLabel = chatScreenState.selectedReasoningEffort ?? "default";

  const inputRegionRowCount =
    terminalSizeTierForChatScreen === minimumTerminalSizeTier
      ? MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT
      : INPUT_PANEL_NATURAL_ROW_COUNT;
  const availableShortcutsModalRowCount = Math.max(
    0,
    rows
      - TOP_BAR_NATURAL_ROW_COUNT
      - CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT
      - inputRegionRowCount,
  );
  // latestTokenUsage.total reflects the prompt + completion tokens billed for
  // the most recent turn. Because the Responses API sends the full running
  // context on each turn, that value approximates the current conversation's
  // context-window fill for this session.
  const totalContextTokensUsed =
    chatScreenState.latestTokenUsage?.total ??
    (chatScreenState.latestTokenUsage
      ? chatScreenState.latestTokenUsage.input +
        chatScreenState.latestTokenUsage.output +
        chatScreenState.latestTokenUsage.reasoning
      : undefined);
  const contextWindowTokenCapacity = lookupContextWindowTokenCapacityForModel(chatScreenState.selectedModelId);

  return (
    <box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={rows}>
      <TopBar workingDirectoryPath={workingDirectoryPath} />
      <box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={2} paddingTop={1}>
        {chatScreenState.isShortcutsHelpModalVisible ? (
          <box alignItems="center" flexGrow={1} justifyContent="center">
            <ShortcutsModal
              onCloseRequested={() =>
                setChatScreenState((currentChatScreenState) => hideShortcutsHelpModal(currentChatScreenState))
              }
              availableModalRowCount={availableShortcutsModalRowCount}
              terminalSizeTierForChatScreen={terminalSizeTierForChatScreen}
            />
          </box>
        ) : (
          modelAndReasoningSelectionPane ?? (
            <ConversationTranscriptPane
              conversationTranscriptEntries={chatScreenState.conversationTranscript}
              hiddenTranscriptRowsAboveViewport={conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport}
              isFollowingNewestTranscriptRows={conversationTranscriptViewportState.isFollowingNewestTranscriptRows}
              onConversationTranscriptViewportMeasured={applyMeasuredConversationTranscriptViewport}
              onConversationTranscriptScrollPositionChanged={applyObservedConversationTranscriptScrollPosition}
            />
          )
        )}
      </box>
      <box flexDirection="column" flexShrink={0}>
        {promptContextSelectionPane}
        {terminalSizeTierForChatScreen === minimumTerminalSizeTier ? (
          <MinimumHeightPromptStrip
            promptDraft={chatScreenState.promptDraft}
            promptDraftCursorOffset={chatScreenState.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={chatScreenState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={isPromptInputDisabled}
            assistantResponseStatus={chatScreenState.assistantResponseStatus}
          />
        ) : (
          <InputPanel
            promptDraft={chatScreenState.promptDraft}
            promptDraftCursorOffset={chatScreenState.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={chatScreenState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={isPromptInputDisabled}
            {...(promptInputHintOverride !== undefined ? { promptInputHintOverride } : {})}
            modeLabel={modeLabel}
            modelIdentifier={chatScreenState.selectedModelId}
            reasoningEffortLabel={reasoningEffortLabel}
            assistantResponseStatus={chatScreenState.assistantResponseStatus}
            totalContextTokensUsed={totalContextTokensUsed}
            contextWindowTokenCapacity={contextWindowTokenCapacity}
          />
        )}
      </box>
    </box>
  );
}
