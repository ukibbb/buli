import type {
  AvailableAssistantModel,
  ConversationMessage,
  ConversationMessagePart,
  ConversationTurnStatus,
  PendingToolApprovalRequest,
  ReasoningEffort,
  TokenUsage,
} from "@buli/contracts";
import type { PromptContextCandidate } from "@buli/engine";

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

export type ChatSessionState = {
  selectedModelId: string;
  selectedReasoningEffort: ReasoningEffort | undefined;
  conversationTurnStatus: ConversationTurnStatus;
  promptDraft: string;
  promptDraftCursorOffset: number;
  latestTokenUsage: TokenUsage | undefined;
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: string[];
  pendingToolApprovalRequest: PendingToolApprovalRequest | undefined;
  promptContextSelectionState: PromptContextSelectionState;
  selectedPromptContextReferenceTexts: string[];
  modelAndReasoningSelectionState: ModelAndReasoningSelectionState;
  isShortcutsHelpModalVisible: boolean;
};

export function createInitialChatSessionState(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
}): ChatSessionState {
  return {
    selectedModelId: input.selectedModelId,
    selectedReasoningEffort: input.selectedReasoningEffort,
    conversationTurnStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    latestTokenUsage: undefined,
    conversationMessagesById: {},
    conversationMessagePartsById: {},
    orderedConversationMessageIds: [],
    pendingToolApprovalRequest: undefined,
    promptContextSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
    modelAndReasoningSelectionState: { step: "hidden" },
    isShortcutsHelpModalVisible: false,
  };
}
