import {
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ReasoningEffort,
  type ToolCallRequest,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { streamAssistantResponseEventsForBashToolCall } from "./runtimeBashToolCallExecution.ts";
import {
  isExploreToolCallRequest,
  streamAssistantResponseEventsForExploreToolCall,
} from "./runtimeExplorerToolCallExecution.ts";
import {
  isFileMutationToolCallRequest,
  streamAssistantResponseEventsForFileMutationToolCall,
} from "./runtimeFileMutationToolCallExecution.ts";
import {
  isAutoApprovedReadOnlyToolCallRequest,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
} from "./runtimeReadOnlyToolCallExecution.ts";
import type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
  RuntimeToolApprovalDecision,
} from "./runtimeToolApproval.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import type { BashToolApprovalMode } from "./tools/bashToolApprovalPolicy.ts";
import type { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";

export type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
  RuntimeToolApprovalDecision,
} from "./runtimeToolApproval.ts";

export type StreamAssistantResponseEventsForRequestedToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnProvider: ConversationTurnProvider;
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  assistantOperatingMode: AssistantOperatingMode;
  bashToolApprovalMode: BashToolApprovalMode;
  workspaceRootPath: string;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  conversationHistory: InMemoryConversationHistory;
  abortSignal: AbortSignal;
  canSpawnExplorer: boolean;
  createPendingToolApproval: (input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForRequestedToolCall(
  input: StreamAssistantResponseEventsForRequestedToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationHistory: input.conversationHistory,
    diagnosticLogger: input.diagnosticLogger,
  });

  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.requested", {
    toolCallId: input.toolCallId,
    toolName: input.toolCallRequest.toolName,
    ...(input.toolCallRequest.toolName === "bash"
      ? {
          shellCommandLength: input.toolCallRequest.shellCommand.length,
          commandDescriptionLength: input.toolCallRequest.commandDescription.length,
          hasRequestedWorkingDirectoryPath: input.toolCallRequest.workingDirectoryPath !== undefined,
          hasRequestedTimeoutMilliseconds: input.toolCallRequest.timeoutMilliseconds !== undefined,
        }
      : {}),
  });
  input.conversationHistory.appendConversationSessionEntry({
    entryKind: "tool_call",
    toolCallId: input.toolCallId,
    toolCallRequest: input.toolCallRequest,
  });
  logEngineDiagnosticEvent(input.diagnosticLogger, "conversation_history.entry_appended", {
    entryKind: "tool_call",
    toolCallId: input.toolCallId,
    toolName: input.toolCallRequest.toolName,
    conversationSessionEntryCount: input.conversationHistory.listConversationSessionEntries().length,
    modelContextItemCount: input.conversationHistory.listModelContextItems().length,
  });

  if (isAutoApprovedReadOnlyToolCallRequest(input.toolCallRequest)) {
    yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall({
      assistantResponseMessageId: input.assistantResponseMessageId,
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolCallRequest: input.toolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      toolResultSessionRecorder,
      abortSignal: input.abortSignal,
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  if (isExploreToolCallRequest(input.toolCallRequest)) {
    yield* streamAssistantResponseEventsForExploreToolCall({
      assistantResponseMessageId: input.assistantResponseMessageId,
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnProvider: input.conversationTurnProvider,
      toolCallId: input.toolCallId,
      exploreToolCallRequest: input.toolCallRequest,
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      workspaceRootPath: input.workspaceRootPath,
      toolResultSessionRecorder,
      abortSignal: input.abortSignal,
      canSpawnExplorer: input.canSpawnExplorer,
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  if (isFileMutationToolCallRequest(input.toolCallRequest)) {
    yield* streamAssistantResponseEventsForFileMutationToolCall({
      assistantResponseMessageId: input.assistantResponseMessageId,
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      fileMutationToolCallRequest: input.toolCallRequest,
      assistantOperatingMode: input.assistantOperatingMode,
      workspaceRootPath: input.workspaceRootPath,
      toolResultSessionRecorder,
      abortSignal: input.abortSignal,
      createPendingToolApproval: input.createPendingToolApproval,
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  yield* streamAssistantResponseEventsForBashToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    bashToolCallRequest: input.toolCallRequest,
    assistantOperatingMode: input.assistantOperatingMode,
    bashToolApprovalMode: input.bashToolApprovalMode,
    workspaceRootPath: input.workspaceRootPath,
    workspaceShellCommandExecutor: input.workspaceShellCommandExecutor,
    toolResultSessionRecorder,
    abortSignal: input.abortSignal,
    createPendingToolApproval: input.createPendingToolApproval,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}
