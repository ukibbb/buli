import os from "node:os";
import { type AssistantResponseEvent, type AvailableAssistantModel, type ReasoningEffort } from "@buli/contracts";
import { type AssistantResponseRunner } from "@buli/engine";
import { Box, Text, useInput, useWindowSize } from "ink";
import { startTransition, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme, minimumTerminalSizeTier } from "@buli/assistant-design-tokens";
import {
  createInitialConversationTranscriptViewportState,
  jumpConversationTranscriptViewportToNewestRows,
  jumpConversationTranscriptViewportToOldestRows,
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
import { ShortcutsModal } from "./components/ShortcutsModal.tsx";
import { TopBar, TOP_BAR_NATURAL_ROW_COUNT } from "./components/TopBar.tsx";
import { useTerminalSizeTierForChatScreen } from "./components/behavior/useTerminalSizeTierForChatScreen.ts";

// The chat screen's middle area renders with paddingTop=1 to keep the
// transcript / modal off the top bar's surface fill. Owned here because the
// padding is part of ChatScreen's layout, not a leaf component's concern.
const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;
import {
  appendTypedTextToPromptDraft,
  applyAssistantResponseEventToChatScreenState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatScreenState,
  hideModelAndReasoningSelection,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  hideShortcutsHelpModal,
  removeLastCharacterFromPromptDraft,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showShortcutsHelpModal,
  submitPromptDraft,
  type ChatScreenState,
} from "./chatScreenState.ts";
import { lookupContextWindowTokenCapacityForModel } from "./modelContextWindowCapacity.ts";
import { relayAssistantResponseRunnerEvents } from "./relayAssistantResponseRunnerEvents.ts";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  assistantResponseRunner: AssistantResponseRunner;
};

