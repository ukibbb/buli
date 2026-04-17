import type { AssistantResponseEvent, ModelContextItem, ProviderStreamEvent, ReasoningEffort } from "@buli/contracts";

export type ConversationTurnRequest = {
  userPromptText: string;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

export type ProviderConversationTurnRequest = {
  systemPromptText: string;
  modelContextItems: readonly ModelContextItem[];
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
};

export type ProviderToolResultSubmission = {
  toolCallId: string;
  toolResultText: string;
};

export interface ProviderConversationTurn {
  streamProviderEvents(): AsyncIterable<ProviderStreamEvent>;
  submitToolResult(input: ProviderToolResultSubmission): Promise<void>;
}

export interface ConversationTurnProvider {
  startConversationTurn(input: ProviderConversationTurnRequest): ProviderConversationTurn;
}

export interface ActiveConversationTurn {
  streamAssistantResponseEvents(): AsyncIterable<AssistantResponseEvent>;
  approvePendingToolCall(approvalId: string): Promise<void>;
  denyPendingToolCall(approvalId: string): Promise<void>;
}

export interface AssistantConversationRunner {
  startConversationTurn(input: ConversationTurnRequest): ActiveConversationTurn;
}
