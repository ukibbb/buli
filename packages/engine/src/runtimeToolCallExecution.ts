import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isAssistantToolRequestName,
  isCustomToolCallRequest,
  isFileMutationToolCallRequest,
  isRecordWorkflowHandoffToolCallRequest,
  isSkillToolCallRequest,
  isTaskToolCallRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantPrimaryAgentName,
  type AssistantResponseEvent,
  type AssistantToolRequestName,
  type BashToolCallRequest,
  type BuliDiagnosticLogFields,
  type BuliDiagnosticLogger,
  type ProviderAvailableToolName,
  type ProviderRequestedToolCall,
  type ReasoningEffort,
  type ToolCallRequest,
  type WorkflowHandoff,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import { resolvePrimaryAssistantAgentToolAccess } from "./primaryAssistantAgentToolPolicy.ts";
import type { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import type { ProjectInstructionTracker } from "./projectInstructions.ts";
import { mergeAssistantResponseEventStreams } from "./runtimeAssistantResponseEventStreamMerge.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import {
  groupRequestedToolCallsForExecution,
  type AutoConcurrentRequestedToolCall,
} from "./runtimeRequestedToolCallExecutionGroups.ts";
import { streamAssistantResponseEventsForBashToolCall } from "./runtimeBashToolCallExecution.ts";
import { streamAssistantResponseEventsForSkillToolCall } from "./runtimeSkillToolCallExecution.ts";
import { streamAssistantResponseEventsForTaskToolCall } from "./runtimeTaskToolCallExecution.ts";
import { streamAssistantResponseEventsForFileMutationToolCall } from "./runtimeFileMutationToolCallExecution.ts";
import { streamAssistantResponseEventsForWorkflowHandoffToolCall } from "./runtimeWorkflowHandoffToolCallExecution.ts";
import { streamAssistantResponseEventsForCustomToolCall } from "./runtimeCustomToolCallExecution.ts";
import {
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "./runtimeReadOnlyToolCallExecution.ts";
import type { RuntimeReadOnlyToolCallConcurrencyLimiter } from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import type { SameTurnReadCoverageTracker } from "./readOnlyToolCallReadCoverage.ts";
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
import type { AssistantProviderModelPromptProfile } from "./assistantProviderModelPromptProfile.ts";
import type { BuiltInToolDescriptionOverlayResolver } from "./assistantModelOverlay.ts";
import type { TaskSubagentCompositionResolver } from "./assistantSubagentComposition.ts";
import type { TaskSubagentProviderModelSelection } from "./taskSubagentProviderModelSelection.ts";
import type { AssistantAgentRegistry, PrimaryAssistantAgentDefinition } from "./assistantAgentRegistry.ts";
import type { AssistantToolRegistry } from "./assistantToolRegistry.ts";

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
  parentSelectedModelId: string;
  parentSelectedReasoningEffort?: ReasoningEffort;
  taskSubagentProviderModelSelection: TaskSubagentProviderModelSelection;
  taskSubagentAssistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
  taskSubagentCompositionResolver: TaskSubagentCompositionResolver;
  builtInToolDescriptionOverlayResolver: BuiltInToolDescriptionOverlayResolver;
  selectedPrimaryAgentName: AssistantPrimaryAgentName;
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  assistantAgentRegistry: AssistantAgentRegistry;
  assistantToolRegistry: AssistantToolRegistry;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  bashToolApprovalMode: BashToolApprovalMode;
  workspaceRootPath: string;
  workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
  projectInstructionTracker: ProjectInstructionTracker;
  skillCatalog: WorkspaceSkillCatalog;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  sameTurnReadCoverageTracker?: SameTurnReadCoverageTracker | undefined;
  promptContextBrowseRootPath: string;
  promptContextStartingDirectoryPath: string;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  conversationHistory: InMemoryConversationHistory;
  abortSignal: AbortSignal;
  canSpawnSubagent: boolean;
  subagentConversationConcurrencyLimiter: RuntimeSubagentConversationConcurrencyLimiter;
  taskSubagentSoftElapsedTimeCheckpointMilliseconds?: number | undefined;
  recordWorkflowHandoff: (workflowHandoff: WorkflowHandoff) => void;
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
  skill: streamAssistantResponseEventsForSkillRequestedToolCall,
  record_workflow_handoff: streamAssistantResponseEventsForWorkflowHandoffRequestedToolCall,
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

  for (const requestedToolCallExecutionGroup of groupRequestedToolCallsForExecution(input.requestedToolCalls, input.assistantToolRegistry)) {
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
  const toolCallRequest = requestedToolCall.toolCallRequest;
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.requested", {
    conversationTurnId: input.conversationTurnId,
    toolCallId: requestedToolCall.toolCallId,
    toolName: toolCallRequest.toolName,
    ...(!isCustomToolCallRequest(toolCallRequest) && toolCallRequest.toolName === "bash"
      ? {
          shellCommandLength: toolCallRequest.shellCommand.length,
          commandDescriptionLength: toolCallRequest.commandDescription.length,
          hasRequestedWorkingDirectoryPath: toolCallRequest.workingDirectoryPath !== undefined,
          hasRequestedTimeoutMilliseconds: toolCallRequest.timeoutMilliseconds !== undefined,
        }
      : {}),
    ...(!isCustomToolCallRequest(toolCallRequest) && toolCallRequest.toolName === "task"
      ? {
          subagentName: toolCallRequest.subagentName,
          subagentDescriptionLength: toolCallRequest.subagentDescription.length,
          subagentPromptLength: toolCallRequest.subagentPrompt.length,
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
    if (
      areAllRequestedToolCallsAllowedForRuntimeContext(input) &&
      areAllBatchableBuiltInReadOnlyToolCalls(input.requestedToolCalls, input.assistantToolRegistry)
    ) {
      yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
        assistantResponseMessageId: input.assistantResponseMessageId,
        providerConversationTurn: input.providerConversationTurn,
        conversationTurnId: input.conversationTurnId,
        requestedToolCalls: input.requestedToolCalls,
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionTracker: input.projectInstructionTracker,
        conversationHistory: input.conversationHistory,
        toolResultSessionRecorder: input.toolResultSessionRecorder,
        readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
        sameTurnReadCoverageTracker: input.sameTurnReadCoverageTracker,
        abortSignal: input.abortSignal,
        throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
        diagnosticLogger: input.diagnosticLogger,
      });
      return;
    }

    const batchableBuiltInReadOnlyToolCalls = listBatchableBuiltInReadOnlyToolCalls({
      requestedToolCalls: input.requestedToolCalls,
      assistantToolRegistry: input.assistantToolRegistry,
    });
    if (areAllRequestedToolCallsAllowedForRuntimeContext(input) && batchableBuiltInReadOnlyToolCalls.length > 0) {
      yield* mergeAssistantResponseEventStreams({
        assistantResponseEventStreams: [
          streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
            assistantResponseMessageId: input.assistantResponseMessageId,
            providerConversationTurn: input.providerConversationTurn,
            conversationTurnId: input.conversationTurnId,
            requestedToolCalls: batchableBuiltInReadOnlyToolCalls,
            workspaceRootPath: input.workspaceRootPath,
            projectInstructionTracker: input.projectInstructionTracker,
            conversationHistory: input.conversationHistory,
            toolResultSessionRecorder: input.toolResultSessionRecorder,
            readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
            sameTurnReadCoverageTracker: input.sameTurnReadCoverageTracker,
            abortSignal: input.abortSignal,
            throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
            diagnosticLogger: input.diagnosticLogger,
          }),
          ...input.requestedToolCalls
            .filter((requestedToolCall) =>
              !isBatchableBuiltInReadOnlyToolCall({
                assistantToolRegistry: input.assistantToolRegistry,
                requestedToolCall,
              })
            )
            .map((requestedToolCall) =>
              streamAssistantResponseEventsForPolicyCheckedRequestedToolCall({
                ...input,
                toolCallId: requestedToolCall.toolCallId,
                toolCallRequest: requestedToolCall.toolCallRequest,
              })
            ),
        ],
        throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
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

function areAllBatchableBuiltInReadOnlyToolCalls(
  requestedToolCalls: readonly AutoConcurrentRequestedToolCall[],
  assistantToolRegistry: AssistantToolRegistry,
): requestedToolCalls is ReadonlyArray<{
  toolCallId: string;
  toolCallRequest: WorkspaceInspectionToolCallRequest;
}> {
  return requestedToolCalls.every((requestedToolCall) =>
    isBatchableBuiltInReadOnlyRequestedToolCall(requestedToolCall, assistantToolRegistry)
  );
}

function listBatchableBuiltInReadOnlyToolCalls(input: {
  requestedToolCalls: readonly AutoConcurrentRequestedToolCall[];
  assistantToolRegistry: AssistantToolRegistry;
}): Array<{
  toolCallId: string;
  toolCallRequest: WorkspaceInspectionToolCallRequest;
}> {
  return input.requestedToolCalls.flatMap((requestedToolCall) => {
    if (!isBatchableBuiltInReadOnlyRequestedToolCall(requestedToolCall, input.assistantToolRegistry)) {
      return [];
    }

    return [{
      toolCallId: requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCall.toolCallRequest,
    }];
  });
}

function isBatchableBuiltInReadOnlyToolCall(input: {
  requestedToolCall: AutoConcurrentRequestedToolCall;
  assistantToolRegistry: AssistantToolRegistry;
}): boolean {
  return isBatchableBuiltInReadOnlyRequestedToolCall(input.requestedToolCall, input.assistantToolRegistry);
}

function isBatchableBuiltInReadOnlyRequestedToolCall(
  requestedToolCall: AutoConcurrentRequestedToolCall,
  assistantToolRegistry: AssistantToolRegistry,
): requestedToolCall is {
  toolCallId: string;
  toolCallRequest: WorkspaceInspectionToolCallRequest;
} {
  return isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest) &&
    assistantToolRegistry.isAutoApprovedReadOnlyToolCallRequest(requestedToolCall.toolCallRequest);
}

function areAllRequestedToolCallsAllowedForRuntimeContext(input: {
  primaryAssistantAgent: PrimaryAssistantAgentDefinition;
  availableToolNames?: readonly ProviderAvailableToolName[] | undefined;
  requestedToolCalls: readonly ProviderRequestedToolCall[];
}): boolean {
  return input.requestedToolCalls.every((requestedToolCall) =>
    resolvePrimaryAssistantAgentToolAccess({
      primaryAssistantAgent: input.primaryAssistantAgent,
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
  const toolAccessDecision = resolvePrimaryAssistantAgentToolAccess({
    primaryAssistantAgent: input.primaryAssistantAgent,
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

    clearSameTurnReadCoverageBeforeWorkspaceChangingToolCall(input);
    yield* resolveRequestedToolCallExecutor(input.toolCallRequest)(input);
  } catch (error) {
    toolCallExecutionOutcomeKind = "failed";
    throw error;
  } finally {
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.execution_finished", {
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolName: input.toolCallRequest.toolName,
      ...(isTaskToolCallRequest(input.toolCallRequest) ? { subagentName: input.toolCallRequest.subagentName } : {}),
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
    selectedPrimaryAgentName: input.selectedPrimaryAgentName,
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
    conversationHistory: input.conversationHistory,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
    sameTurnReadCoverageTracker: input.sameTurnReadCoverageTracker,
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
    parentSelectedModelId: input.parentSelectedModelId,
    ...(input.parentSelectedReasoningEffort !== undefined
      ? { parentSelectedReasoningEffort: input.parentSelectedReasoningEffort }
      : {}),
    taskSubagentProviderModelSelection: input.taskSubagentProviderModelSelection,
    taskSubagentAssistantProviderModelPromptProfile: input.taskSubagentAssistantProviderModelPromptProfile,
    taskSubagentCompositionResolver: input.taskSubagentCompositionResolver,
    builtInToolDescriptionOverlayResolver: input.builtInToolDescriptionOverlayResolver,
    parentPrimaryAssistantAgent: input.primaryAssistantAgent,
    assistantAgentRegistry: input.assistantAgentRegistry,
    assistantToolRegistry: input.assistantToolRegistry,
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

async function* streamAssistantResponseEventsForWorkflowHandoffRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isRecordWorkflowHandoffToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Workflow handoff tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForWorkflowHandoffToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    recordWorkflowHandoffToolCallRequest: input.toolCallRequest,
    selectedPrimaryAgentName: input.selectedPrimaryAgentName,
    primaryAssistantAgent: input.primaryAssistantAgent,
    recordWorkflowHandoff: input.recordWorkflowHandoff,
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
    selectedPrimaryAgentName: input.selectedPrimaryAgentName,
    primaryAssistantAgent: input.primaryAssistantAgent,
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
  if (!isBashToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Bash tool executor received unsupported tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForBashToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    bashToolCallRequest: input.toolCallRequest,
    selectedPrimaryAgentName: input.selectedPrimaryAgentName,
    primaryAssistantAgent: input.primaryAssistantAgent,
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
  if (isCustomToolCallRequest(toolCallRequest)) {
    return streamAssistantResponseEventsForCustomRequestedToolCall;
  }

  if (isAssistantToolRequestName(toolCallRequest.toolName)) {
    return requestedToolCallExecutorByName[toolCallRequest.toolName];
  }

  throw new Error(`Unhandled tool call request: ${JSON.stringify(toolCallRequest)}`);
}

function isBashToolCallRequest(toolCallRequest: ToolCallRequest): toolCallRequest is BashToolCallRequest {
  return toolCallRequest.toolName === "bash";
}

async function* streamAssistantResponseEventsForCustomRequestedToolCall(
  input: RuntimeRequestedToolCallExecutorInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (!isCustomToolCallRequest(input.toolCallRequest)) {
    throw new Error(`Custom tool executor received built-in tool: ${input.toolCallRequest.toolName}`);
  }

  yield* streamAssistantResponseEventsForCustomToolCall({
    assistantResponseMessageId: input.assistantResponseMessageId,
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    customToolCallRequest: input.toolCallRequest,
    assistantToolRegistry: input.assistantToolRegistry,
    workspaceRootPath: input.workspaceRootPath,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
    abortSignal: input.abortSignal,
    createPendingToolApproval: input.createPendingToolApproval,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  });
}


function clearSameTurnReadCoverageBeforeWorkspaceChangingToolCall(input: RuntimeRequestedToolCallExecutorInput): void {
  if (!input.sameTurnReadCoverageTracker) {
    return;
  }

  if (!input.assistantToolRegistry.shouldClearSameTurnReadCoverageBeforeExecution(input.toolCallRequest)) {
    return;
  }

  input.sameTurnReadCoverageTracker.clear();
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.read_coverage_cleared_before_workspace_change", {
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolName: input.toolCallRequest.toolName,
  });
}
