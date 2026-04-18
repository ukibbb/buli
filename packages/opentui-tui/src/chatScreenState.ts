import { randomUUID } from "node:crypto";
import {
  type AssistantResponseEvent,
  type AvailableAssistantModel,
  type PlanStep,
  type ReasoningEffort,
  type TokenUsage,
  type ToolCallDetail,
  type TranscriptMessage,
} from "@buli/contracts";
import {
  parseAssistantResponseIntoContentParts,
  type PromptContextCandidate,
  reconcileSelectedPromptContextReferenceTextsWithPromptDraft,
  replaceTrailingPromptContextQueryWithSelectedReference,
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
  latestTokenUsage: TokenUsage | undefined;
  conversationTranscript: ConversationTranscriptEntry[];
  streamingAssistantMessageId: string | undefined;
  currentStreamingReasoningSummaryId: string | undefined;
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
    latestTokenUsage: undefined,
    conversationTranscript: [],
    streamingAssistantMessageId: undefined,
    currentStreamingReasoningSummaryId: undefined,
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

export function appendTypedTextToPromptDraft(chatScreenState: ChatScreenState, typedText: string): ChatScreenState {
  const promptDraft = chatScreenState.promptDraft + typedText;
  return {
    ...chatScreenState,
    promptDraft,
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft,
      selectedPromptContextReferenceTexts: chatScreenState.selectedPromptContextReferenceTexts,
    }),
  };
}

