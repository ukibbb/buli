import { randomUUID } from "node:crypto";
import {
  type AssistantStreamingProjection,
  type AssistantResponseEvent,
  type AvailableAssistantModel,
  type PlanStep,
  type ReasoningEffort,
  type TokenUsage,
  type ToolCallDetail,
  type TranscriptMessage,
} from "@buli/contracts";
import {
  createLegacyStreamingProjectionFromText,
  extractActivePromptContextQueryFromPromptDraft,
  type PromptContextCandidate,
  reconcileSelectedPromptContextReferenceTextsWithPromptDraft,
  replaceActivePromptContextQueryWithSelectedReference,
} from "@buli/engine";

// Pure reducer functions so the render layer stays free of side-effect
// branching and each transition can be asserted directly in unit tests
// without mounting OpenTUI.

const STREAMING_ASSISTANT_MESSAGE_ID = "assistant-streaming";

export type AssistantResponseStatus =
  | "waiting_for_user_input"
  | "waiting_for_tool_approval"
  | "streaming_assistant_response"
  | "assistant_response_failed";

export type ReasoningEffortChoice = {
  displayLabel: string;
  reasoningEffort: ReasoningEffort | undefined;
};

export type ModelAndReasoningSelectionState =
  | {
      step: "hidden";
    }
  | {
      step: "loading_available_models";
    }
  | {
      step: "showing_model_loading_error";
      errorMessage: string;
    }
  | {
      step: "showing_available_models";
      availableModels: AvailableAssistantModel[];
      highlightedModelIndex: number;
    }
  | {
      step: "showing_reasoning_effort_choices";
      selectedModel: AvailableAssistantModel;
      availableReasoningEffortChoices: ReasoningEffortChoice[];
      highlightedReasoningEffortChoiceIndex: number;
    };

export type PromptContextSelectionState =
  | {
      step: "hidden";
    }
  | {
      step: "showing_prompt_context_candidates";
      promptContextQueryText: string;
      promptContextCandidates: readonly PromptContextCandidate[];
      highlightedPromptContextCandidateIndex: number;
    };

export type ConversationTranscriptEntry =
  | {
      kind: "message";
      message: TranscriptMessage;
    }
  | {
      kind: "streaming_assistant_message";
      messageId: string;
      renderState: "streaming" | "incomplete" | "failed";
      streamingProjection: AssistantStreamingProjection;
    }
  | {
      kind: "error";
      text: string;
    }
  | {
      kind: "incomplete_response_notice";
      incompleteReason: string;
    }
  | {
      kind: "streaming_reasoning_summary";
      reasoningSummaryId: string;
      reasoningSummaryText: string;
      reasoningStartedAtMs: number;
    }
  | {
      kind: "completed_reasoning_summary";
      reasoningSummaryId: string;
      reasoningSummaryText: string;
      reasoningDurationMs: number;
      reasoningTokenCount: number | undefined;
    }
  | {
      kind: "streaming_tool_call";
      toolCallId: string;
      toolCallDetail: ToolCallDetail;
      toolCallStartedAtMs: number;
    }
  | {
      kind: "completed_tool_call";
      toolCallId: string;
      toolCallDetail: ToolCallDetail;
      durationMs: number;
    }
  | {
      kind: "failed_tool_call";
      toolCallId: string;
      toolCallDetail: ToolCallDetail;
      errorText: string;
      durationMs: number;
    }
  | {
      kind: "denied_tool_call";
      toolCallId: string;
      toolCallDetail: ToolCallDetail;
      denialText: string;
    }
  | {
      kind: "plan_proposal";
      planId: string;
      planTitle: string;
      planSteps: PlanStep[];
    }
  | {
      kind: "rate_limit_notice";
      rateLimitNoticeId: string;
      retryAfterSeconds: number;
      limitExplanation: string;
      noticeStartedAtMs: number;
    }
  | {
      kind: "tool_approval_request";
      approvalId: string;
      pendingToolCallId: string;
      pendingToolCallDetail: ToolCallDetail;
      riskExplanation: string;
    }
  | {
      kind: "turn_footer";
      turnFooterId: string;
      turnDurationMs: number;
      usage: TokenUsage | undefined;
      modelDisplayName: string;
    };

export type ChatScreenState = {
  selectedModelId: string;
  selectedReasoningEffort: ReasoningEffort | undefined;
  assistantResponseStatus: AssistantResponseStatus;
  promptDraft: string;
  promptDraftCursorOffset: number;
  latestTokenUsage: TokenUsage | undefined;
  conversationTranscript: ConversationTranscriptEntry[];
  streamingAssistantMessageId: string | undefined;
  currentStreamingReasoningSummaryId: string | undefined;
  currentStreamingReasoningSummaryTranscriptEntryIndex: number | undefined;
  currentTurnFooterTranscriptEntryIndex: number | undefined;
  currentTurnCompletedReasoningSummaryTranscriptEntryIndexes: number[];
  activeToolCallTranscriptEntryIndexByToolCallId: Record<string, number>;
  currentPendingToolApprovalId: string | undefined;
  promptContextSelectionState: PromptContextSelectionState;
  selectedPromptContextReferenceTexts: string[];
  modelAndReasoningSelectionState: ModelAndReasoningSelectionState;
  isShortcutsHelpModalVisible: boolean;
};

