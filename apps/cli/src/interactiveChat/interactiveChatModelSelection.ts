import type {
  ConversationSessionModelSelection,
  ReasoningEffort,
} from "@buli/contracts";

const DEFAULT_MODEL_ID = "gpt-5.5";
const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

export type InitialConversationSessionModelSelectionResolution = {
  modelSelection: ConversationSessionModelSelection;
  selectedModelDefaultReasoningEffort?: ReasoningEffort | undefined;
  selectedReasoningEffort?: ReasoningEffort | undefined;
};

export function resolveInitialConversationSessionModelSelection(input: {
  requestedModelId: string | undefined;
  requestedReasoningEffort: ReasoningEffort | undefined;
  persistedModelSelection: ConversationSessionModelSelection | undefined;
}): InitialConversationSessionModelSelectionResolution {
  const selectedModelId = input.requestedModelId ?? input.persistedModelSelection?.selectedModelId ?? DEFAULT_MODEL_ID;
  const selectedModelDefaultReasoningEffort = input.requestedModelId
    ? lookupKnownModelDefaultReasoningEffort(selectedModelId)
    : input.persistedModelSelection?.selectedModelDefaultReasoningEffort ??
      lookupKnownModelDefaultReasoningEffort(selectedModelId);
  const selectedReasoningEffort = input.requestedReasoningEffort ?? (
    input.requestedModelId
      ? DEFAULT_REASONING_EFFORT
      : input.persistedModelSelection
        ? input.persistedModelSelection.selectedReasoningEffort
        : DEFAULT_REASONING_EFFORT
  );
  const modelSelection: ConversationSessionModelSelection = {
    selectedModelId,
    ...(selectedModelDefaultReasoningEffort ? { selectedModelDefaultReasoningEffort } : {}),
    ...(selectedReasoningEffort ? { selectedReasoningEffort } : {}),
  };

  return {
    modelSelection,
    ...(selectedModelDefaultReasoningEffort ? { selectedModelDefaultReasoningEffort } : {}),
    ...(selectedReasoningEffort ? { selectedReasoningEffort } : {}),
  };
}

function lookupKnownModelDefaultReasoningEffort(selectedModelId: string): ReasoningEffort | undefined {
  if (selectedModelId === DEFAULT_MODEL_ID) {
    return DEFAULT_REASONING_EFFORT;
  }

  return undefined;
}
