import type {
  AssistantResponseEvent,
  AvailableAssistantModel,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
  ReasoningEffort,
  UserPromptImageAttachment,
} from "@buli/contracts";
import type {
  ActiveConversationTurn,
  AssistantConversationRunner,
  ConversationAutoCompactionRequest,
  ConversationAutoCompactionResult,
  ConversationCompactionRequest,
  ConversationTurnRequest,
  PromptContextCandidate,
} from "@buli/engine";
import type { ReactNode } from "react";

export type ChatScreenProps = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ReasoningEffort;
  selectedReasoningEffort?: ReasoningEffort;
  initialConversationSessionId?: string;
  initialConversationSessionEntries?: readonly ConversationSessionEntry[];
  loadInitialConversationSessionEntries?:
    | ((conversationSessionId: string) => Promise<InitialConversationSessionEntriesLoadResult> | InitialConversationSessionEntriesLoadResult)
    | undefined;
  onInitialConversationSessionEntriesHydrated?:
    | ((initialConversationSessionEntriesLoadResult: InitialConversationSessionEntriesLoadResult) => void | Promise<void>)
    | undefined;
  loadAvailableAssistantModels: () => Promise<AvailableAssistantModel[]>;
  loadPromptContextCandidates: (promptContextQueryText: string) => Promise<readonly PromptContextCandidate[]>;
  loadConversationSessions?: () => Promise<readonly ConversationSessionSummary[]> | readonly ConversationSessionSummary[];
  switchConversationSession?: (conversationSessionId: string) => Promise<ConversationSessionSwitchResult> | ConversationSessionSwitchResult;
  deleteConversationSession?: (conversationSessionId: string) => Promise<ConversationSessionDeleteResult> | ConversationSessionDeleteResult;
  exportCurrentConversationSession?: () => Promise<ConversationSessionExportResult> | ConversationSessionExportResult;
  compactCurrentConversationSession?: (
    input: ConversationCompactionRequest,
  ) => Promise<ConversationSessionCompactionResult> | ConversationSessionCompactionResult;
  autoCompactCurrentConversationSession?: (
    input: ConversationAutoCompactionRequest,
  ) => Promise<ConversationAutoCompactionResult> | ConversationAutoCompactionResult;
  readClipboardImageAttachment?: () => Promise<UserPromptImageAttachment | undefined>;
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: () => ConversationSessionSwitchResult | void;
  onConversationSessionModelSelectionChanged?:
    | ((modelSelection: ConversationSessionModelSelection) => void | Promise<void>)
    | undefined;
  activeConversationTurnShutdownCoordinator?: ActiveConversationTurnShutdownCoordinator;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type ConversationSessionSwitchResult = {
  conversationSessionId: string;
  modelSelection?: ConversationSessionModelSelection | undefined;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ConversationSessionDeleteResult = {
  deletedConversationSessionId: string;
  activeConversationSessionId: string;
  activeConversationSessionModelSelection?: ConversationSessionModelSelection | undefined;
  activeConversationSessionEntries: readonly ConversationSessionEntry[];
  conversationSessions: readonly ConversationSessionSummary[];
};

export type ConversationSessionExportResult = {
  exportFilePath: string;
  exportFileUrl: string;
};

export type ConversationSessionCompactionResult = {
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type InitialConversationSessionEntriesLoadResult = {
  conversationSessionId: string;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type TuiChatScreenInstance = {
  destroy(): void;
  waitUntilExit(): Promise<void>;
};

export declare class ActiveConversationTurnShutdownCoordinator {
  registerActiveConversationTurn(activeConversationTurn: ActiveConversationTurn): void;
  registerActiveConversationTurnSettlement(activeConversationTurnSettlementPromise: Promise<void>): void;
  clearActiveConversationTurn(activeConversationTurn: ActiveConversationTurn): void;
  interruptActiveConversationTurn(): boolean;
  interruptActiveConversationTurnAndWaitForSettlement(): Promise<void>;
}

export type RenderChatScreenInTerminalInput = {
  selectedModelId: string;
  selectedModelDefaultReasoningEffort?: ChatScreenProps["selectedModelDefaultReasoningEffort"];
  selectedReasoningEffort?: ChatScreenProps["selectedReasoningEffort"];
  initialConversationSessionId?: ChatScreenProps["initialConversationSessionId"];
  initialConversationSessionEntries?: ChatScreenProps["initialConversationSessionEntries"];
  loadInitialConversationSessionEntries?: ChatScreenProps["loadInitialConversationSessionEntries"];
  onInitialConversationSessionEntriesHydrated?: ChatScreenProps["onInitialConversationSessionEntriesHydrated"];
  loadAvailableAssistantModels: ChatScreenProps["loadAvailableAssistantModels"];
  loadPromptContextCandidates: ChatScreenProps["loadPromptContextCandidates"];
  loadConversationSessions?: ChatScreenProps["loadConversationSessions"];
  switchConversationSession?: ChatScreenProps["switchConversationSession"];
  deleteConversationSession?: ChatScreenProps["deleteConversationSession"];
  exportCurrentConversationSession?: ChatScreenProps["exportCurrentConversationSession"];
  compactCurrentConversationSession?: ChatScreenProps["compactCurrentConversationSession"];
  autoCompactCurrentConversationSession?: ChatScreenProps["autoCompactCurrentConversationSession"];
  readClipboardImageAttachment?: ChatScreenProps["readClipboardImageAttachment"];
  assistantConversationRunner: AssistantConversationRunner;
  onConversationCleared?: ChatScreenProps["onConversationCleared"];
  onConversationSessionModelSelectionChanged?: ChatScreenProps["onConversationSessionModelSelectionChanged"];
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type TerminalRendererCreateOptionsForChatScreen = {
  screenMode: "alternate-screen";
  clearOnShutdown: boolean;
  autoFocus: boolean;
  useMouse: boolean;
  enableMouseMovement: boolean;
  consoleMode: "console-overlay" | "disabled";
};

export type TerminalRendererForChatScreenRuntime = {
  readonly isDestroyed: boolean;
  destroy(): void;
  once(eventName: "destroy", listener: () => void): void;
};

export type ReactRootForChatScreenRuntime = {
  render(node: ReactNode): void;
  unmount(): void;
};

export type RenderChatScreenInTerminalRuntime<
  TerminalRenderer extends TerminalRendererForChatScreenRuntime,
> = {
  createTerminalRenderer: (options: TerminalRendererCreateOptionsForChatScreen) => Promise<TerminalRenderer>;
  createChatScreenRoot: (terminalRenderer: TerminalRenderer) => ReactRootForChatScreenRuntime;
  createChatScreenElement: (chatScreenProps: ChatScreenProps) => ReactNode;
};

export declare function ChatScreen(props: ChatScreenProps): ReactNode;

export declare function renderChatScreenInTerminal(input: RenderChatScreenInTerminalInput): Promise<TuiChatScreenInstance>;

export declare function renderChatScreenInTerminalWithRuntime<
  TerminalRenderer extends TerminalRendererForChatScreenRuntime,
>(
  input: RenderChatScreenInTerminalInput,
  runtime: RenderChatScreenInTerminalRuntime<TerminalRenderer>,
): Promise<TuiChatScreenInstance>;

export declare function relayAssistantResponseRunnerEvents(input: {
  assistantConversationRunner: AssistantConversationRunner;
  conversationTurnRequest: ConversationTurnRequest;
  onConversationTurnStarted: (activeConversationTurn: ActiveConversationTurn) => void;
  onConversationTurnFinished: () => void;
  onAssistantResponseEvents: (assistantResponseEvents: readonly AssistantResponseEvent[]) => void;
}): Promise<void>;