export function createInitialChatScreenState(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): ChatScreenState {
  return {
    selectedModelId: input.selectedModelId,
    selectedReasoningEffort: input.selectedReasoningEffort,
    assistantResponseStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    latestTokenUsage: undefined,
    conversationTranscript: [],
    streamingAssistantMessageId: undefined,
    currentStreamingReasoningSummaryId: undefined,
    currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
    currentTurnFooterTranscriptEntryIndex: undefined,
    currentTurnCompletedReasoningSummaryTranscriptEntryIndexes: [],
    activeToolCallTranscriptEntryIndexByToolCallId: {},
    currentPendingToolApprovalId: undefined,
    promptContextSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
    modelAndReasoningSelectionState: { step: "hidden" },
    isShortcutsHelpModalVisible: false,
  };
}

export function showShortcutsHelpModal(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    isShortcutsHelpModalVisible: true,
  };
}

export function hideShortcutsHelpModal(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    isShortcutsHelpModalVisible: false,
  };
}

function createPromptDraftEditedState(input: {
  chatScreenState: ChatScreenState;
  promptDraft: string;
  promptDraftCursorOffset: number;
}): ChatScreenState {
  return {
    ...input.chatScreenState,
    promptDraft: input.promptDraft,
    promptDraftCursorOffset: input.promptDraftCursorOffset,
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft: input.promptDraft,
      selectedPromptContextReferenceTexts: input.chatScreenState.selectedPromptContextReferenceTexts,
    }),
  };
}

export function insertTextIntoPromptDraftAtCursor(chatScreenState: ChatScreenState, insertedText: string): ChatScreenState {
  const promptDraftPrefix = chatScreenState.promptDraft.slice(0, chatScreenState.promptDraftCursorOffset);
  const promptDraftSuffix = chatScreenState.promptDraft.slice(chatScreenState.promptDraftCursorOffset);
  const promptDraft = `${promptDraftPrefix}${insertedText}${promptDraftSuffix}`;
  return createPromptDraftEditedState({
    chatScreenState,
    promptDraft,
    promptDraftCursorOffset: chatScreenState.promptDraftCursorOffset + insertedText.length,
  });
}

export function movePromptDraftCursorLeft(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    promptDraftCursorOffset: Math.max(0, chatScreenState.promptDraftCursorOffset - 1),
  };
}

export function movePromptDraftCursorRight(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    promptDraftCursorOffset: Math.min(chatScreenState.promptDraft.length, chatScreenState.promptDraftCursorOffset + 1),
  };
}

export function removePromptDraftCharacterBeforeCursor(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.promptDraftCursorOffset === 0) {
    return chatScreenState;
  }

  const promptDraftPrefix = chatScreenState.promptDraft.slice(0, chatScreenState.promptDraftCursorOffset - 1);
  const promptDraftSuffix = chatScreenState.promptDraft.slice(chatScreenState.promptDraftCursorOffset);
  return createPromptDraftEditedState({
    chatScreenState,
    promptDraft: `${promptDraftPrefix}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatScreenState.promptDraftCursorOffset - 1,
  });
}

export function removePromptDraftCharacterAtCursor(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.promptDraftCursorOffset >= chatScreenState.promptDraft.length) {
    return chatScreenState;
  }

  const promptDraftPrefix = chatScreenState.promptDraft.slice(0, chatScreenState.promptDraftCursorOffset);
  const promptDraftSuffix = chatScreenState.promptDraft.slice(chatScreenState.promptDraftCursorOffset + 1);
  return createPromptDraftEditedState({
    chatScreenState,
    promptDraft: `${promptDraftPrefix}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatScreenState.promptDraftCursorOffset,
  });
}

export function showPromptContextCandidatesForSelection(
  chatScreenState: ChatScreenState,
  promptContextQueryText: string,
  promptContextCandidates: readonly PromptContextCandidate[],
): ChatScreenState {
  return {
    ...chatScreenState,
    promptContextSelectionState: {
      step: "showing_prompt_context_candidates",
      promptContextQueryText,
      promptContextCandidates,
      highlightedPromptContextCandidateIndex: 0,
    },
  };
}

function findHighlightedPromptContextCandidateIndexAfterRefresh(input: {
  previousPromptContextCandidates: readonly PromptContextCandidate[];
  refreshedPromptContextCandidates: readonly PromptContextCandidate[];
  previousHighlightedPromptContextCandidateIndex: number;
}): number {
  const previouslyHighlightedPromptContextCandidate =
    input.previousPromptContextCandidates[input.previousHighlightedPromptContextCandidateIndex];
  if (previouslyHighlightedPromptContextCandidate) {
    const refreshedHighlightedPromptContextCandidateIndex = input.refreshedPromptContextCandidates.findIndex(
      (promptContextCandidate) =>
        promptContextCandidate.promptReferenceText === previouslyHighlightedPromptContextCandidate.promptReferenceText,
    );
    if (refreshedHighlightedPromptContextCandidateIndex !== -1) {
      return refreshedHighlightedPromptContextCandidateIndex;
    }
  }

  return Math.max(
    0,
    Math.min(
      input.previousHighlightedPromptContextCandidateIndex,
      input.refreshedPromptContextCandidates.length - 1,
    ),
  );
}

export function refreshPromptContextCandidatesForSelection(
  chatScreenState: ChatScreenState,
  promptContextQueryText: string,
  promptContextCandidates: readonly PromptContextCandidate[],
): ChatScreenState {
  if (chatScreenState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return showPromptContextCandidatesForSelection(chatScreenState, promptContextQueryText, promptContextCandidates);
  }

  return {
    ...chatScreenState,
    promptContextSelectionState: {
      ...chatScreenState.promptContextSelectionState,
      promptContextQueryText,
      promptContextCandidates,
      highlightedPromptContextCandidateIndex: findHighlightedPromptContextCandidateIndexAfterRefresh({
        previousPromptContextCandidates: chatScreenState.promptContextSelectionState.promptContextCandidates,
        refreshedPromptContextCandidates: promptContextCandidates,
        previousHighlightedPromptContextCandidateIndex:
          chatScreenState.promptContextSelectionState.highlightedPromptContextCandidateIndex,
      }),
    },
  };
}