export function removeLastCharacterFromPromptDraft(chatScreenState: ChatScreenState): ChatScreenState {
  const promptDraft = chatScreenState.promptDraft.slice(0, -1);
  return {
    ...chatScreenState,
    promptDraft,
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft,
      selectedPromptContextReferenceTexts: chatScreenState.selectedPromptContextReferenceTexts,
    }),
  };
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

  const replacedPromptContextQuery = replaceTrailingPromptContextQueryWithSelectedReference({
    promptDraft: chatScreenState.promptDraft,
    selectedPromptContextReferenceText: selectedPromptContextCandidate.promptReferenceText,
  });
  const promptDraft = replacedPromptContextQuery.endsWith(" ") ? replacedPromptContextQuery : `${replacedPromptContextQuery} `;
  return {
    ...chatScreenState,
    promptDraft,
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
    return {
      ...chatScreenState,
      selectedModelId: assistantResponseEvent.model,
      assistantResponseStatus: "streaming_assistant_response",
      latestTokenUsage: undefined,
      streamingAssistantMessageId: STREAMING_ASSISTANT_MESSAGE_ID,
      currentPendingToolApprovalId: undefined,
    };
  }

  if (assistantResponseEvent.type === "assistant_response_text_chunk") {
    const lastTranscriptEntry = chatScreenState.conversationTranscript.at(-1);
    // While text is still streaming, keep rewriting the same last assistant row
    // so the transcript shows one growing message instead of many tiny fragments.
    if (
      lastTranscriptEntry?.kind === "message" &&
      lastTranscriptEntry.message.id === chatScreenState.streamingAssistantMessageId
    ) {
      const grownText = lastTranscriptEntry.message.text + assistantResponseEvent.text;
      return {
        ...chatScreenState,
        conversationTranscript: [
          ...chatScreenState.conversationTranscript.slice(0, -1),
          {
            kind: "message",
            message: {
              ...lastTranscriptEntry.message,
              text: grownText,
              assistantContentParts: [...parseAssistantResponseIntoContentParts(grownText)],
            },
          },
        ],
      };
    }

    return {
      ...chatScreenState,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        {
          kind: "message",
          message: {
            id: chatScreenState.streamingAssistantMessageId ?? STREAMING_ASSISTANT_MESSAGE_ID,
            role: "assistant",
            text: assistantResponseEvent.text,
            assistantContentParts: [...parseAssistantResponseIntoContentParts(assistantResponseEvent.text)],
          },
        },
      ],
    };
  }

  if (assistantResponseEvent.type === "assistant_response_completed") {
    const lastTranscriptEntry = chatScreenState.conversationTranscript.at(-1);
    // When the response is finished, replace the temporary streaming row
    // with the final assistant message so the transcript ends with one stable entry.
    const nextConversationTranscriptWithAssistantMessage =
      lastTranscriptEntry?.kind === "message" &&
      lastTranscriptEntry.message.id === chatScreenState.streamingAssistantMessageId
        ? [
            ...chatScreenState.conversationTranscript.slice(0, -1),
            { kind: "message" as const, message: assistantResponseEvent.message },
          ]
        : [
            ...chatScreenState.conversationTranscript,
            { kind: "message" as const, message: assistantResponseEvent.message },
          ];

    return finalizeCurrentTurnAfterTerminalResponse(
      chatScreenState,
      assistantResponseEvent.usage,
      nextConversationTranscriptWithAssistantMessage,
    );
  }

  if (assistantResponseEvent.type === "assistant_response_incomplete") {
    return finalizeCurrentTurnAfterTerminalResponse(
      chatScreenState,
      assistantResponseEvent.usage,
      [
        ...chatScreenState.conversationTranscript,
        {
          kind: "incomplete_response_notice",
          incompleteReason: assistantResponseEvent.incompleteReason,
        },
      ],
    );
  }

  if (assistantResponseEvent.type === "assistant_reasoning_summary_started") {
    const reasoningSummaryId = randomUUID();
    return {
      ...chatScreenState,
      currentStreamingReasoningSummaryId: reasoningSummaryId,
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
    if (!reasoningSummaryId) {
      return chatScreenState;
    }
    const entryIndex = chatScreenState.conversationTranscript.findIndex(
      (conversationTranscriptEntry) =>
        conversationTranscriptEntry.kind === "streaming_reasoning_summary" &&
        conversationTranscriptEntry.reasoningSummaryId === reasoningSummaryId,
    );
    if (entryIndex === -1) {
      return chatScreenState;
    }
    const existingStreamingEntry = chatScreenState.conversationTranscript[entryIndex];
    if (!existingStreamingEntry || existingStreamingEntry.kind !== "streaming_reasoning_summary") {
      return chatScreenState;
    }
    const grownStreamingEntry: ConversationTranscriptEntry = {
      ...existingStreamingEntry,
      reasoningSummaryText: existingStreamingEntry.reasoningSummaryText + assistantResponseEvent.text,
    };
    const nextConversationTranscript = [...chatScreenState.conversationTranscript];
    nextConversationTranscript[entryIndex] = grownStreamingEntry;
    return { ...chatScreenState, conversationTranscript: nextConversationTranscript };
  }

  if (assistantResponseEvent.type === "assistant_reasoning_summary_completed") {
    const reasoningSummaryId = chatScreenState.currentStreamingReasoningSummaryId;
    if (!reasoningSummaryId) {
      return chatScreenState;
    }
    const entryIndex = chatScreenState.conversationTranscript.findIndex(
      (conversationTranscriptEntry) =>
        conversationTranscriptEntry.kind === "streaming_reasoning_summary" &&
        conversationTranscriptEntry.reasoningSummaryId === reasoningSummaryId,
    );
    if (entryIndex === -1) {
      return { ...chatScreenState, currentStreamingReasoningSummaryId: undefined };
    }
    const existingStreamingEntry = chatScreenState.conversationTranscript[entryIndex];
    if (!existingStreamingEntry || existingStreamingEntry.kind !== "streaming_reasoning_summary") {
      return { ...chatScreenState, currentStreamingReasoningSummaryId: undefined };
    }
    const completedReasoningSummaryEntry: ConversationTranscriptEntry = {
      kind: "completed_reasoning_summary",
      reasoningSummaryId: existingStreamingEntry.reasoningSummaryId,
      reasoningSummaryText: existingStreamingEntry.reasoningSummaryText,
      reasoningDurationMs: assistantResponseEvent.reasoningDurationMs,
      reasoningTokenCount: undefined,
    };
    const nextConversationTranscript = [...chatScreenState.conversationTranscript];
    nextConversationTranscript[entryIndex] = completedReasoningSummaryEntry;
    return {
      ...chatScreenState,
      conversationTranscript: nextConversationTranscript,
      currentStreamingReasoningSummaryId: undefined,
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
      currentPendingToolApprovalId: undefined,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        { kind: "error", text: assistantResponseEvent.error },
      ],
    };
  }

  // A tool-call started event pins a new streaming_tool_call entry. The card
  // renders immediately with whatever detail was known at invocation time
  // (file path, pattern, command) so the transcript reflects the agent's
  // intent even while the tool is still running.
  if (assistantResponseEvent.type === "assistant_tool_call_started") {
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
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
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
      conversationTranscript: replaceStreamingToolCallOrAppend(
        chatScreenState.conversationTranscript,
        assistantResponseEvent.toolCallId,
        {
          kind: "completed_tool_call",
          toolCallId: assistantResponseEvent.toolCallId,
          toolCallDetail: assistantResponseEvent.toolCallDetail,
          durationMs: assistantResponseEvent.durationMs,
        },
      ),
    };
  }

  // Mirror of the completion path, but the swapped-in entry carries the
  // error text so the failed card can surface why the tool did not finish.
  if (assistantResponseEvent.type === "assistant_tool_call_failed") {
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
      conversationTranscript: replaceStreamingToolCallOrAppend(
        chatScreenState.conversationTranscript,
        assistantResponseEvent.toolCallId,
        {
          kind: "failed_tool_call",
          toolCallId: assistantResponseEvent.toolCallId,
          toolCallDetail: assistantResponseEvent.toolCallDetail,
          errorText: assistantResponseEvent.errorText,
          durationMs: assistantResponseEvent.durationMs,
        },
      ),
    };
  }

  if (assistantResponseEvent.type === "assistant_tool_call_denied") {
    return {
      ...chatScreenState,
      assistantResponseStatus: "streaming_assistant_response",
      currentPendingToolApprovalId: undefined,
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
    return {
      ...chatScreenState,
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

function replaceStreamingToolCallOrAppend(
  conversationTranscript: ConversationTranscriptEntry[],
  toolCallId: string,
  replacementEntry: ConversationTranscriptEntry,
): ConversationTranscriptEntry[] {
  const streamingEntryIndex = conversationTranscript.findIndex(
    (conversationTranscriptEntry) =>
      conversationTranscriptEntry.kind === "streaming_tool_call" &&
      conversationTranscriptEntry.toolCallId === toolCallId,
  );
  if (streamingEntryIndex === -1) {
    return [...conversationTranscript, replacementEntry];
  }
  const nextConversationTranscript = [...conversationTranscript];
  nextConversationTranscript[streamingEntryIndex] = replacementEntry;
  return nextConversationTranscript;
}

function finalizeCurrentTurnAfterTerminalResponse(
  chatScreenState: ChatScreenState,
  usage: TokenUsage,
  conversationTranscript: ConversationTranscriptEntry[],
): ChatScreenState {
  const conversationTranscriptWithReasoningTokenCount = backfillReasoningTokenCountInCurrentTurn(
    conversationTranscript,
    usage.reasoning,
  );
  const conversationTranscriptWithTurnFooterUsage = backfillUsageIntoCurrentTurnFooter(
    conversationTranscriptWithReasoningTokenCount,
    usage,
  );

  return {
    ...chatScreenState,
    assistantResponseStatus: "waiting_for_user_input",
      latestTokenUsage: usage,
      conversationTranscript: conversationTranscriptWithTurnFooterUsage,
      streamingAssistantMessageId: undefined,
      currentStreamingReasoningSummaryId: undefined,
      currentPendingToolApprovalId: undefined,
    };
}

function backfillUsageIntoCurrentTurnFooter(
  conversationTranscript: ConversationTranscriptEntry[],
  usage: TokenUsage,
): ConversationTranscriptEntry[] {
  const nextConversationTranscript = [...conversationTranscript];

  for (let index = nextConversationTranscript.length - 1; index >= 0; index -= 1) {
    const conversationTranscriptEntry = nextConversationTranscript[index];
    if (!conversationTranscriptEntry) {
      continue;
    }
    if (conversationTranscriptEntry.kind === "message" && conversationTranscriptEntry.message.role === "user") {
      break;
    }
    if (conversationTranscriptEntry.kind === "turn_footer") {
      nextConversationTranscript[index] = {
        ...conversationTranscriptEntry,
        usage,
      };
      break;
    }
  }

  return nextConversationTranscript;
}

function backfillReasoningTokenCountInCurrentTurn(
  conversationTranscript: ConversationTranscriptEntry[],
  reasoningTokenCount: number,
): ConversationTranscriptEntry[] {
  // Walks the transcript backward to the most recent user message. Every
  // completed_reasoning_summary entry between now and that user message
  // belongs to the turn that just finished, so we patch its token count.
  const nextConversationTranscript = [...conversationTranscript];
  for (let index = nextConversationTranscript.length - 1; index >= 0; index -= 1) {
    const conversationTranscriptEntry = nextConversationTranscript[index];
    if (!conversationTranscriptEntry) {
      continue;
    }
    if (
      conversationTranscriptEntry.kind === "message" &&
      conversationTranscriptEntry.message.role === "user"
    ) {
      break;
    }
    if (conversationTranscriptEntry.kind === "completed_reasoning_summary") {
      nextConversationTranscript[index] = {
        ...conversationTranscriptEntry,
        reasoningTokenCount,
      };
    }
  }
  return nextConversationTranscript;
}
