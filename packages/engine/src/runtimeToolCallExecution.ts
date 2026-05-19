import {
  isFileMutationToolCallRequest,
  isTaskToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type AssistantToolRequestName,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
  type ProviderRequestedToolCall,
  type ReasoningEffort,
  type ToolCallRequest,
} from "@buli/contracts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import type { ProjectInstructionTracker } from "./projectInstructions.ts";
import { mergeAssistantResponseEventStreams } from "./runtimeAssistantResponseEventStreamMerge.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import {
  areAllAutoApprovedReadOnlyToolCalls,
  groupRequestedToolCallsForExecution,
  type AutoConcurrentRequestedToolCall,
} from "./runtimeRequestedToolCallExecutionGroups.ts";
import { streamAssistantResponseEventsForBashToolCall } from "./runtimeBashToolCallExecution.ts";
import { streamAssistantResponseEventsForTaskToolCall } from "./runtimeTaskToolCallExecution.ts";
import { streamAssistantResponseEventsForFileMutationToolCall } from "./runtimeFileMutationToolCallExecution.ts";
import {
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "./runtimeReadOnlyToolCallExecution.ts";
import type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
} from "./runtimeToolApproval.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import type { BashToolApprovalMode } from "./tools/bashToolApprovalPolicy.ts";
import type { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
  RuntimeToolApprovalDecision,
} from "./runtimeToolApproval.ts";

type RequestedToolName = AssistantToolRequestName;

export type RuntimeToolCallExecutionContext = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnProvider: ConversationTurnProvider;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  assistantOperatingMode: AssistantOperatingMode;
  bashToolApprovalMode: BashToolApprovalMode;
  workspaceRootPath: string;
  workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
  projectInstructionTracker: ProjectInstructionTracker;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  conversationHistory: InMemoryConversationHistory;
  abortSignal: AbortSignal;
  canSpawnSubagent: boolean;
  createPendingToolApproval: (input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type StreamAssistantResponseEventsForRequestedToolCallsInput = RuntimeToolCallExecutionContext & {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
};

type RuntimeRequestedToolCallExecutorInput = RuntimeToolCallExecutionContext & {
  toolCallId: string;
  toolCallRequest: ToolCallRequest;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
};

type StreamAssistantResponseEventsForAutoConcurrentRequestedToolCallsInput = RuntimeToolCallExecutionContext & {
  requestedToolCalls: readonly AutoConcurrentRequestedToolCall[];
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
};

type RuntimeRequestedToolCallExecutor = (
  input: RuntimeRequestedToolCallExecutorInput,
) => AsyncGenerator<AssistantResponseEvent>;

const requestedToolCallExecutorByName = {
  read: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  glob: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  grep: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  task: streamAssistantResponseEventsForTaskRequestedToolCall,
  edit: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  write: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  bash: streamAssistantResponseEventsForBashRequestedToolCall,
} satisfies { readonly [ToolName in RequestedToolName]: RuntimeRequestedToolCallExecutor };

export async function* streamAssistantResponseEventsForRequestedToolCalls(
  input: StreamAssistantResponseEventsForRequestedToolCallsInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Cannot execute an empty tool-call batch.");
  }

  const toolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationHistory: input.conversationHistory,
    diagnosticLogger: input.diagnosticLogger,
  });

  for (const requestedToolCallExecutionGroup of groupRequestedToolCallsForExecution(input.requestedToolCalls)) {
    if (requestedToolCallExecutionGroup.groupKind === "auto_concurrent") {
      for (const requestedToolCall of requestedToolCallExecutionGroup.requestedToolCalls) {
        appendStartedRequestedToolCallSessionEntry(input, requestedToolCall);
      }
      yield* streamAssistantResponseEventsForAutoConcurrentRequestedToolCalls({
        ...input,
        requestedToolCalls: requestedToolCallExecutionGroup.requestedToolCalls,
        toolResultSessionRecorder,
      });
      continue;
    }

    appendStartedRequestedToolCallSessionEntry(input, requestedToolCallExecutionGroup.requestedToolCall);
    yield* resolveRequestedToolCallExecutor(requestedToolCallExecutionGroup.requestedToolCall.toolCallRequest)({
      ...input,
      toolCallId: requestedToolCallExecutionGroup.requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCallExecutionGroup.requestedToolCall.toolCallRequest,
      toolResultSessionRecorder,
    });
  }
}