export function hidePromptContextSelection(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.promptContextSelectionState.step === "hidden") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    promptContextSelectionState: { step: "hidden" },
  };
}

export function moveHighlightedPromptContextCandidateUp(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    promptContextSelectionState: {
      ...chatScreenState.promptContextSelectionState,
      highlightedPromptContextCandidateIndex: Math.max(
        0,
        chatScreenState.promptContextSelectionState.highlightedPromptContextCandidateIndex - 1,
      ),
    },
  };
}

export function moveHighlightedPromptContextCandidateDown(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return chatScreenState;
  }

  if (chatScreenState.promptContextSelectionState.promptContextCandidates.length === 0) {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    promptContextSelectionState: {
      ...chatScreenState.promptContextSelectionState,
      highlightedPromptContextCandidateIndex: Math.min(
        chatScreenState.promptContextSelectionState.promptContextCandidates.length - 1,
        chatScreenState.promptContextSelectionState.highlightedPromptContextCandidateIndex + 1,
      ),
    },
  };
}

export function selectHighlightedPromptContextCandidate(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.promptContextSelectionState.step !== "showing_prompt_context_candidates") {
    return chatScreenState;
  }

  const selectedPromptContextCandidate = chatScreenState.promptContextSelectionState.promptContextCandidates[
    chatScreenState.promptContextSelectionState.highlightedPromptContextCandidateIndex
  ];
  if (!selectedPromptContextCandidate) {
    return chatScreenState;
  }

  const activePromptContextQuery = extractActivePromptContextQueryFromPromptDraft(
    chatScreenState.promptDraft,
    chatScreenState.promptDraftCursorOffset,
  );
  if (!activePromptContextQuery) {
    return chatScreenState;
  }

  const replacedPromptContextQuery = replaceActivePromptContextQueryWithSelectedReference({
    promptDraft: chatScreenState.promptDraft,
    activePromptContextQuery,
    selectedPromptContextReferenceText: selectedPromptContextCandidate.promptReferenceText,
  });
  const promptDraft =
    activePromptContextQuery.endOffset === chatScreenState.promptDraft.length && !replacedPromptContextQuery.endsWith(" ")
      ? `${replacedPromptContextQuery} `
      : replacedPromptContextQuery;
  let promptDraftCursorOffset = activePromptContextQuery.startOffset + selectedPromptContextCandidate.promptReferenceText.length;
  if (activePromptContextQuery.endOffset === chatScreenState.promptDraft.length && !replacedPromptContextQuery.endsWith(" ")) {
    promptDraftCursorOffset += 1;
  } else if (/\s/.test(promptDraft[promptDraftCursorOffset] ?? "")) {
    promptDraftCursorOffset += 1;
  }

  return {
    ...chatScreenState,
    promptDraft,
    promptDraftCursorOffset,
    promptContextSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft,
      selectedPromptContextReferenceTexts: [
        ...chatScreenState.selectedPromptContextReferenceTexts,
        selectedPromptContextCandidate.promptReferenceText,
      ],
    }),
  };
}

// Returns the submitted text separately so the caller can fire the async
// streaming request after the reducer commits the user message; bundling the
// two would force submit callers to reach back into the transcript to find
// the text they just pushed.
export function submitPromptDraft(chatScreenState: ChatScreenState): {
  nextChatScreenState: ChatScreenState;
  submittedPromptText: string | undefined;
} {
  const submittedPromptText = chatScreenState.promptDraft.trim();
  if (
    !submittedPromptText ||
    chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
    chatScreenState.assistantResponseStatus === "waiting_for_tool_approval" ||
    chatScreenState.promptContextSelectionState.step !== "hidden" ||
    chatScreenState.modelAndReasoningSelectionState.step !== "hidden"
  ) {
    return { nextChatScreenState: chatScreenState, submittedPromptText: undefined };
  }

  return {
    submittedPromptText,
    nextChatScreenState: {
      ...chatScreenState,
      promptDraft: "",
      promptDraftCursorOffset: 0,
      assistantResponseStatus: "streaming_assistant_response",
      latestTokenUsage: undefined,
      promptContextSelectionState: { step: "hidden" },
      selectedPromptContextReferenceTexts: [],
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "message",
          message: {
            id: `user-${chatScreenState.conversationTranscript.length + 1}`,
            role: "user",
            text: submittedPromptText,
          },
        },
      ],
      streamingAssistantMessageId: STREAMING_ASSISTANT_MESSAGE_ID,
      currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
      currentTurnFooterTranscriptEntryIndex: undefined,
      currentTurnCompletedReasoningSummaryTranscriptEntryIndexes: [],
      activeToolCallTranscriptEntryIndexByToolCallId: {},
      currentPendingToolApprovalId: undefined,
    },
  };
}

// State-machine transitions for the model-selection overlay. The shape of
// the union enforces that reasoning choices only become available after a
// model has been picked, so the terminal can never show a reasoning list
// without the selected-model context needed to build it.
export function showModelSelectionLoadingState(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: { step: "loading_available_models" },
  };
}

