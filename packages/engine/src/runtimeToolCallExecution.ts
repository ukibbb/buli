import {
  isExploreToolCallRequest,
  isFileMutationToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type AssistantToolRequestName,
  type BuliDiagnosticLogger,
  type ReasoningEffort,
  type ToolCallRequest,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import type { ProjectInstructionTracker } from "./projectInstructions.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { streamAssistantResponseEventsForBashToolCall } from "./runtimeBashToolCallExecution.ts";
import { streamAssistantResponseEventsForExploreToolCall } from "./runtimeExplorerToolCallExecution.ts";
import { streamAssistantResponseEventsForFileMutationToolCall } from "./runtimeFileMutationToolCallExecution.ts";
import { streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall } from "./runtimeReadOnlyToolCallExecution.ts";
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

type RequestedToolName = AssistantToolRequestName;

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
  projectInstructionTracker: ProjectInstructionTracker;
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

type RuntimeRequestedToolCallExecutorInput = StreamAssistantResponseEventsForRequestedToolCallInput & {
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
};

type RuntimeRequestedToolCallExecutor = (
  input: RuntimeRequestedToolCallExecutorInput,
) => AsyncGenerator<AssistantResponseEvent>;

const requestedToolCallExecutorByName = {
  read: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  glob: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  grep: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  explore: streamAssistantResponseEventsForExploreRequestedToolCall,
  edit: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  write: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  bash: streamAssistantResponseEventsForBashRequestedToolCall,
} satisfies { readonly [ToolName in RequestedToolName]: RuntimeRequestedToolCallExecutor };

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

  yield* resolveRequestedToolCallExecutor(input.toolCallRequest)({
    ...input,
    toolResultSessionRecorder,
  });
}

async function* streamAssistantResponseEventsForReadOnlyRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isWorkspaceInspectionToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Read-only tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    toolCallRequest: input.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    abortSignal: input.abortSignal,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}

async function* streamAssistantResponseEventsForExploreRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isExploreToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Explorer tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForExploreToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnProvider: input.conversationTurnProvider,
    toolCallId: input.toolCallId,
    exploreToolCallRequest: input.toolCallRequest,
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    abortSignal: input.abortSignal,
    canSpawnExplorer: input.canSpawnExplorer,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}

async function* streamAssistantResponseEventsForFileMutationRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isFileMutationToolCallRequest(input.toolCallRequest)) {
    throw new Error(`File mutation tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForFileMutationToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    fileMutationToolCallRequest: input.toolCallRequest,
    assistantOperatingMode: input.assistantOperatingMode,
    workspaceRootPath: input.workspaceRootPath,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    abortSignal: input.abortSignal,
    createPendingToolApproval: input.createPendingToolApproval,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}

async function* streamAssistantResponseEventsForBashRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (input.toolCallRequest.toolName !== "bash") {
    throw new Error(`Bash tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
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
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    abortSignal: input.abortSignal,
    createPendingToolApproval: input.createPendingToolApproval,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}

function resolveRequestedToolCallExecutor(toolCallRequest: ToolCallRequest): RuntimeRequestedToolCallExecutor {
  return requestedToolCallExecutorByName[toolCallRequest.toolName];
}
