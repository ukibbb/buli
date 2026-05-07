import type {
  AssistantResponseEvent,
  AvailableAssistantModel,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionSummary,
  ReasoningEffort,
} from "@buli/contracts";
import type { ActiveConversationTurn, AssistantConversationRunner, ConversationTurnRequest, PromptContextCandidate } from "@buli/engine";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort;
  selectedReasoningEffort?: ReasoningEffort;
  initialConversationSessionId?: string;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[];
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  loadConversationSessions?: () => Promise<readonly ConversationSessionSummary[]> | readonly ConversationSessionSummary[];
  switchConversationSession?: (conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult;
  exportCurrentConversationSession?: () => Promise<ConversationSessionExportResult> | ConversationSessionExportResult;
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: () => ConversationSessionSwitchResult | void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type ConversationSessionSwitchResult = {
  conversationSessionId: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ConversationSessionExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

export type TuiChatScreenInstance = {
  waitUntilExit(): Promise<void>;
};

export declare function renderChatScreenInTerminal(input: {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ChatScreenProps["selectedModelDefaultReasoningEffort"];
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  initialConversationSessionId?: ChatScreenProps["initialConversationSessionId"];
  initialConversationSessionEntries?: ChatScreenProps["initialConversationSessionEntries"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  loadConversationSessions?: ChatScreenProps["loadConversationSessions"];
  switchConversationSession?: ChatScreenProps["switchConversationSession"];
  exportCurrentConversationSession?: ChatScreenProps["exportCurrentConversationSession"];
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: ChatScreenProps["onConversationCleared"];
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