export function showAvailableAssistantModelsForSelection(
  chatScreenState: ChatScreenState,
  availableModels: AvailableAssistantModel[],
): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "loading_available_models") {
    return chatScreenState;
  }

  if (availableModels.length === 0) {
    return {
      ...chatScreenState,
      modelAndReasoningSelectionState: {
        step: "showing_model_loading_error",
        errorMessage: "No models available.",
      },
    };
  }

  const highlightedModelIndex = Math.max(
    availableModels.findIndex((availableModel) => availableModel.id === chatScreenState.selectedModelId),
    0,
  );

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      step: "showing_available_models",
      availableModels,
      highlightedModelIndex,
    },
  };
}

export function showModelSelectionLoadingError(chatScreenState: ChatScreenState, errorMessage: string): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "loading_available_models") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      step: "showing_model_loading_error",
      errorMessage,
    },
  };
}

export function hideModelAndReasoningSelection(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: { step: "hidden" },
  };
}

function clampHighlightIndex(index: number, numberOfChoices: number): number {
  if (numberOfChoices === 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), numberOfChoices - 1);
}

// Prepends a sentinel "use the model default" choice so `undefined` is a
// first-class selectable value; without it the user could only pick an
// explicit effort and could never un-pick back to provider default.
function buildReasoningEffortChoicesForModel(selectedModel: AvailableAssistantModel): ReasoningEffortChoice[] {
  const defaultChoiceLabel = selectedModel.defaultReasoningEffort
    ? `Use model default (${selectedModel.defaultReasoningEffort})`
    : "Use model default";

  return [
    { displayLabel: defaultChoiceLabel, reasoningEffort: undefined },
    ...selectedModel.supportedReasoningEfforts.map((reasoningEffort) => ({
      displayLabel: reasoningEffort,
      reasoningEffort,
    })),
  ];
}

export function moveHighlightedModelSelectionUp(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      ...chatScreenState.modelAndReasoningSelectionState,
      highlightedModelIndex: clampHighlightIndex(
        chatScreenState.modelAndReasoningSelectionState.highlightedModelIndex - 1,
        chatScreenState.modelAndReasoningSelectionState.availableModels.length,
      ),
    },
  };
}

export function moveHighlightedModelSelectionDown(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      ...chatScreenState.modelAndReasoningSelectionState,
      highlightedModelIndex: clampHighlightIndex(
        chatScreenState.modelAndReasoningSelectionState.highlightedModelIndex + 1,
        chatScreenState.modelAndReasoningSelectionState.availableModels.length,
      ),
    },
  };
}

// Models without any reasoning choices short-circuit to hidden: forcing a
// follow-up step would present a one-item list, which is a worse affordance
// than applying the choice immediately.
export function confirmHighlightedModelSelection(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return chatScreenState;
  }

  const selectedModel =
    chatScreenState.modelAndReasoningSelectionState.availableModels[
      chatScreenState.modelAndReasoningSelectionState.highlightedModelIndex
    ];
  if (!selectedModel) {
    return chatScreenState;
  }

  if (selectedModel.supportedReasoningEfforts.length === 0) {
    return {
      ...chatScreenState,
      selectedModelId: selectedModel.id,
      selectedReasoningEffort: undefined,
      modelAndReasoningSelectionState: { step: "hidden" },
    };
  }

  const availableReasoningEffortChoices = buildReasoningEffortChoicesForModel(selectedModel);
  const highlightedReasoningEffortChoiceIndex =
    selectedModel.id === chatScreenState.selectedModelId
      ? Math.max(
          availableReasoningEffortChoices.findIndex(
            (availableReasoningEffortChoice) =>
              availableReasoningEffortChoice.reasoningEffort === chatScreenState.selectedReasoningEffort,
          ),
          0,
        )
      : 0;

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      step: "showing_reasoning_effort_choices",
      selectedModel,
      availableReasoningEffortChoices,
      highlightedReasoningEffortChoiceIndex,
    },
  };
}

export function moveHighlightedReasoningEffortChoiceUp(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      ...chatScreenState.modelAndReasoningSelectionState,
      highlightedReasoningEffortChoiceIndex: clampHighlightIndex(
        chatScreenState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex - 1,
        chatScreenState.modelAndReasoningSelectionState.availableReasoningEffortChoices.length,
      ),
    },
  };
}

export function moveHighlightedReasoningEffortChoiceDown(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    modelAndReasoningSelectionState: {
      ...chatScreenState.modelAndReasoningSelectionState,
      highlightedReasoningEffortChoiceIndex: clampHighlightIndex(
        chatScreenState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex + 1,
        chatScreenState.modelAndReasoningSelectionState.availableReasoningEffortChoices.length,
      ),
    },
  };
}

export function confirmHighlightedReasoningEffortChoice(chatScreenState: ChatScreenState): ChatScreenState {
  if (chatScreenState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return chatScreenState;
  }

  const selectedReasoningEffortChoice =
    chatScreenState.modelAndReasoningSelectionState.availableReasoningEffortChoices[
      chatScreenState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex
    ];
  if (!selectedReasoningEffortChoice) {
    return chatScreenState;
  }

  return {
    ...chatScreenState,
    selectedModelId: chatScreenState.modelAndReasoningSelectionState.selectedModel.id,
    selectedReasoningEffort: selectedReasoningEffortChoice.reasoningEffort,
    modelAndReasoningSelectionState: { step: "hidden" },
  };
}

