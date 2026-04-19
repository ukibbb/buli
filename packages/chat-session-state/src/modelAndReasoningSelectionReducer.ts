import type { AvailableAssistantModel } from "@buli/contracts";
import type { ChatSessionState, ReasoningEffortChoice } from "./chatSessionState.ts";

function clampHighlightIndex(index: number, numberOfChoices: number): number {
  if (numberOfChoices === 0) {
    return 0;
  }

  return Math.min(Math.max(index, 0), numberOfChoices - 1);
}

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

export function showModelSelectionLoadingState(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: { step: "loading_available_models" },
  };
}

export function showAvailableAssistantModelsForSelection(
  chatSessionState: ChatSessionState,
  availableModels: AvailableAssistantModel[],
): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "loading_available_models") {
    return chatSessionState;
  }

  if (availableModels.length === 0) {
    return {
      ...chatSessionState,
      modelAndReasoningSelectionState: {
        step: "showing_model_loading_error",
        errorMessage: "No models available.",
      },
    };
  }

  const highlightedModelIndex = Math.max(
    availableModels.findIndex((availableModel) => availableModel.id === chatSessionState.selectedModelId),
    0,
  );

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      step: "showing_available_models",
      availableModels,
      highlightedModelIndex,
    },
  };
}

export function showModelSelectionLoadingError(chatSessionState: ChatSessionState, errorMessage: string): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "loading_available_models") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      step: "showing_model_loading_error",
      errorMessage,
    },
  };
}

export function hideModelAndReasoningSelection(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: { step: "hidden" },
  };
}

export function moveHighlightedModelSelectionUp(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      ...chatSessionState.modelAndReasoningSelectionState,
      highlightedModelIndex: clampHighlightIndex(
        chatSessionState.modelAndReasoningSelectionState.highlightedModelIndex - 1,
        chatSessionState.modelAndReasoningSelectionState.availableModels.length,
      ),
    },
  };
}

export function moveHighlightedModelSelectionDown(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      ...chatSessionState.modelAndReasoningSelectionState,
      highlightedModelIndex: clampHighlightIndex(
        chatSessionState.modelAndReasoningSelectionState.highlightedModelIndex + 1,
        chatSessionState.modelAndReasoningSelectionState.availableModels.length,
      ),
    },
  };
}

export function confirmHighlightedModelSelection(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_available_models") {
    return chatSessionState;
  }

  const selectedModel =
    chatSessionState.modelAndReasoningSelectionState.availableModels[
      chatSessionState.modelAndReasoningSelectionState.highlightedModelIndex
    ];
  if (!selectedModel) {
    return chatSessionState;
  }

  if (selectedModel.supportedReasoningEfforts.length === 0) {
    return {
      ...chatSessionState,
      selectedModelId: selectedModel.id,
      selectedReasoningEffort: undefined,
      modelAndReasoningSelectionState: { step: "hidden" },
    };
  }

  const availableReasoningEffortChoices = buildReasoningEffortChoicesForModel(selectedModel);
  const highlightedReasoningEffortChoiceIndex =
    selectedModel.id === chatSessionState.selectedModelId
      ? Math.max(
          availableReasoningEffortChoices.findIndex(
            (availableReasoningEffortChoice) =>
              availableReasoningEffortChoice.reasoningEffort === chatSessionState.selectedReasoningEffort,
          ),
          0,
        )
      : 0;

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      step: "showing_reasoning_effort_choices",
      selectedModel,
      availableReasoningEffortChoices,
      highlightedReasoningEffortChoiceIndex,
    },
  };
}

export function moveHighlightedReasoningEffortChoiceUp(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      ...chatSessionState.modelAndReasoningSelectionState,
      highlightedReasoningEffortChoiceIndex: clampHighlightIndex(
        chatSessionState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex - 1,
        chatSessionState.modelAndReasoningSelectionState.availableReasoningEffortChoices.length,
      ),
    },
  };
}

export function moveHighlightedReasoningEffortChoiceDown(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    modelAndReasoningSelectionState: {
      ...chatSessionState.modelAndReasoningSelectionState,
      highlightedReasoningEffortChoiceIndex: clampHighlightIndex(
        chatSessionState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex + 1,
        chatSessionState.modelAndReasoningSelectionState.availableReasoningEffortChoices.length,
      ),
    },
  };
}

export function confirmHighlightedReasoningEffortChoice(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.modelAndReasoningSelectionState.step !== "showing_reasoning_effort_choices") {
    return chatSessionState;
  }

  const selectedReasoningEffortChoice =
    chatSessionState.modelAndReasoningSelectionState.availableReasoningEffortChoices[
      chatSessionState.modelAndReasoningSelectionState.highlightedReasoningEffortChoiceIndex
    ];
  if (!selectedReasoningEffortChoice) {
    return chatSessionState;
  }

  return {
    ...chatSessionState,
    selectedModelId: chatSessionState.modelAndReasoningSelectionState.selectedModel.id,
    selectedReasoningEffort: selectedReasoningEffortChoice.reasoningEffort,
    modelAndReasoningSelectionState: { step: "hidden" },
  };
}
