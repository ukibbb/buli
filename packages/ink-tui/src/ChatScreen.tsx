import { type AssistantResponseEvent, type AvailableAssistantModel, type ReasoningEffort } from "@buli/contracts";
import { type AssistantResponseRunner } from "@buli/engine";
import { Box, Text, useInput, useWindowSize } from "ink";
import React, { startTransition, useEffectEvent, useRef, useState } from "react";
import { chatScreenTheme } from "./chatScreenTheme.ts";
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
import { ChatSessionStatusBar } from "./components/ChatSessionStatusBar.tsx";
import { ConversationTranscriptPane } from "./components/ConversationTranscriptPane.tsx";
import { ModelAndReasoningSelectionPane } from "./components/ModelAndReasoningSelectionPane.tsx";
import { PromptDraftPane } from "./components/PromptDraftPane.tsx";
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
  removeLastCharacterFromPromptDraft,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  submitPromptDraft,
  type AuthenticationState,
  type ChatScreenState,
} from "./chatScreenState.ts";

export type ChatScreenProps = {
  authenticationState: AuthenticationState;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  assistantResponseRunner: AssistantResponseRunner;
};

export function ChatScreen(props: ChatScreenProps) {
  const { rows } = useWindowSize();

  // This component is the whole chat screen.
  // It stores all screen data in one local state object.
  // Every time that state changes, React runs this function again,
  // and Ink turns the new result into updated terminal output.
  const [chatScreenState, setChatScreenState] = useState(() =>
    createInitialChatScreenState({
      authenticationState: props.authenticationState,
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

  const applyMeasuredConversationTranscriptViewport = useEffectEvent(
    (conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements) => {
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

    for await (const assistantResponseEvent of props.assistantResponseRunner.streamAssistantResponse(assistantResponseRequest)) {
      applyIncomingAssistantResponseEventToChatScreen(assistantResponseEvent);
    }
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
    const { modelAndReasoningSelectionState } = latestChatScreenStateRef.current;

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
  });

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

  const promptInputHintText =
    chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
      ? "Selection is open. Press Esc to close it."
      : chatScreenState.assistantResponseStatus === "streaming_assistant_response"
        ? "Assistant response is streaming. PgUp/PgDn/Home/End scroll."
        : "Enter send | Ctrl+L models | PgUp/PgDn/Home/End scroll";

  const conversationTranscriptViewportStatusText = conversationTranscriptViewportState.isFollowingNewestTranscriptRows
    ? "conversation latest"
    : "conversation scrolling";

  const topApplicationBar = (
    <Box
      alignItems="center"
      backgroundColor={chatScreenTheme.surfaceTwo}
      borderColor={chatScreenTheme.border}
      borderStyle="round"
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
    >
      <Text bold color={chatScreenTheme.accentCyan}>
        buli
      </Text>
      <Text color={chatScreenTheme.textMuted}>{`${chatScreenState.selectedModelId} | ${chatScreenState.selectedReasoningEffort ?? "default"} | ${chatScreenState.authenticationState}`}</Text>
    </Box>
  );

  // The return value below is just a React tree.
  // Ink reads that tree, turns it into terminal text, compares it with the last frame,
  // and writes only the changed characters back to the terminal.
  return (
    <Box
      backgroundColor={chatScreenTheme.bg}
      flexDirection="column"
      height={rows}
    >
      {topApplicationBar}
      <Box
        backgroundColor={chatScreenTheme.surfaceOne}
        borderColor={chatScreenTheme.border}
        borderStyle="round"
        flexDirection="column"
        flexGrow={1}
        overflow="hidden"
        padding={1}
      >
        <Text color={chatScreenTheme.textMuted}>
          {chatScreenState.modelAndReasoningSelectionState.step === "hidden" ? "Conversation" : "Model and reasoning selection"}
        </Text>
        <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
          {modelAndReasoningSelectionPane ?? (
            <ConversationTranscriptPane
              conversationTranscriptEntries={chatScreenState.conversationTranscript}
              hiddenTranscriptRowsAboveViewport={conversationTranscriptViewportState.hiddenTranscriptRowsAboveViewport}
              onConversationTranscriptViewportMeasured={applyMeasuredConversationTranscriptViewport}
            />
          )}
        </Box>
      </Box>
      <PromptDraftPane
        isPromptInputDisabled={
          chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
          chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
        }
        promptDraft={chatScreenState.promptDraft}
        promptInputHintText={promptInputHintText}
      />
      <ChatSessionStatusBar
        assistantResponseStatus={chatScreenState.assistantResponseStatus}
        authenticationState={chatScreenState.authenticationState}
        conversationTranscriptViewportStatusText={conversationTranscriptViewportStatusText}
        latestTokenUsage={chatScreenState.latestTokenUsage}
      />
    </Box>
  );
}