// The reducer folds every AssistantResponseEvent kind into chat screen state.
// Reasoning-summary events follow a three-stage lifecycle:
//   assistant_reasoning_summary_started
//     appends a streaming_reasoning_summary entry; reasoning begins
//   assistant_reasoning_summary_text_chunk
//     grows the streaming entry while the reasoning text arrives
//   assistant_reasoning_summary_completed
//     replaces the streaming entry with a completed_reasoning_summary entry;
//     the token count is unknown at this point and is back-filled later
// assistant_response_completed walks the transcript backward to the most
// recent user message and patches reasoningTokenCount on every
// completed_reasoning_summary in that range with usage.reasoning.
export function applyAssistantResponseEventToChatScreenState(
  chatScreenState: ChatScreenState,
  assistantResponseEvent: AssistantResponseEvent,
): ChatScreenState {
  if (assistantResponseEvent.type === "assistant_response_started") {
    const streamingAssistantMessageId = assistantResponseEvent.messageId ?? STREAMING_ASSISTANT_MESSAGE_ID;
    return {
      ...chatScreenState,
      selectedModelId: assistantResponseEvent.model,
      assistantResponseStatus: "streaming_assistant_response",
      latestTokenUsage: undefined,
      streamingAssistantMessageId: streamingAssistantMessageId,
      currentPendingToolApprovalId: undefined,
    };
  }

  if (assistantResponseEvent.type === "assistant_response_text_chunk") {
    const streamingAssistantMessageId = chatScreenState.streamingAssistantMessageId ?? STREAMING_ASSISTANT_MESSAGE_ID;
    const currentStreamingAssistantMessage = findStreamingAssistantMessageEntry(
      chatScreenState.conversationTranscript,
      streamingAssistantMessageId,
    );
    const grownStreamingAssistantText =
      (currentStreamingAssistantMessage?.streamingProjection.fullResponseText ?? "") + assistantResponseEvent.text;

    return {
      ...chatScreenState,
      conversationTranscript: replaceStreamingAssistantMessageOrAppend(
        chatScreenState.conversationTranscript,
        streamingAssistantMessageId,
        {
          kind: "streaming_assistant_message",
          messageId: streamingAssistantMessageId,
          renderState: "streaming",
          streamingProjection: createLegacyStreamingProjectionFromText(grownStreamingAssistantText),
        },
      ),
    };
  }

  if (assistantResponseEvent.type === "assistant_response_stream_projection_updated") {
    return {
      ...chatScreenState,
      conversationTranscript: replaceStreamingAssistantMessageOrAppend(
        chatScreenState.conversationTranscript,
        assistantResponseEvent.messageId,
        {
          kind: "streaming_assistant_message",
          messageId: assistantResponseEvent.messageId,
          renderState: "streaming",
          streamingProjection: assistantResponseEvent.projection,
        },
      ),
    };
  }

  if (assistantResponseEvent.type === "assistant_response_completed") {
    const streamingAssistantMessageId = chatScreenState.streamingAssistantMessageId ?? assistantResponseEvent.message.id;
    return finalizeCurrentTurnAfterTerminalResponse(
      chatScreenState,
      assistantResponseEvent.usage,
      replaceStreamingAssistantMessageOrAppend(
        chatScreenState.conversationTranscript,
        streamingAssistantMessageId,
        { kind: "message", message: assistantResponseEvent.message },
      ),
    );
  }

  if (assistantResponseEvent.type === "assistant_response_incomplete") {
    return finalizeCurrentTurnAfterTerminalResponse(
      chatScreenState,
      assistantResponseEvent.usage,
      [
        ...updateStreamingAssistantMessageRenderState(
          chatScreenState.conversationTranscript,
          chatScreenState.streamingAssistantMessageId,
          "incomplete",
        ),
        {
          kind: "incomplete_response_notice",
          incompleteReason: assistantResponseEvent.incompleteReason,
        },
      ],
    );
  }

  if (assistantResponseEvent.type === "assistant_reasoning_summary_started") {
    const reasoningSummaryId = randomUUID();
    const reasoningSummaryTranscriptEntryIndex = chatScreenState.conversationTranscript.length;
    return {
      ...chatScreenState,
      currentStreamingReasoningSummaryId: reasoningSummaryId,
      currentStreamingReasoningSummaryTranscriptEntryIndex: reasoningSummaryTranscriptEntryIndex,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "streaming_reasoning_summary",
          reasoningSummaryId,
          reasoningSummaryText: "",
          reasoningStartedAtMs: Date.now(),
        },
      ],
    };
  }

  if (assistantResponseEvent.type === "assistant_reasoning_summary_text_chunk") {
    const reasoningSummaryId = chatScreenState.currentStreamingReasoningSummaryId;
    const reasoningSummaryTranscriptEntryIndex = chatScreenState.currentStreamingReasoningSummaryTranscriptEntryIndex;
    if (!reasoningSummaryId || reasoningSummaryTranscriptEntryIndex === undefined) {
      return chatScreenState;
    }
    const existingStreamingEntry = chatScreenState.conversationTranscript[reasoningSummaryTranscriptEntryIndex];
    if (!existingStreamingEntry || existingStreamingEntry.kind !== "streaming_reasoning_summary") {
      return chatScreenState;
    }
    if (existingStreamingEntry.reasoningSummaryId !== reasoningSummaryId) {
      return chatScreenState;
    }
    const grownStreamingEntry: ConversationTranscriptEntry = {
      ...existingStreamingEntry,
      reasoningSummaryText: existingStreamingEntry.reasoningSummaryText + assistantResponseEvent.text,
    };
    const nextConversationTranscript = [...chatScreenState.conversationTranscript];
    nextConversationTranscript[reasoningSummaryTranscriptEntryIndex] = grownStreamingEntry;
    return { ...chatScreenState, conversationTranscript: nextConversationTranscript };
  }

  if (assistantResponseEvent.type === "assistant_reasoning_summary_completed") {
    const reasoningSummaryId = chatScreenState.currentStreamingReasoningSummaryId;
    const reasoningSummaryTranscriptEntryIndex = chatScreenState.currentStreamingReasoningSummaryTranscriptEntryIndex;
    if (!reasoningSummaryId || reasoningSummaryTranscriptEntryIndex === undefined) {
      return chatScreenState;
    }
    const existingStreamingEntry = chatScreenState.conversationTranscript[reasoningSummaryTranscriptEntryIndex];
    if (!existingStreamingEntry || existingStreamingEntry.kind !== "streaming_reasoning_summary") {
      return {
        ...chatScreenState,
        currentStreamingReasoningSummaryId: undefined,
        currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
      };
    }
    if (existingStreamingEntry.reasoningSummaryId !== reasoningSummaryId) {
      return {
        ...chatScreenState,
        currentStreamingReasoningSummaryId: undefined,
        currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
      };
    }
    const completedReasoningSummaryEntry: ConversationTranscriptEntry = {
      kind: "completed_reasoning_summary",
      reasoningSummaryId: existingStreamingEntry.reasoningSummaryId,
      reasoningSummaryText: existingStreamingEntry.reasoningSummaryText,
      reasoningDurationMs: assistantResponseEvent.reasoningDurationMs,
      reasoningTokenCount: undefined,
    };
    const nextConversationTranscript = [...chatScreenState.conversationTranscript];
    nextConversationTranscript[reasoningSummaryTranscriptEntryIndex] = completedReasoningSummaryEntry;
    return {
      ...chatScreenState,
      conversationTranscript: nextConversationTranscript,
      currentStreamingReasoningSummaryId: undefined,
      currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
      currentTurnCompletedReasoningSummaryTranscriptEntryIndexes: [
        ...chatScreenState.currentTurnCompletedReasoningSummaryTranscriptEntryIndexes,
        reasoningSummaryTranscriptEntryIndex,
      ],
    };
  }

  // Failure preserves the user message so the transcript remains an honest
  // record of the turn even when the provider call did not succeed.
  if (assistantResponseEvent.type === "assistant_response_failed") {
    return {
      ...chatScreenState,
      assistantResponseStatus: "assistant_response_failed",
      streamingAssistantMessageId: undefined,
      currentStreamingReasoningSummaryId: undefined,
      currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
      currentTurnFooterTranscriptEntryIndex: undefined,
      currentTurnCompletedReasoningSummaryTranscriptEntryIndexes: [],
      activeToolCallTranscriptEntryIndexByToolCallId: {},
      currentPendingToolApprovalId: undefined,
      conversationTranscript: [
        ...updateStreamingAssistantMessageRenderState(
          chatScreenState.conversationTranscript,
          chatScreenState.streamingAssistantMessageId,
          "failed",
        ),
        { kind: "error", text: assistantResponseEvent.error },
      ],
    };
  }

  // A tool-call started event pins a new streaming_tool_call entry. The card
  // renders immediately with whatever detail was known at invocation time
  // (file path, pattern, command) so the transcript reflects the agent's
  // intent even while the tool is still running.
  if (assistantResponseEvent.type === "assistant_tool_call_started") {
    const toolCallTranscriptEntryIndex = chatScreenState.conversationTranscript.length;
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
      activeToolCallTranscriptEntryIndexByToolCallId: {
        ...chatScreenState.activeToolCallTranscriptEntryIndexByToolCallId,
        [assistantResponseEvent.toolCallId]: toolCallTranscriptEntryIndex,
      },
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "streaming_tool_call",
          toolCallId: assistantResponseEvent.toolCallId,
          toolCallDetail: assistantResponseEvent.toolCallDetail,
          toolCallStartedAtMs: Date.now(),
        },
      ],
    };
  }

  // Tool completion replaces the matching streaming entry by toolCallId. If
  // no streaming entry exists (e.g. the provider skipped the started event)
  // we still append the completion so the result is never dropped silently.
  if (assistantResponseEvent.type === "assistant_tool_call_completed") {
    const replacementResult = replaceStreamingToolCallAtTrackedIndexOrAppend({
      conversationTranscript: chatScreenState.conversationTranscript,
      activeToolCallTranscriptEntryIndexByToolCallId: chatScreenState.activeToolCallTranscriptEntryIndexByToolCallId,
      toolCallId: assistantResponseEvent.toolCallId,
      replacementEntry: {
        kind: "completed_tool_call",
        toolCallId: assistantResponseEvent.toolCallId,
        toolCallDetail: assistantResponseEvent.toolCallDetail,
        durationMs: assistantResponseEvent.durationMs,
      },
    });
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
      conversationTranscript: replacementResult.conversationTranscript,
      activeToolCallTranscriptEntryIndexByToolCallId: replacementResult.activeToolCallTranscriptEntryIndexByToolCallId,
    };
  }

  // Mirror of the completion path, but the swapped-in entry carries the
  // error text so the failed card can surface why the tool did not finish.
  if (assistantResponseEvent.type === "assistant_tool_call_failed") {
    const replacementResult = replaceStreamingToolCallAtTrackedIndexOrAppend({
      conversationTranscript: chatScreenState.conversationTranscript,
      activeToolCallTranscriptEntryIndexByToolCallId: chatScreenState.activeToolCallTranscriptEntryIndexByToolCallId,
      toolCallId: assistantResponseEvent.toolCallId,
      replacementEntry: {
        kind: "failed_tool_call",
        toolCallId: assistantResponseEvent.toolCallId,
        toolCallDetail: assistantResponseEvent.toolCallDetail,
        errorText: assistantResponseEvent.errorText,
        durationMs: assistantResponseEvent.durationMs,
      },
    });
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
      conversationTranscript: replacementResult.conversationTranscript,
      activeToolCallTranscriptEntryIndexByToolCallId: replacementResult.activeToolCallTranscriptEntryIndexByToolCallId,
    };
  }

  if (assistantResponseEvent.type === "assistant_tool_call_denied") {
    const nextActiveToolCallTranscriptEntryIndexByToolCallId = {
      ...chatScreenState.activeToolCallTranscriptEntryIndexByToolCallId,
    };
    delete nextActiveToolCallTranscriptEntryIndexByToolCallId[assistantResponseEvent.toolCallId];
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
      activeToolCallTranscriptEntryIndexByToolCallId: nextActiveToolCallTranscriptEntryIndexByToolCallId,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "denied_tool_call",
          toolCallId: assistantResponseEvent.toolCallId,
          toolCallDetail: assistantResponseEvent.toolCallDetail,
          denialText: assistantResponseEvent.denialText,
        },
      ],
    };
  }

  if (assistantResponseEvent.type === "assistant_plan_proposed") {
    return {
      ...chatScreenState,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "plan_proposal",
          planId: assistantResponseEvent.planId,
          planTitle: assistantResponseEvent.planTitle,
          planSteps: assistantResponseEvent.planSteps,
        },
      ],
    };
  }

  if (assistantResponseEvent.type === "assistant_rate_limit_pending") {
    return {
      ...chatScreenState,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "rate_limit_notice",
          rateLimitNoticeId: randomUUID(),
          retryAfterSeconds: assistantResponseEvent.retryAfterSeconds,
          limitExplanation: assistantResponseEvent.limitExplanation,
          noticeStartedAtMs: Date.now(),
        },
      ],
    };
  }

  if (assistantResponseEvent.type === "assistant_tool_approval_requested") {
    return {
      ...chatScreenState,
      assistantResponseStatus: "waiting_for_tool_approval",
      currentPendingToolApprovalId: assistantResponseEvent.approvalId,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "tool_approval_request",
          approvalId: assistantResponseEvent.approvalId,
          pendingToolCallId: assistantResponseEvent.pendingToolCallId,
          pendingToolCallDetail: assistantResponseEvent.pendingToolCallDetail,
          riskExplanation: assistantResponseEvent.riskExplanation,
        },
      ],
    };
  }

  if (assistantResponseEvent.type === "assistant_turn_completed") {
    const turnFooterTranscriptEntryIndex = chatScreenState.conversationTranscript.length;
    return {
      ...chatScreenState,
      currentTurnFooterTranscriptEntryIndex: turnFooterTranscriptEntryIndex,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "turn_footer",
          turnFooterId: randomUUID(),
          turnDurationMs: assistantResponseEvent.turnDurationMs,
          usage: undefined,
          modelDisplayName: assistantResponseEvent.modelDisplayName,
        },
      ],
    };
  }

  // Exhaustiveness: if a new arm is added to AssistantResponseEvent without
  // a matching branch above, TypeScript flags this line as a type error.
  const unreachableAssistantResponseEvent: never = assistantResponseEvent;
  return unreachableAssistantResponseEvent;
}

