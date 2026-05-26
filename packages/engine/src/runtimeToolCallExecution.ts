import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isFileMutationToolCallRequest,
  isSkillToolCallRequest,
  isTaskToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type AssistantToolRequestName,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
  type ProviderAvailableToolName,
  type ProviderRequestedToolCall,
  type ReasoningEffort,
  type ToolCallRequest,
} from "@buli/contracts";
import { resolveAssistantOperatingModeToolAccess } from "./assistantOperatingModePolicy.ts";
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
import { streamAssistantResponseEventsForSkillToolCall } from "./runtimeSkillToolCallExecution.ts";
import { streamAssistantResponseEventsForTaskToolCall } from "./runtimeTaskToolCallExecution.ts";
import { streamAssistantResponseEventsForFileMutationToolCall } from "./runtimeFileMutationToolCallExecution.ts";
import {
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "./runtimeReadOnlyToolCallExecution.ts";
import type { RuntimeReadOnlyToolCallConcurrencyLimiter } from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import type { RuntimeSubagentConversationConcurrencyLimiter } from "./runtimeSubagentConversationConcurrencyLimiter.ts";
import type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
} from "./runtimeToolApproval.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import type { BashToolApprovalMode } from "./tools/bashToolApprovalPolicy.ts";
import type { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";
import type { WorkspaceSkillCatalog } from "./skills/skillCatalog.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export type {
  RuntimePendingToolApproval,
  RuntimePendingToolApprovalInput,
  RuntimeToolApprovalDecision,
} from "./runtimeToolApproval.ts";

type RequestedToolName = AssistantToolRequestName;

export type RuntimeToolCallExecutionContext = {
  conversationTurnId: string;
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnProvider: ConversationTurnProvider;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  assistantOperatingMode: AssistantOperatingMode;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  bashToolApprovalMode: BashToolApprovalMode;
  workspaceRootPath: string;
  workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
  projectInstructionTracker: ProjectInstructionTracker;
  skillCatalog: WorkspaceSkillCatalog;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  conversationHistory: InMemoryConversationHistory;
  abortSignal: AbortSignal;
  canSpawnSubagent: boolean;
  subagentConversationConcurrencyLimiter: RuntimeSubagentConversationConcurrencyLimiter;
  taskSubagentSoftElapsedTimeCheckpointMilliseconds?: number | undefined;
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
  read_many: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  search_many: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  glob: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  grep: streamAssistantResponseEventsForReadOnlyRequestedToolCall,
  task: streamAssistantResponseEventsForTaskRequestedToolCall,
  skill: streamAssistantResponseEventsForSkillRequestedToolCall,
  edit: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  edit_many: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  patch: streamAssistantResponseEventsForFileMutationRequestedToolCall,
  patch_many: streamAssistantResponseEventsForFileMutationRequestedToolCall,
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
    conversationTurnId: input.conversationTurnId,
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
    yield* streamAssistantResponseEventsForPolicyCheckedRequestedToolCall({
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
    conversationTurnId: input.conversationTurnId,
    entryKind: "tool_call",
    toolCallId: requestedToolCall.toolCallId,
    toolName: requestedToolCall.toolCallRequest.toolName,
    conversationSessionEntryCount: input.conversationHistory.countConversationSessionEntries(),
  });
}

