import type { AssistantResponseEvent, AvailableAssistantModel, ReasoningEffort } from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest } from "@buli/engine";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  assistantConversationRunner: AssistantConversationRunner;
};

export type OpentuiChatScreenInstance = {
  waitUntilExit(): Promise<void>;
};

export declare function renderChatScreenInTerminalWithOpentui(input: {
  selectedModelId: string;
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  assistantConversationRunner: AssistantConversationRunner;
}): Promise<OpentuiChatScreenInstance>;

export declare function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvent: (assistantResponseEvent: AssistantResponseEvent) => void;
}): Promise<void>;