function replaceStreamingToolCallAtTrackedIndexOrAppend(input: {
  conversationTranscript: ConversationTranscriptEntry[];
  activeToolCallTranscriptEntryIndexByToolCallId: Record<string, number>;
  toolCallId: string;
  replacementEntry: ConversationTranscriptEntry;
}): {
  conversationTranscript: ConversationTranscriptEntry[];
  activeToolCallTranscriptEntryIndexByToolCallId: Record<string, number>;
} {
  const trackedStreamingEntryIndex = input.activeToolCallTranscriptEntryIndexByToolCallId[input.toolCallId];
  const nextActiveToolCallTranscriptEntryIndexByToolCallId = {
    ...input.activeToolCallTranscriptEntryIndexByToolCallId,
  };
  delete nextActiveToolCallTranscriptEntryIndexByToolCallId[input.toolCallId];

  if (trackedStreamingEntryIndex === undefined) {
    return {
      conversationTranscript: [...input.conversationTranscript, input.replacementEntry],
      activeToolCallTranscriptEntryIndexByToolCallId: nextActiveToolCallTranscriptEntryIndexByToolCallId,
    };
  }

  const trackedStreamingEntry = input.conversationTranscript[trackedStreamingEntryIndex];
  if (
    !trackedStreamingEntry ||
    trackedStreamingEntry.kind !== "streaming_tool_call" ||
    trackedStreamingEntry.toolCallId !== input.toolCallId
  ) {
    return {
      conversationTranscript: [...input.conversationTranscript, input.replacementEntry],
      activeToolCallTranscriptEntryIndexByToolCallId: nextActiveToolCallTranscriptEntryIndexByToolCallId,
    };
  }

  const nextConversationTranscript = [...input.conversationTranscript];
  nextConversationTranscript[trackedStreamingEntryIndex] = input.replacementEntry;
  return {
    conversationTranscript: nextConversationTranscript,
    activeToolCallTranscriptEntryIndexByToolCallId: nextActiveToolCallTranscriptEntryIndexByToolCallId,
  };
}