function logRequestedToolCall(
  input: StreamAssistantResponseEventsForRequestedToolCallsInput,
  requestedToolCall: ProviderRequestedToolCall,
): void {
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.requested", {
    conversationTurnId: input.conversationTurnId,
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
    ...(requestedToolCall.toolCallRequest.toolName === "task"
      ? {
          subagentName: requestedToolCall.toolCallRequest.subagentName,
          subagentDescriptionLength: requestedToolCall.toolCallRequest.subagentDescription.length,
          subagentPromptLength: requestedToolCall.toolCallRequest.subagentPrompt.length,
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
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.concurrent_group_started", {
    conversationTurnId: input.conversationTurnId,
    ...concurrentGroupDiagnosticFields,
  });

  let concurrentGroupOutcomeKind: "completed" | "failed" = "completed";
  try {
    if (areAllRequestedToolCallsAllowedForRuntimeContext(input) && areAllAutoApprovedReadOnlyToolCalls(input.requestedToolCalls)) {
      yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
        assistantResponseMessageId: input.assistantResponseMessageId,
        providerConversationTurn: input.providerConversationTurn,
        conversationTurnId: input.conversationTurnId,
        requestedToolCalls: input.requestedToolCalls,
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionTracker: input.projectInstructionTracker,
        toolResultSessionRecorder: input.toolResultSessionRecorder,
        readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
        abortSignal: input.abortSignal,
        throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
        diagnosticLogger: input.diagnosticLogger,
      });
      return;
    }

    yield* mergeAssistantResponseEventStreams({
      assistantResponseEventStreams: input.requestedToolCalls.map((requestedToolCall) =>
        streamAssistantResponseEventsForPolicyCheckedRequestedToolCall({
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
      conversationTurnId: input.conversationTurnId,
      ...concurrentGroupDiagnosticFields,
      outcomeKind: concurrentGroupOutcomeKind,
      durationMs: Date.now() - concurrentGroupStartedAtMs,
    });
  }
}

function areAllRequestedToolCallsAllowedForRuntimeContext(input: {
  assistantOperatingMode: AssistantOperatingMode;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  requestedToolCalls: readonly ProviderRequestedToolCall[];
}): boolean {
  return input.requestedToolCalls.every((requestedToolCall) =>
    resolveAssistantOperatingModeToolAccess({
      assistantOperatingMode: input.assistantOperatingMode,
      requestedAvailableToolNames: input.availableToolNames,
      requestedToolName: requestedToolCall.toolCallRequest.toolName,
    }).accessKind === "allowed"
  );
}

async function* streamAssistantResponseEventsForPolicyCheckedRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolCallExecutionStartedAtMs = Date.now();
  let toolCallExecutionOutcomeKind: "completed" | "failed" = "completed";
  const toolAccessDecision = resolveAssistantOperatingModeToolAccess({
    assistantOperatingMode: input.assistantOperatingMode,
    requestedAvailableToolNames: input.availableToolNames,
    requestedToolName: input.toolCallRequest.toolName,
  });

  try {
    if (toolAccessDecision.accessKind === "denied") {
      yield* streamAssistantResponseEventsForDeniedByPolicyRequestedToolCall({
        ...input,
        denialText: toolAccessDecision.denialText,
        effectiveAvailableToolNames: toolAccessDecision.effectiveAvailableToolNames,
      });
      return;
    }

    yield* resolveRequestedToolCallExecutor(input.toolCallRequest)(input);
  } catch (error) {
    toolCallExecutionOutcomeKind = "failed";
    throw error;
  } finally {
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.execution_finished", {
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
      ...(input.toolCallRequest.toolName === "task" ? { subagentName: input.toolCallRequest.subagentName } : {}),
      outcomeKind: toolCallExecutionOutcomeKind,
      durationMs: Date.now() - toolCallExecutionStartedAtMs,
    });
  }
}

async function* streamAssistantResponseEventsForDeniedByPolicyRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput & {
    denialText: string;
    effectiveAvailableToolNames: readonly ProviderAvailableToolName[];
  },
): AsyncGenerator<AssistantResponseEvent> {
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.toolCallRequest);
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();

  input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: startedToolCallDetail,
    toolResultText: input.denialText,
    denialExplanation: input.denialText,
  });
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.mode_policy_blocked", {
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolName: input.toolCallRequest.toolName,
    assistantOperatingMode: input.assistantOperatingMode,
    effectiveAvailableToolNames: [...input.effectiveAvailableToolNames],
  });
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "denied",
      toolCallStartedAtMs,
      toolCallDetail: startedToolCallDetail,
      denialText: input.denialText,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolResultText: input.denialText,
    toolResultKind: "denied",
    diagnosticLogger: input.diagnosticLogger,
  });
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
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolCallRequest: input.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
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
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    taskToolCallRequest: input.toolCallRequest,
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
    subagentConversationConcurrencyLimiter: input.subagentConversationConcurrencyLimiter,
    ...(input.taskSubagentSoftElapsedTimeCheckpointMilliseconds !== undefined
      ? { taskSubagentSoftElapsedTimeCheckpointMilliseconds: input.taskSubagentSoftElapsedTimeCheckpointMilliseconds }
      : {}),
    abortSignal: input.abortSignal,
    canSpawnSubagent: input.canSpawnSubagent,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}

async function* streamAssistantResponseEventsForSkillRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isSkillToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Skill tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForSkillToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    skillToolCallRequest: input.toolCallRequest,
    skillCatalog: input.skillCatalog,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
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
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    fileMutationToolCallRequest: input.toolCallRequest,
    assistantOperatingMode: input.assistantOperatingMode,
    workspaceRootPath: input.workspaceRootPath,
    workspaceSnapshotStore: input.workspaceSnapshotStore,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    abortSignal: input.abortSignal,
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
    conversationTurnId: input.conversationTurnId,
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
