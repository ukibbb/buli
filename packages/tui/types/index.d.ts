import type { AssistantResponseEvent, AvailableAssistantModel, BuliDiagnosticLogger, ReasoningEffort } from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest, PromptContextCandidate } from "@buli/engine";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  assistantConversationRunner: AssistantConversationRunner;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type TuiChatScreenInstance = {
  waitUntilExit(): Promise<void>;
};

export declare function renderChatScreenInTerminal(input: {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ChatScreenProps["selectedModelDefaultReasoningEffort"];
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  assistantConversationRunner: AssistantConversationRunner;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<TuiChatScreenInstance>;

export declare function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvents: (assistantResponseEvents: readonly AssistantResponseEvent[]) => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<void>;
