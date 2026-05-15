import type {
  AssistantOperatingMode,
  AssistantResponseEvent,
  ConversationSessionEntry,
  ProviderAvailableToolName,
  ProviderStreamEvent,
  ProviderTurnReplay,
  ReasoningEffort,
  UserPromptImageAttachment,
} from "@buli/contracts";

export type ConversationTurnRequest = {
  userPromptText: string;
  userPromptImageAttachments?: readonly UserPromptImageAttachment[];
  assistantOperatingMode?: AssistantOperatingMode;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

export type ConversationCompactionRequest = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  abortSignal?: AbortSignal;
};

export type ConversationCompactionResult = {
  summaryText: string;
  compactedEntryCount: number;
};

export interface ConversationCompactionRunner {
  compactConversationSession(input: ConversationCompactionRequest): Promise<ConversationCompactionResult>;
}

export type ProviderConversationTurnRequest = {
  systemPromptText: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  promptCacheKey?: string;
  availableToolNames?: readonly ProviderAvailableToolName[];
  abortSignal?: AbortSignal;
};

export type ProviderToolResultSubmission = {
  toolCallId: string;
  toolResultText: string;
};

export interface ProviderConversationTurn {
  streamProviderEvents(): AsyncIterable<ProviderStreamEvent>;
  submitToolResult(input: ProviderToolResultSubmission): Promise<void>;
  getProviderTurnReplay(): ProviderTurnReplay | undefined;
}

export interface ConversationTurnProvider {
  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn;
}

export interface ActiveConversationTurn {
  streamAssistantResponseEvents(): AsyncIterable<AssistantResponseEvent>;
  approvePendingToolCall(approvalId: string): Promise<void>;
  denyPendingToolCall(approvalId: string): Promise<void>;
  interrupt(): void;
}

export interface AssistantConversationRunner {
  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn;
}
