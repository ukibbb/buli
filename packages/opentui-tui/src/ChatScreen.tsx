import os from "node:os";
import { type AssistantResponseEvent, type AvailableAssistantModel, type ReasoningEffort } from "@buli/contracts";
import { type AssistantResponseRunner } from "@buli/engine";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import { startTransition, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
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
import { InputPanel } from "./components/InputPanel.tsx";
import { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
import { ShortcutsModal } from "./components/ShortcutsModal.tsx";
import { TopBar } from "./components/TopBar.tsx";
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
  const { height: rows } = useTerminalDimensions();

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

  useKeyboard((e: KeyEvent) => {
    // The shortcuts modal owns Esc; let ShortcutsModal's own useKeyboard handle it.
    if (chatScreenState.isShortcutsHelpModalVisible) {
      return;
    }

    const { modelAndReasoningSelectionState, promptDraft } = latestChatScreenStateRef.current;

    if (modelAndReasoningSelectionState.step !== "hidden") {
      if (e.name === "escape") {
        setChatScreenState((currentChatScreenState) => hideModelAndReasoningSelection(currentChatScreenState));
        return;
      }

      if (modelAndReasoningSelectionState.step === "showing_available_models") {
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

        return;
      }

      if (modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices") {
        if (e.name === "up") {
          setChatScreenState((currentChatScreenState) =>
            moveHighlightedReasoningEffortChoiceUp(currentChatScreenState),
          );
          return;
        }

        if (e.name === "down") {
          setChatScreenState((currentChatScreenState) =>
            moveHighlightedReasoningEffortChoiceDown(currentChatScreenState),
          );
          return;
        }

        if (e.name === "return") {
          setChatScreenState((currentChatScreenState) =>
            confirmHighlightedReasoningEffortChoice(currentChatScreenState),
          );
        }
      }

      return;
    }

    if (e.ctrl && !e.meta && !e.shift && (e.name === "l" || e.sequence === "\f")) {
      if (latestChatScreenStateRef.current.assistantResponseStatus === "streaming_assistant_response") {
        return;
      }

      void loadAvailableModelsForSelection();
      return;
    }

    // "?" on an empty prompt opens the shortcuts help modal. Typing "?" inside
    // a non-empty prompt falls through to the append-text branch so users can
    // still write questions without the key being stolen from them.
    if (e.name === "?" && promptDraft.length === 0) {
      setChatScreenState((currentChatScreenState) => showShortcutsHelpModal(currentChatScreenState));
      return;
    }

    const conversationTranscriptViewportMeasurements = latestConversationTranscriptViewportMeasurementsRef.current;
    if (conversationTranscriptViewportMeasurements) {
      if (e.name === "up") {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportUpByRows(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
            1,
          ),
        );
        return;
      }

      if (e.name === "down") {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportDownByRows(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
            1,
          ),
        );
        return;
      }

      if (e.name === "pageup") {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportUpByPage(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
          ),
        );
        return;
      }

      if (e.name === "pagedown") {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          scrollConversationTranscriptViewportDownByPage(
            currentConversationTranscriptViewportState,
            conversationTranscriptViewportMeasurements,
          ),
        );
        return;
      }

      if (e.name === "home") {
        setConversationTranscriptViewportState((currentConversationTranscriptViewportState) =>
          jumpConversationTranscriptViewportToOldestRows(currentConversationTranscriptViewportState),
        );
        return;
      }

      if (e.name === "end") {
        setConversationTranscriptViewportState(
          jumpConversationTranscriptViewportToNewestRows(conversationTranscriptViewportMeasurements),
        );
        return;
      }
    }

    if (e.name === "return") {
      const promptDraftSubmission = submitPromptDraft(latestChatScreenStateRef.current);
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

    if (e.name === "backspace" || e.name === "delete") {
      setChatScreenState((currentChatScreenState) => removeLastCharacterFromPromptDraft(currentChatScreenState));
      return;
    }

    if (e.sequence && !e.ctrl && !e.meta && e.sequence.length === 1) {
      setChatScreenState((currentChatScreenState) => appendTypedTextToPromptDraft(currentChatScreenState, e.sequence));
    }
  });

  const modelAndReasoningSelectionPane =
    chatScreenState.modelAndReasoningSelectionState.step === "loading_available_models" ? (
      <box alignItems="center" flexGrow={1} justifyContent="center">
        <text fg={chatScreenTheme.accentAmber}>{"Loading models..."}</text>
      </box>
    ) : chatScreenState.modelAndReasoningSelectionState.step === "showing_model_loading_error" ? (
      <box flexDirection="column" gap={1}>
        <text fg={chatScreenTheme.accentRed}>
          <b>{"Could not load models"}</b>
        </text>
        <text fg={chatScreenTheme.textPrimary}>{chatScreenState.modelAndReasoningSelectionState.errorMessage}</text>
        <text fg={chatScreenTheme.textMuted}>{"Press Esc to close."}</text>
      </box>
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
      : undefined;

  const homeDirectoryPath = os.homedir();
  const rawWorkingDirectoryPath = process.cwd();
  // Collapse the home prefix to ~ so the path fits comfortably in the top bar.
  const workingDirectoryPath = rawWorkingDirectoryPath.startsWith(homeDirectoryPath)
    ? `~${rawWorkingDirectoryPath.slice(homeDirectoryPath.length)}`
    : rawWorkingDirectoryPath;

  const modeLabel = "implementation";
  const reasoningEffortLabel = chatScreenState.selectedReasoningEffort ?? "default";
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
      <box flexGrow={1} overflow="hidden" paddingX={2} paddingTop={1}>
        {chatScreenState.isShortcutsHelpModalVisible ? (
          <box alignItems="center" flexGrow={1} justifyContent="center">
            <ShortcutsModal
              onCloseRequested={() =>
                setChatScreenState((currentChatScreenState) => hideShortcutsHelpModal(currentChatScreenState))
              }
            />
          </box>
        ) : (
          modelAndReasoningSelectionPane ?? (
            <ConversationTranscriptPane
              conversationTranscriptEntries={chatScreenState.conversationTranscript}
              hiddenTranscriptRowsAboveViewport={conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport}
              onConversationTranscriptViewportMeasured={applyMeasuredConversationTranscriptViewport}
            />
          )
        )}
      </box>
      <InputPanel
        promptDraft={chatScreenState.promptDraft}
        isPromptInputDisabled={
          chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
          chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
        }
        {...(promptInputHintOverride !== undefined ? { promptInputHintOverride } : {})}
        modeLabel={modeLabel}
        modelIdentifier={chatScreenState.selectedModelId}
        reasoningEffortLabel={reasoningEffortLabel}
        assistantResponseStatus={chatScreenState.assistantResponseStatus}
        totalContextTokensUsed={totalContextTokensUsed}
        contextWindowTokenCapacity={contextWindowTokenCapacity}
      />
    </box>
  );
}
