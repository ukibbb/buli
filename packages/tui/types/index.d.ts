import type { AssistantResponseEvent, AvailableAssistantModel, ReasoningEffort } from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest, PromptContextCandidate } from "@buli/engine";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  assistantConversationRunner: AssistantConversationRunner;
};

export type TuiChatScreenInstance = {
  waitUntilExit(): Promise<void>;
};

export declare function renderChatScreenInTerminal(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  assistantConversationRunner: AssistantConversationRunner;
}): Promise<TuiChatScreenInstance>;

export declare function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvents: (assistantResponseEvents: readonly AssistantResponseEvent[]) => void;
}): Promise<void>;