function findStreamingAssistantMessageEntry(
  conversationTranscript: ConversationTranscriptEntry[],
  messageId: string,
): Extract<ConversationTranscriptEntry, { kind: "streaming_assistant_message" }> | undefined {
  const streamingAssistantMessageEntry = conversationTranscript.find(
    (conversationTranscriptEntry) =>
      conversationTranscriptEntry.kind === "streaming_assistant_message" &&
      conversationTranscriptEntry.messageId === messageId,
  );
  return streamingAssistantMessageEntry?.kind === "streaming_assistant_message"
    ? streamingAssistantMessageEntry
    : undefined;
}

function replaceStreamingAssistantMessageOrAppend(
  conversationTranscript: ConversationTranscriptEntry[],
  messageId: string,
  replacementEntry: Extract<ConversationTranscriptEntry, { kind: "streaming_assistant_message" | "message" }>,
): ConversationTranscriptEntry[] {
  const streamingAssistantMessageEntryIndex = conversationTranscript.findIndex(
    (conversationTranscriptEntry) =>
      conversationTranscriptEntry.kind === "streaming_assistant_message" &&
      conversationTranscriptEntry.messageId === messageId,
  );
  if (streamingAssistantMessageEntryIndex === -1) {
    return [...conversationTranscript, replacementEntry];
  }

  const nextConversationTranscript = [...conversationTranscript];
  nextConversationTranscript[streamingAssistantMessageEntryIndex] = replacementEntry;
  return nextConversationTranscript;
}