export function ChatScreen(props: ChatScreenProps) {
  const { rows } = useWindowSize();
  const terminalSizeTierForChatScreen = useTerminalSizeTierForChatScreen();

  // This component is the whole chat screen.
  // It stores all screen data in one local state object.
  // Every time that state changes, React runs this function again,
  // and Ink turns the new result into updated terminal output.
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

  // React reruns this component after each state change, but keyboard handlers
  // and async code keep running in between renders.
  // This ref always points at the newest screen state so those later callbacks
  // can read the latest model, prompt draft, and selection screen values.
  const latestChatScreenStateRef = useRef<ChatScreenState>(chatScreenState);
  const latestConversationTranscriptViewportMeasurementsRef = useRef<ConversationTranscriptViewportMeasurements | undefined>(
    latestConversationTranscriptViewportMeasurements,
  );

  latestChatScreenStateRef.current = chatScreenState;
  latestConversationTranscriptViewportMeasurementsRef.current = latestConversationTranscriptViewportMeasurements;

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
      // so they don't preempt user keystrokes routed through useInput.
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

  // The assistant response arrives as a stream of events over time.
  // Each event describes one new piece of information, like text arriving,
  // the response starting, or the response completing.
  // We fold each event into the screen state so the terminal can redraw.
  const applyIncomingAssistantResponseEventToChatScreen = useEffectEvent((assistantResponseEvent: AssistantResponseEvent) => {
    startTransition(() => {
      setChatScreenState((currentChatScreenState) =>
        applyAssistantResponseEventToChatScreenState(currentChatScreenState, assistantResponseEvent),
      );
    });
  });

  // When the user submits a prompt, we start one background assistant response.
  // The request uses whatever model and reasoning effort are currently selected.
  // As the runner streams events back, we apply them one by one to screen state.
  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPromptText: string) => {
    const assistantResponseRequest = {
      promptText: submittedPromptText,
      selectedModelId: latestChatScreenStateRef.current.selectedModelId,
      ...(latestChatScreenStateRef.current.selectedReasoningEffort
        ? { selectedReasoningEffort: latestChatScreenStateRef.current.selectedReasoningEffort }
        : {}),
    };

    await relayAssistantResponseRunnerEvents({
      assistantResponseRunner: props.assistantResponseRunner,
      assistantResponseRequest,
      onAssistantResponseEvent: applyIncomingAssistantResponseEventToChatScreen,
    });
  });

  // The model selection flow also changes over time.
  // First we show a loading state, then we replace it with the available models,
  // or with an error message if loading fails.
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

  // Ink gives us one parsed key event at a time.
  // This is the main traffic controller for user input.
  // It looks at the current screen mode and decides whether a key should:
  // move around the selection screen,
  // change the prompt draft,
  // submit a prompt,
  // or open the model selection flow.
  useInput((typedText, pressedKey) => {
    const { modelAndReasoningSelectionState, promptDraft } = latestChatScreenStateRef.current;

    if (modelAndReasoningSelectionState.step !== "hidden") {
      if (pressedKey.escape) {
        setChatScreenState((currentChatScreenState) => hideModelAndReasoningSelection(currentChatScreenState));
        return;
      }

      if (modelAndReasoningSelectionState.step === "showing_available_models") {
        if (pressedKey.upArrow) {
          setChatScreenState((currentChatScreenState) => moveHighlightedModelSelectionUp(currentChatScreenState));
          return;
        }

        if (pressedKey.downArrow) {
          setChatScreenState((currentChatScreenState) => moveHighlightedModelSelectionDown(currentChatScreenState));
          return;
        }

        if (pressedKey.return) {
          setChatScreenState((currentChatScreenState) => confirmHighlightedModelSelection(currentChatScreenState));
        }

        return;
      }

      if (modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices") {
        if (pressedKey.upArrow) {
          setChatScreenState((currentChatScreenState) =>
            moveHighlightedReasoningEffortChoiceUp(currentChatScreenState),
          );
          return;
        }

        if (pressedKey.downArrow) {
          setChatScreenState((currentChatScreenState) =>
            moveHighlightedReasoningEffortChoiceDown(currentChatScreenState),
          );
          return;
        }

        if (pressedKey.return) {
          setChatScreenState((currentChatScreenState) =>
            confirmHighlightedReasoningEffortChoice(currentChatScreenState),
          );
        }
      }

      return;
    }

    if (pressedKey.ctrl && !pressedKey.meta && !pressedKey.shift && (typedText === "l" || typedText === "L" || typedText === "\f")) {
      if (latestChatScreenStateRef.current.assistantResponseStatus === "streaming_assistant_response") {
        return;
      }

      void loadAvailableModelsForSelection();
      return;
    }

    // "?" on an empty prompt opens the shortcuts help modal. Typing "?" inside
    // a non-empty prompt falls through to the append-text branch so users can
    // still write questions without the key being stolen from them.
    if (typedText === "?" && promptDraft.length === 0) {
      setChatScreenState((currentChatScreenState) => showShortcutsHelpModal(currentChatScreenState));
      return;
    }

    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (conversationTranscriptViewportMeasurements) {
      if (pressedKey.upArrow) {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportUpByRows(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
            1,
          ),
        );
        return;
      }

      if (pressedKey.downArrow) {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportDownByRows(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
            1,
          ),
        );
        return;
      }

      if (pressedKey.pageUp) {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportUpByPage(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
          ),
        );
        return;
      }

      if (pressedKey.pageDown) {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportDownByPage(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
          ),
        );
        return;
      }

      if (pressedKey.home) {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          jumpConversationTranscriptViewportToOldestRows(currentConversationTranscriptViewportState),
        );
        return;
      }

      if (pressedKey.end) {
        setConversationTranscriptViewportState(
          jumpConversationTranscriptViewportToNewestRows(conversationTranscriptViewportMeasurements),
        );
        return;
      }
    }

    if (pressedKey.return) {
      const promptDraftSubmission = submitPromptDraft(latestChatScreenStateRef.current);
      if (!promptDraftSubmission.submittedPromptText) {
        return;
      }

      // A submitted prompt changes the screen in two phases.
      // First we immediately show the user's message and clear the draft.
      // Then the background assistant response keeps updating the screen as text arrives.
      setChatScreenState(promptDraftSubmission.nextChatScreenState);
      void streamAssistantResponseForSubmittedPrompt(promptDraftSubmission.submittedPromptText);
      return;
    }

    if (pressedKey.backspace || pressedKey.delete) {
      setChatScreenState((currentChatScreenState) => removeLastCharacterFromPromptDraft(currentChatScreenState));
      return;
    }

    if (typedText) {
      setChatScreenState((currentChatScreenState) => appendTypedTextToPromptDraft(currentChatScreenState, typedText));
    }
  }, { isActive: !chatScreenState.isShortcutsHelpModalVisible });

  // This decides what the middle area of the terminal should show right now.
  // The user either sees:
  // a loading message,
  // a model list,
  // a reasoning-effort list,
  // an error message,
  // or the normal prompt draft line.
  const modelAndReasoningSelectionPane =
    chatScreenState.modelAndReasoningSelectionState.step === "loading_available_models" ? (
      <Box alignItems="center" flexGrow={1} justifyContent="center">
        <Text color={chatScreenTheme.accentAmber}>Loading models...</Text>
      </Box>
    ) : chatScreenState.modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
      <Box flexDirection="column" gap={1}>
        <Text bold color={chatScreenTheme.accentRed}>
          Could not load models
        </Text>
        <Text color={chatScreenTheme.textPrimary}>{chatScreenState.modelAndReasoningSelectionState.errorMessage}</Text>
        <Text color={chatScreenTheme.textMuted}>Press Esc to close.</Text>
      </Box>
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

  const promptInputHintText = chatScreenState.isShortcutsHelpModalVisible
    ? "[ esc ] close shortcuts"
    : chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
      ? "Selection is open. Press Esc to close it."
      : chatScreenState.assistantResponseStatus === "streaming_assistant_response"
        ? "Assistant response is streaming. PgUp/PgDn/Home/End scroll."
        : "[ ? ] help on empty draft";

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

  // The return value below is just a React tree.
  // Ink reads that tree, turns it into terminal text, compares it with the last frame,
  // and writes only the changed characters back to the terminal.
  return (
    <Box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={rows}>
      <TopBar workingDirectoryPath={workingDirectoryPath} />
      <Box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={2} paddingTop={1}>
        {chatScreenState.isShortcutsHelpModalVisible ? (
          <Box alignItems="center" flexGrow={1} justifyContent="center">
            <ShortcutsModal
              onCloseRequested={() =>
                setChatScreenState((currentChatScreenState) => hideShortcutsHelpModal(currentChatScreenState))
              }
              availableModalRowCount={availableShortcutsModalRowCount}
              terminalSizeTierForChatScreen={terminalSizeTierForChatScreen}
            />
          </Box>
        ) : (
          modelAndReasoningSelectionPane ?? (
            <ConversationTranscriptPane
              conversationTranscriptEntries={chatScreenState.conversationTranscript}
              hiddenTranscriptRowsAboveViewport={conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport}
              onConversationTranscriptViewportMeasured={applyMeasuredConversationTranscriptViewport}
            />
          )
        )}
      </Box>
      {terminalSizeTierForChatScreen === minimumTerminalSizeTier ? (
        <MinimumHeightPromptStrip
          promptDraft={chatScreenState.promptDraft}
          isPromptInputDisabled={
            chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
            chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
          }
          assistantResponseStatus={chatScreenState.assistantResponseStatus}
        />
      ) : (
        <InputPanel
          promptDraft={chatScreenState.promptDraft}
          isPromptInputDisabled={
            chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
            chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
          }
          promptInputHintText={promptInputHintText}
          modeLabel={modeLabel}
          modelIdentifier={chatScreenState.selectedModelId}
          reasoningEffortLabel={reasoningEffortLabel}
          assistantResponseStatus={chatScreenState.assistantResponseStatus}
          totalContextTokensUsed={totalContextTokensUsed}
          contextWindowTokenCapacity={contextWindowTokenCapacity}
        />
      )}
    </Box>
  );
}
