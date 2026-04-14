import { randomUUID } from "node:crypto";
import {
  type AssistantResponseEvent,
  type AvailableAssistantModel,
  type ReasoningEffort,
  type TokenUsage,
  type TranscriptMessage,
} from "@buli/contracts";

// This file is the state machine for the terminal chat screen.
//
// It does not talk to Ink, React, or OpenAI directly.
// Instead, it describes how the chat screen data changes over time.
//
// Each exported function takes the current screen state and returns the next one.
// That keeps the screen behavior predictable and easy to test.
//
// There are two main stories in this file:
// 1. The user types a prompt, submits it, and receives a streamed assistant response.
// 2. The user opens the model selection flow, chooses a model, and may choose a reasoning effort.

const STREAMING_ASSISTANT_MESSAGE_ID = "assistant-streaming";

export type AuthenticationState = "ready" | "missing";
export type AssistantResponseStatus = "waiting_for_user_input" | "streaming_assistant_response" | "assistant_response_failed";

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
    };

export type ChatScreenState = {
  authenticationState: AuthenticationState;
  selectedModelId: string;
  selectedReasoningEffort: ReasoningEffort | undefined;
  assistantResponseStatus: AssistantResponseStatus;
  promptDraft: string;
  latestTokenUsage: TokenUsage | undefined;
  conversationTranscript: ConversationTranscriptEntry[];
  streamingAssistantMessageId: string | undefined;
  currentStreamingReasoningSummaryId: string | undefined;
  modelAndReasoningSelectionState: ModelAndReasoningSelectionState;
};

// This is all the information needed to draw one terminal frame.
// If any field here changes, React runs again and Ink redraws the changed output.
export function createInitialChatScreenState(input: {
  authenticationState: AuthenticationState;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): ChatScreenState {
  return {
    authenticationState: input.authenticationState,
    selectedModelId: input.selectedModelId,
    selectedReasoningEffort: input.selectedReasoningEffort,
    assistantResponseStatus: "waiting_for_user_input",
    promptDraft: "",
    latestTokenUsage: undefined,
    conversationTranscript: [],
    streamingAssistantMessageId: undefined,
    currentStreamingReasoningSummaryId: undefined,
    modelAndReasoningSelectionState: { step: "hidden" },
  };
}

export function appendTypedTextToPromptDraft(chatScreenState: ChatScreenState, typedText: string): ChatScreenState {
  return {
    ...chatScreenState,
    promptDraft: chatScreenState.promptDraft + typedText,
  };
}

export function removeLastCharacterFromPromptDraft(chatScreenState: ChatScreenState): ChatScreenState {
  return {
    ...chatScreenState,
    promptDraft: chatScreenState.promptDraft.slice(0, -1),
  };
}

// Submitting a prompt draft changes the screen in one immediate step.
// The draft is cleared, the user's message is added to the transcript,
// and the screen enters the streaming assistant response phase.
//
// The assistant text does not appear here yet.
// That arrives later through assistant response events.
export function submitPromptDraft(chatScreenState: ChatScreenState): {
  nextChatScreenState: ChatScreenState;
  submittedPromptText: string | undefined;
} {
  const submittedPromptText = chatScreenState.promptDraft.trim();
  if (
    !submittedPromptText ||
    chatScreenState.assistantResponseStatus === "streaming_assistant_response" ||
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
    },
  };
}

// The model selection flow moves through these phases:
// hidden
// -> loading_available_models
// -> showing_available_models
// -> showing_reasoning_effort_choices
// -> hidden
//
// If loading fails, it goes to showing_model_loading_error instead.
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

// The reasoning list always includes one extra choice: use the model default.
// That lets the screen represent both an explicit reasoning choice
// and the absence of one.
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

// Confirming a model can end the selection flow immediately,
// or it can open a second step for reasoning effort.
//
// Models without reasoning choices are applied right away.
// Models with reasoning choices open a follow-up list.
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
      return {
        ...chatScreenState,
        conversationTranscript: [
          ...chatScreenState.conversationTranscript.slice(0, -1),
          {
            kind: "message",
            message: {
              ...lastTranscriptEntry.message,
              text: lastTranscriptEntry.message.text + assistantResponseEvent.text,
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

    const reasoningTokenCount = assistantResponseEvent.usage.reasoning;
    const nextConversationTranscript = backfillReasoningTokenCountInCurrentTurn(
      nextConversationTranscriptWithAssistantMessage,
      reasoningTokenCount,
    );

    return {
      ...chatScreenState,
      assistantResponseStatus: "waiting_for_user_input",
      latestTokenUsage: assistantResponseEvent.usage,
      conversationTranscript: nextConversationTranscript,
      streamingAssistantMessageId: undefined,
      currentStreamingReasoningSummaryId: undefined,
    };
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
      return chatScreenState;
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

  // A failed response does not remove the user's submitted message.
  // It adds an error entry after it so the screen still shows what happened.
  if (assistantResponseEvent.type === "assistant_response_failed") {
    return {
      ...chatScreenState,
      assistantResponseStatus: "assistant_response_failed",
      streamingAssistantMessageId: undefined,
      currentStreamingReasoningSummaryId: undefined,
      conversationTranscript: [
        ...chatScreenState.conversationTranscript,
        { kind: "error", text: assistantResponseEvent.error },
      ],
    };
  }

  // Exhaustiveness: if a new arm is added to AssistantResponseEvent without
  // a matching branch above, TypeScript flags this line as a type error.
  const unreachableAssistantResponseEvent: never = assistantResponseEvent;
  return unreachableAssistantResponseEvent;
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