function appendStartedRequestedToolCallSessionEntry(
  input: StreamAssistantResponseEventsForRequestedToolCallsInput,
  requestedToolCall: ProviderRequestedToolCall,
): void {
  logRequestedToolCall(input, requestedToolCall);
  input.conversationHistory.appendConversationSessionEntry({
    entryKind: "tool_call",
    toolCallId: requestedToolCall.toolCallId,
    toolCallRequest: requestedToolCall.toolCallRequest,
  });
  logEngineDiagnosticEvent(input.diagnosticLogger, "conversation_history.entry_appended", {
    entryKind: "tool_call",
    toolCallId: requestedToolCall.toolCallId,
    toolName: requestedToolCall.toolCallRequest.toolName,
    conversationSessionEntryCount: input.conversationHistory.listConversationSessionEntries().length,
    modelContextItemCount: input.conversationHistory.listModelContextItems().length,
  });
}

function logRequestedToolCall(
  input: StreamAssistantResponseEventsForRequestedToolCallsInput,
  requestedToolCall: ProviderRequestedToolCall,
): void {
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.requested", {
    toolCallId: requestedToolCall.toolCallId,
    toolName: requestedToolCall.toolCallRequest.toolName,
    ...(requestedToolCall.toolCallRequest.toolName === "bash"
      ? {
          shellCommandLength: requestedToolCall.toolCallRequest.shellCommand.length,
          commandDescriptionLength: requestedToolCall.toolCallRequest.commandDescription.length,
          hasRequestedWorkingDirectoryPath: requestedToolCall.toolCallRequest.workingDirectoryPath !== undefined,
          hasRequestedTimeoutMilliseconds: requestedToolCall.toolCallRequest.timeoutMilliseconds !== undefined,
        }
      : {}),
  });
}

async function* streamAssistantResponseEventsForAutoConcurrentRequestedToolCalls(
  input: StreamAssistantResponseEventsForAutoConcurrentRequestedToolCallsInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Cannot execute an empty auto-concurrent tool-call batch.");
  }

  const concurrentGroupStartedAtMs = Date.now();
  const concurrentGroupDiagnosticFields = buildConcurrentToolCallGroupDiagnosticFields(input.requestedToolCalls);
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.concurrent_group_started", concurrentGroupDiagnosticFields);

  let concurrentGroupOutcomeKind: "completed" | "failed" = "completed";
  try {
    if (areAllAutoApprovedReadOnlyToolCalls(input.requestedToolCalls)) {
      yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
        assistantResponseMessageId: input.assistantResponseMessageId,
        providerConversationTurn: input.providerConversationTurn,
        requestedToolCalls: input.requestedToolCalls,
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionTracker: input.projectInstructionTracker,
        toolResultSessionRecorder: input.toolResultSessionRecorder,
        abortSignal: input.abortSignal,
        throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
        diagnosticLogger: input.diagnosticLogger,
      });
      return;
    }

    yield* mergeAssistantResponseEventStreams({
      assistantResponseEventStreams: input.requestedToolCalls.map((requestedToolCall) =>
        resolveRequestedToolCallExecutor(requestedToolCall.toolCallRequest)({
          ...input,
          toolCallId: requestedToolCall.toolCallId,
          toolCallRequest: requestedToolCall.toolCallRequest,
        })
      ),
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    });
  } catch (error) {
    concurrentGroupOutcomeKind = "failed";
    throw error;
  } finally {
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.concurrent_group_finished", {
      ...concurrentGroupDiagnosticFields,
      outcomeKind: concurrentGroupOutcomeKind,
      durationMs: Date.now() - concurrentGroupStartedAtMs,
    });
  }
}

function buildConcurrentToolCallGroupDiagnosticFields(
  requestedToolCalls: readonly AutoConcurrentRequestedToolCall[],
): BuliDiagnosticLogFields {
  return {
    toolCallCount: requestedToolCalls.length,
    toolCallIds: requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId),
    toolNames: requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallRequest.toolName),
  };
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

async function* streamAssistantResponseEventsForTaskRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isTaskToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Task tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForTaskToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnProvider: input.conversationTurnProvider,
    toolCallId: input.toolCallId,
    taskToolCallRequest: input.toolCallRequest,
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    abortSignal: input.abortSignal,
    canSpawnSubagent: input.canSpawnSubagent,
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
    workspaceSnapshotStore: input.workspaceSnapshotStore,
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
    workspaceSnapshotStore: input.workspaceSnapshotStore,
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
