import os from "node:os";
import type { AssistantResponseEvent, AvailableAssistantModel, ReasoningEffort } from "@buli/contracts";
import {
  determinePromptContextQueryLoadStrategy,
  extractActivePromptContextQueryFromPromptDraft,
  type ActiveConversationTurn,
  type AssistantConversationRunner,
  type PromptContextCandidate,
} from "@buli/engine";
import {
  applyAssistantResponseEventsToChatSessionState,
  confirmHighlightedModelSelection,
  confirmHighlightedReasoningEffortChoice,
  createInitialChatSessionState,
  hideModelAndReasoningSelection,
  hidePromptContextSelection,
  hideShortcutsHelpModal,
  insertTextIntoPromptDraftAtCursor,
  listOrderedConversationMessageParts,
  listOrderedConversationMessages,
  moveHighlightedModelSelectionDown,
  moveHighlightedModelSelectionUp,
  moveHighlightedPromptContextCandidateDown,
  moveHighlightedPromptContextCandidateUp,
  moveHighlightedReasoningEffortChoiceDown,
  moveHighlightedReasoningEffortChoiceUp,
  movePromptDraftCursorLeft,
  movePromptDraftCursorRight,
  refreshPromptContextCandidatesForSelection,
  removePromptDraftCharacterAtCursor,
  removePromptDraftCharacterBeforeCursor,
  selectHighlightedPromptContextCandidate,
  showAvailableAssistantModelsForSelection,
  showModelSelectionLoadingError,
  showModelSelectionLoadingState,
  showPromptContextCandidatesForSelection,
  showShortcutsHelpModal,
  submitPromptDraft,
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
import { ShortcutsModal } from "./components/ShortcutsModal.tsx";
import { StartupComponentGalleryViewport } from "./components/StartupComponentGalleryViewport.tsx";
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

const CHAT_SCREEN_MIDDLE_AREA_TOP_PADDING_ROW_COUNT = 1;
const TRANSCRIPT_WHEEL_SCROLL_ROW_COUNT = 3;
const FUZZY_PROMPT_CONTEXT_QUERY_DEBOUNCE_MS = 120;

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

function resolveChatScreenInteractionScope(chatSessionState: ChatSessionState): ChatScreenInteractionScope {
  if (chatSessionState.isShortcutsHelpModalVisible) {
    return "shortcuts_help_modal";
  }

  if (chatSessionState.modelAndReasoningSelectionState.step === "showing_reasoning_effort_choices") {
    return "reasoning_effort_selection";
  }

  if (chatSessionState.modelAndReasoningSelectionState.step !== "hidden") {
    return "model_selection";
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

export function ChatScreen(props: ChatScreenProps) {
  const { height: rows } = useTerminalDimensions();
  const terminalSizeTierForChatScreen = useTerminalSizeTierForChatScreen();
  const [chatSessionState, setChatSessionState] = useState(() =>
    createInitialChatSessionState({
      selectedModelId: props.selectedModelId,
      ...(props.selectedReasoningEffort ? { selectedReasoningEffort: props.selectedReasoningEffort } : {}),
    }),
  );

  const latestChatSessionStateRef = useRef<ChatSessionState>(chatSessionState);
  const latestActiveConversationTurnRef = useRef<ActiveConversationTurn | undefined>(undefined);
  const latestPromptContextLoadRequestSequenceRef = useRef(0);
  const pendingPromptContextLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissedPromptContextQueryRef = useRef<PromptContextQueryIdentity | undefined>(undefined);
  const conversationMessageScrollBoxRef = useRef<ScrollBoxRenderable | null>(null);

  latestChatSessionStateRef.current = chatSessionState;

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

  const applyIncomingAssistantResponseEventsToChatScreen = useEffectEvent((assistantResponseEvents: readonly AssistantResponseEvent[]) => {
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

  const scrollConversationMessagesByPage = useEffectEvent((pageDirection: "up" | "down") => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    const pageRowCount = Math.max(conversationMessageScrollBox.viewport.height, 1);
    conversationMessageScrollBox.scrollTop = clampScrollTop(
      conversationMessageScrollBox,
      conversationMessageScrollBox.scrollTop + (pageDirection === "up" ? -pageRowCount : pageRowCount),
    );
  });

  const jumpConversationMessagesToTop = useEffectEvent(() => {
    const conversationMessageScrollBox = conversationMessageScrollBoxRef.current;
    if (!conversationMessageScrollBox) {
      return;
    }

    conversationMessageScrollBox.scrollTop = 0;
  });

  const streamAssistantResponseForSubmittedPrompt = useEffectEvent(async (submittedPromptText: string) => {
    const conversationTurnRequest = {
      userPromptText: submittedPromptText,
      selectedModelId: latestChatSessionStateRef.current.selectedModelId,
      ...(latestChatSessionStateRef.current.selectedReasoningEffort
        ? { selectedReasoningEffort: latestChatSessionStateRef.current.selectedReasoningEffort }
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
      onAssistantResponseEvents: applyIncomingAssistantResponseEventsToChatScreen,
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
        return;
      }

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
      latestChatSessionState.isShortcutsHelpModalVisible ||
      latestChatSessionState.conversationTurnStatus !== "waiting_for_user_input" ||
      latestChatSessionState.modelAndReasoningSelectionState.step !== "hidden";
    if (shouldHidePromptContextSelection) {
      invalidatePendingPromptContextLoads();
      setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
      return;
    }

    const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
      latestChatSessionState.promptDraft,
      latestChatSessionState.promptDraftCursorOffset,
    );
    if (!activePromptContextQuery) {
      invalidatePendingPromptContextLoads();
      setChatSessionState((currentChatSessionState) => hidePromptContextSelection(currentChatSessionState));
      return;
    }

    const requestedPromptContextQueryIdentity = buildPromptContextQueryIdentity(activePromptContextQuery);
    if (!requestedPromptContextQueryIdentity) {
      return;
    }

    if (doPromptContextQueriesMatch(requestedPromptContextQueryIdentity, dismissedPromptContextQueryRef.current)) {
      invalidatePendingPromptContextLoads();
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
    chatSessionState.isShortcutsHelpModalVisible,
    refreshPromptContextSelectionForCurrentDraft,
  ]);

  const loadAvailableModelsForSelection = useEffectEvent(async () => {
    setChatSessionState((currentChatSessionState) => showModelSelectionLoadingState(currentChatSessionState));

    try {
      const availableAssistantModels = await props.loadAvailableAssistantModels();
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showAvailableAssistantModelsForSelection(currentChatSessionState, availableAssistantModels),
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        setChatSessionState((currentChatSessionState) =>
          showModelSelectionLoadingError(currentChatSessionState, errorMessage),
        );
      });
    }
  });

  useKeyboard((keyEvent: KeyEvent) => {
    if (chatSessionState.isShortcutsHelpModalVisible) {
      return;
    }

    const latestChatSessionState = latestChatSessionStateRef.current;
    const interactionScope = resolveChatScreenInteractionScope(latestChatSessionState);

    if (interactionScope === "model_selection") {
      if (keyEvent.name === "escape") {
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
          setChatSessionState((currentChatSessionState) => confirmHighlightedModelSelection(currentChatSessionState));
        }
      }

      return;
    }

    if (interactionScope === "reasoning_effort_selection") {
      if (keyEvent.name === "escape") {
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
        setChatSessionState((currentChatSessionState) => confirmHighlightedReasoningEffortChoice(currentChatSessionState));
      }

      return;
    }

    if (interactionScope === "prompt_context_selection") {
      if (keyEvent.name === "escape") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
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
      const pendingToolApprovalRequest = latestChatSessionState.pendingToolApprovalRequest;
      if (!pendingToolApprovalRequest) {
        return;
      }

      if (keyEvent.sequence === "y" || keyEvent.sequence === "Y") {
        void latestActiveConversationTurnRef.current?.approvePendingToolCall(pendingToolApprovalRequest.approvalId);
        return;
      }

      if (keyEvent.sequence === "n" || keyEvent.sequence === "N") {
        void latestActiveConversationTurnRef.current?.denyPendingToolCall(pendingToolApprovalRequest.approvalId);
      }

      return;
    }

    if (keyEvent.ctrl && !keyEvent.meta && !keyEvent.shift && (keyEvent.name === "l" || keyEvent.sequence === "\f")) {
      if (latestChatSessionState.conversationTurnStatus === "streaming_assistant_response") {
        return;
      }

      void loadAvailableModelsForSelection();
      return;
    }

    if (keyEvent.name === "?" && latestChatSessionState.promptDraft.length === 0) {
      setChatSessionState((currentChatSessionState) => showShortcutsHelpModal(currentChatSessionState));
      return;
    }

    if (keyEvent.name === "up") {
      scrollConversationMessagesByRows(-1);
      return;
    }

    if (keyEvent.name === "down") {
      scrollConversationMessagesByRows(1);
      return;
    }

    if (keyEvent.name === "pageup") {
      scrollConversationMessagesByPage("up");
      return;
    }

    if (keyEvent.name === "pagedown") {
      scrollConversationMessagesByPage("down");
      return;
    }

    if (keyEvent.name === "home") {
      jumpConversationMessagesToTop();
      return;
    }

    if (keyEvent.name === "end") {
      scrollConversationMessagesToBottom();
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
      const promptDraftSubmission = submitPromptDraft(latestChatSessionState);
      if (!promptDraftSubmission.submittedPromptText) {
        return;
      }

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
        errorHintText="Press Esc to close."
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

  const promptInputHintOverride = chatSessionState.isShortcutsHelpModalVisible
    ? "[ esc ] close shortcuts"
    : chatSessionState.modelAndReasoningSelectionState.step !== "hidden"
      ? "Selection is open. Press Esc to close it."
      : chatSessionState.promptContextSelectionState.step !== "hidden"
        ? "@ picker · ↑ ↓ choose · enter insert · esc close"
        : chatSessionState.conversationTurnStatus === "waiting_for_tool_approval"
          ? "approval required · [ y ] approve · [ n ] deny"
          : undefined;

  const isPromptInputDisabled =
    chatSessionState.conversationTurnStatus === "streaming_assistant_response" ||
    chatSessionState.conversationTurnStatus === "waiting_for_tool_approval" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden";

  const promptContextSelectionPane =
    chatSessionState.promptContextSelectionState.step === "showing_prompt_context_candidates" ? (
      <PromptContextSelectionPane
        promptContextCandidates={chatSessionState.promptContextSelectionState.promptContextCandidates}
        highlightedPromptContextCandidateIndex={
          chatSessionState.promptContextSelectionState.highlightedPromptContextCandidateIndex
        }
      />
    ) : null;

  const homeDirectoryPath = os.homedir();
  const rawWorkingDirectoryPath = process.cwd();
  const workingDirectoryPath = rawWorkingDirectoryPath.startsWith(homeDirectoryPath)
    ? `~${rawWorkingDirectoryPath.slice(homeDirectoryPath.length)}`
    : rawWorkingDirectoryPath;
  const modeLabel = "implementation";
  const reasoningEffortLabel = chatSessionState.selectedReasoningEffort ?? "default";
  const inputRegionRowCount =
    terminalSizeTierForChatScreen === minimumTerminalSizeTier
      ? MINIMUM_HEIGHT_PROMPT_STRIP_ROW_COUNT
      : INPUT_PANEL_NATURAL_ROW_COUNT;
  const availableShortcutsModalRowCount = Math.max(
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
  const shouldShowStartupComponentGallery = orderedConversationMessages.length === 0;

  return (
    <box backgroundColor={chatScreenTheme.bg} flexDirection="column" height={rows}>
      <TopBar workingDirectoryPath={workingDirectoryPath} />
      <box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" paddingX={2} paddingTop={1}>
        {chatSessionState.isShortcutsHelpModalVisible ? (
          <box alignItems="center" flexGrow={1} justifyContent="center">
            <ShortcutsModal
              onCloseRequested={() =>
                setChatSessionState((currentChatSessionState) => hideShortcutsHelpModal(currentChatSessionState))
              }
              availableModalRowCount={availableShortcutsModalRowCount}
              terminalSizeTierForChatScreen={terminalSizeTierForChatScreen}
            />
          </box>
        ) : modelAndReasoningSelectionPane ? (
          modelAndReasoningSelectionPane
        ) : shouldShowStartupComponentGallery ? (
          <StartupComponentGalleryViewport
            conversationMessageScrollBoxRef={conversationMessageScrollBoxRef}
            onConversationMessageWheelScroll={(direction) =>
              scrollConversationMessagesByRows(direction === "up" ? -TRANSCRIPT_WHEEL_SCROLL_ROW_COUNT : TRANSCRIPT_WHEEL_SCROLL_ROW_COUNT)
            }
          />
        ) : (
          <ConversationMessageList
            conversationMessages={orderedConversationMessages}
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
          <ToolApprovalRequestBlock
            pendingToolCallDetail={chatSessionState.pendingToolApprovalRequest.pendingToolCallDetail}
            riskExplanation={chatSessionState.pendingToolApprovalRequest.riskExplanation}
          />
        ) : null}
        {promptContextSelectionPane}
        {terminalSizeTierForChatScreen === minimumTerminalSizeTier ? (
          <MinimumHeightPromptStrip
            promptDraft={chatSessionState.promptDraft}
            promptDraftCursorOffset={chatSessionState.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={chatSessionState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={isPromptInputDisabled}
            assistantResponseStatus={chatSessionState.conversationTurnStatus}
          />
        ) : (
          <InputPanel
            promptDraft={chatSessionState.promptDraft}
            promptDraftCursorOffset={chatSessionState.promptDraftCursorOffset}
            selectedPromptContextReferenceTexts={chatSessionState.selectedPromptContextReferenceTexts}
            isPromptInputDisabled={isPromptInputDisabled}
            {...(promptInputHintOverride !== undefined ? { promptInputHintOverride } : {})}
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
  );
}
