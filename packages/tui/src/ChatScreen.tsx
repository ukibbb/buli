import os from "node:os";
import type {
  AvailableAssistantModel,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
  ReasoningEffort,
  UserPromptImageAttachment,
} from "@buli/contracts";
import {
  type ActiveConversationTurnShutdownCoordinator,
  type ConversationSessionCompactionResult,
  type ConversationSessionDeleteResult,
  type ConversationSessionExportResult,
  type ConversationSessionSwitchResult,
} from "@buli/chat-app-controller";
import {
  type AssistantConversationRunner,
  type ConversationAutoCompactionRequest,
  type ConversationAutoCompactionResult,
  type ConversationCompactionRequest,
} from "@buli/engine";
import type { PromptContextCandidate } from "@buli/prompt-context-core";
import { useTerminalDimensions } from "@opentui/react";
import { classifyTerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import { ChatScreenLayout } from "./components/ChatScreenLayout.tsx";
import { formatChatScreenWorkingDirectoryPath } from "./behavior/chatScreenWorkingDirectoryLabel.ts";
import { useChatScreenController } from "./behavior/useChatScreenController.ts";

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

export type {
  ConversationSessionCompactionResult,
  ConversationSessionDeleteResult,
  ConversationSessionExportResult,
  ConversationSessionSwitchResult,
} from "@buli/chat-app-controller";

export function ChatScreen(props: ChatScreenProps) {
  const { height: rows, width: columns } = useTerminalDimensions();
  const terminalSizeTierForChatScreen = classifyTerminalSizeTierForChatScreen({
    rowCount: rows,
    columnCount: columns,
  });
  const chatScreenLayoutController = useChatScreenController({
    chatScreenProps: props,
    terminalRowCount: rows,
    terminalColumnCount: columns,
    terminalSizeTierForChatScreen,
  });

  const homeDirectoryPath = os.homedir();
  const rawWorkingDirectoryPath = process.cwd();
  const workingDirectoryPath = formatChatScreenWorkingDirectoryPath({
    homeDirectoryPath,
    workingDirectoryPath: rawWorkingDirectoryPath,
  });

  return (
    <ChatScreenLayout
      terminalRowCount={rows}
      terminalColumnCount={columns}
      workingDirectoryPath={workingDirectoryPath}
      mainAreaProps={chatScreenLayoutController.mainAreaProps}
      liveInteractionChromeProps={chatScreenLayoutController.liveInteractionChromeProps}
    />
  );
}