function updateStreamingAssistantMessageRenderState(
  conversationTranscript: ConversationTranscriptEntry[],
  streamingAssistantMessageId: string | undefined,
  renderState: Extract<ConversationTranscriptEntry, { kind: "streaming_assistant_message" }>['renderState'],
): ConversationTranscriptEntry[] {
  if (!streamingAssistantMessageId) {
    return conversationTranscript;
  }

  return conversationTranscript.map((conversationTranscriptEntry) =>
    conversationTranscriptEntry.kind === "streaming_assistant_message" &&
    conversationTranscriptEntry.messageId === streamingAssistantMessageId
      ? {
          ...conversationTranscriptEntry,
          renderState,
        }
      : conversationTranscriptEntry,
  );
}

function finalizeCurrentTurnAfterTerminalResponse(
  chatScreenState: ChatScreenState,
  usage: TokenUsage,
  conversationTranscript: ConversationTranscriptEntry[],
): ChatScreenState {
  const conversationTranscriptWithReasoningTokenCount = backfillReasoningTokenCountIntoIndexedEntries(
    conversationTranscript,
    chatScreenState.currentTurnCompletedReasoningSummaryTranscriptEntryIndexes,
    usage.reasoning,
  );
  const conversationTranscriptWithTurnFooterUsage = backfillUsageIntoTrackedTurnFooter(
    conversationTranscriptWithReasoningTokenCount,
    chatScreenState.currentTurnFooterTranscriptEntryIndex,
    usage,
  );

  return {
    ...chatScreenState,
    assistantResponseStatus: "waiting_for_user_input",
    latestTokenUsage: usage,
    conversationTranscript: conversationTranscriptWithTurnFooterUsage,
    streamingAssistantMessageId: undefined,
    currentStreamingReasoningSummaryId: undefined,
    currentStreamingReasoningSummaryTranscriptEntryIndex: undefined,
    currentTurnFooterTranscriptEntryIndex: undefined,
    currentTurnCompletedReasoningSummaryTranscriptEntryIndexes: [],
    activeToolCallTranscriptEntryIndexByToolCallId: {},
    currentPendingToolApprovalId: undefined,
  };
}

function backfillUsageIntoTrackedTurnFooter(
  conversationTranscript: ConversationTranscriptEntry[],
  turnFooterTranscriptEntryIndex: number | undefined,
  usage: TokenUsage,
): ConversationTranscriptEntry[] {
  if (turnFooterTranscriptEntryIndex === undefined) {
    return conversationTranscript;
  }

  const turnFooterTranscriptEntry = conversationTranscript[turnFooterTranscriptEntryIndex];
  if (!turnFooterTranscriptEntry || turnFooterTranscriptEntry.kind !== "turn_footer") {
    return conversationTranscript;
  }

  const nextConversationTranscript = [...conversationTranscript];
  nextConversationTranscript[turnFooterTranscriptEntryIndex] = {
    ...turnFooterTranscriptEntry,
    usage,
  };
  return nextConversationTranscript;
}

function backfillReasoningTokenCountIntoIndexedEntries(
  conversationTranscript: ConversationTranscriptEntry[],
  completedReasoningSummaryTranscriptEntryIndexes: readonly number[],
  reasoningTokenCount: number,
): ConversationTranscriptEntry[] {
  if (completedReasoningSummaryTranscriptEntryIndexes.length === 0) {
    return conversationTranscript;
  }

  const nextConversationTranscript = [...conversationTranscript];
  for (const completedReasoningSummaryTranscriptEntryIndex of completedReasoningSummaryTranscriptEntryIndexes) {
    const conversationTranscriptEntry = nextConversationTranscript[completedReasoningSummaryTranscriptEntryIndex];
    if (conversationTranscriptEntry?.kind === "completed_reasoning_summary") {
      nextConversationTranscript[completedReasoningSummaryTranscriptEntryIndex] = {
        ...conversationTranscriptEntry,
        reasoningTokenCount,
      };
    }
  }
  return nextConversationTranscript;
}
