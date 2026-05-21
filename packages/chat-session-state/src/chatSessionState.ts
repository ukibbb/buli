import type {
  AssistantOperatingMode,
  AvailableAssistantModel,
  ConversationMessage,
  ConversationMessagePart,
  ConversationSessionSummary,
  ConversationTurnStatus,
  PendingToolApprovalRequest,
  ReasoningEffort,
  TokenUsage,
  UserPromptImageAttachment,
} from "@buli/contracts";
import { DEFAULT_ASSISTANT_OPERATING_MODE } from "@buli/contracts";
import type { PromptContextCandidate } from "@buli/prompt-context-core";

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

export type SlashCommand = {
  name: string;
  value: string;
  description: string;
};

export type SlashCommandSelectionState =
  | {
      step: "hidden";
    }
  | {
      step: "showing_slash_commands";
      slashCommandQueryText: string;
      availableSlashCommands: readonly SlashCommand[];
      highlightedSlashCommandIndex: number;
    };

export type ConversationSessionSelectionState =
  | {
      step: "hidden";
    }
  | {
      step: "loading_conversation_sessions";
    }
  | {
      step: "showing_session_loading_error";
      errorMessage: string;
    }
  | {
      step: "showing_conversation_sessions";
      conversationSessions: readonly ConversationSessionSummary[];
      highlightedConversationSessionIndex: number;
      activeConversationSessionId: string | undefined;
      pendingDeletionConversationSessionId: string | undefined;
    };

export type ChatSessionState = {
  selectedAssistantOperatingMode: AssistantOperatingMode;
  selectedModelId: string;
  selectedModelDefaultReasoningEffort: ReasoningEffort | undefined;
  selectedReasoningEffort: ReasoningEffort | undefined;
  conversationTurnStatus: ConversationTurnStatus;
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments: PendingPromptImageAttachment[];
  latestTokenUsage: TokenUsage | undefined;
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: string[];
  pendingToolApprovalRequest: PendingToolApprovalRequest | undefined;
  isReasoningSummaryVisible: boolean;
  promptContextSelectionState: PromptContextSelectionState;
  slashCommandSelectionState: SlashCommandSelectionState;
  conversationSessionSelectionState: ConversationSessionSelectionState;
  selectedPromptContextReferenceTexts: string[];
  modelAndReasoningSelectionState: ModelAndReasoningSelectionState;
  isCommandHelpModalVisible: boolean;
};

export type PendingPromptImageAttachment = {
  attachment: UserPromptImageAttachment;
  promptDraftPlaceholderText: string;
};

export function createInitialChatSessionState(input: {
  selectedAssistantOperatingMode?: AssistantOperatingMode;
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort;
  selectedReasoningEffort?: ReasoningEffort;
}): ChatSessionState {
  return {
    selectedAssistantOperatingMode: input.selectedAssistantOperatingMode ?? DEFAULT_ASSISTANT_OPERATING_MODE,
    selectedModelId: input.selectedModelId,
    selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort,
    selectedReasoningEffort: input.selectedReasoningEffort,
    conversationTurnStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    pendingPromptImageAttachments: [],
    latestTokenUsage: undefined,
    conversationMessagesById: {},
    conversationMessagePartsById: {},
    orderedConversationMessageIds: [],
    pendingToolApprovalRequest: undefined,
    isReasoningSummaryVisible: true,
    promptContextSelectionState: { step: "hidden" },
    slashCommandSelectionState: { step: "hidden" },
    conversationSessionSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
    modelAndReasoningSelectionState: { step: "hidden" },
    isCommandHelpModalVisible: false,
  };
}
