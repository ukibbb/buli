import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  type CompletedToolResultConversationSessionEntry,
  type ConversationSessionEntry,
  type DeniedToolResultConversationSessionEntry,
  type FailedToolResultConversationSessionEntry,
  isWorkspaceInspectionToolCallRequest,
  MAX_READ_TOOL_LINE_COUNT,
  type AssistantResponseEvent,
  type AssistantToolCallConversationMessagePart,
  type BuliDiagnosticLogger,
  type ProviderRequestedToolCall,
  type ProviderStreamEvent,
  type ReasoningEffort,
  type SubagentChildToolCall,
  type SubagentChildToolCallDetail,
  type SubagentChildToolCallStatus,
  type SubagentResearchCheckpoint,
  type TaskToolCallRequest,
  type ToolCallDetail,
  type ToolCallRequest,
  type ToolCallTaskDetail,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import type { WorkspaceCodebaseKnowledgeIndex } from "./codebaseKnowledge/treeSitterWorkspaceCodebaseKnowledgeIndex.ts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import { escapeModelFacingXmlAttributeValue, escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";
import { toProjectInstructionSnapshots, type ProjectInstructionTracker } from "./projectInstructions.ts";
import type { RuntimeReadOnlyToolCallConcurrencyLimiter } from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import type { RuntimeSubagentConversationConcurrencyLimiter } from "./runtimeSubagentConversationConcurrencyLimiter.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import {
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "./runtimeReadOnlyToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { buildBuliExplorerSystemPrompt } from "./systemPrompt.ts";
import { resolveBuiltInSubagentDefinition } from "./assistantAgentCatalog.ts";
import {
  formatAssistantProviderModelPromptProfileFragmentBlock,
  type AssistantProviderModelPromptProfile,
} from "./assistantProviderModelPromptProfile.ts";

const NESTED_SUBAGENT_DENIAL_TEXT = "Subagents cannot spawn another subagent. Continue with read, glob, grep, and locate_codebase_symbols instead.";
const TASK_SUBAGENT_CHILD_TOOL_CALL_CHECKPOINT_LIMIT = 192;
const TASK_SUBAGENT_CHILD_TOOL_RESULT_TEXT_CHECKPOINT_LIMIT = 1_200_000;
export const DEFAULT_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS = 120_000;
const MAX_FAILED_TASK_CHILD_TOOL_RESULT_TEXT_TOTAL_LENGTH = 20_000;
const MAX_FAILED_TASK_CHILD_TOOL_RESULT_TEXT_LENGTH = 4_000;

type TaskSubagentToolResultConversationSessionEntry =
  | CompletedToolResultConversationSessionEntry
  | FailedToolResultConversationSessionEntry
  | DeniedToolResultConversationSessionEntry;

type TaskSubagentConversationOutcome = {
  outcomeKind: "completed" | "failed";
  subagentResultSummary: string;
  toolResultText: string;
  durationMilliseconds: number;
  failureExplanation?: string;
};

type TaskSubagentConversationProgress =
  | {
    progressKind: "subagent_child_tool_calls_changed";
    subagentChildToolCalls: SubagentChildToolCall[];
  }
  | {
    progressKind: "subagent_research_checkpoint_reached";
    subagentResearchCheckpoint: SubagentResearchCheckpoint;
  }
  | {
    progressKind: "subagent_conversation_finished";
    taskSubagentConversationOutcome: TaskSubagentConversationOutcome;
  };

type TaskSubagentReadOnlyRequestedToolCall = {
  toolCallId: string;
  toolCallRequest: WorkspaceInspectionToolCallRequest;
};

export type StreamAssistantResponseEventsForTaskToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnProvider: ConversationTurnProvider;
  conversationTurnId: string;
  toolCallId: string;
  taskToolCallRequest: TaskToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
  workspaceRootPath: string;
  workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  projectInstructionTracker: ProjectInstructionTracker;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  subagentConversationConcurrencyLimiter: RuntimeSubagentConversationConcurrencyLimiter;
  taskSubagentSoftElapsedTimeCheckpointMilliseconds?: number | undefined;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  canSpawnSubagent: boolean;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForTaskToolCall(
  input: StreamAssistantResponseEventsForTaskToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.taskToolCallRequest);

  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "running",
      toolCallStartedAtMs,
      toolCallDetail: startedToolCallDetail,
    }),
  }));

  if (!input.canSpawnSubagent) {
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
      toolResultText: NESTED_SUBAGENT_DENIAL_TEXT,
      denialExplanation: NESTED_SUBAGENT_DENIAL_TEXT,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "denied",
        toolCallStartedAtMs,
        toolCallDetail: startedToolCallDetail,
        denialText: NESTED_SUBAGENT_DENIAL_TEXT,
        durationMs: Date.now() - toolCallStartedAtMs,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: NESTED_SUBAGENT_DENIAL_TEXT,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "denied",
    });
    return;
  }

  input.throwIfConversationTurnInterrupted();
  let latestSubagentChildToolCalls: SubagentChildToolCall[] = [];
  let latestSubagentResearchCheckpoint: SubagentResearchCheckpoint | undefined;
  let taskSubagentConversationOutcome: TaskSubagentConversationOutcome | undefined;
  for await (
    const taskSubagentConversationProgress of input.subagentConversationConcurrencyLimiter.stream(
      () =>
        streamTaskSubagentConversationProgress({
          conversationTurnProvider: input.conversationTurnProvider,
          conversationTurnId: input.conversationTurnId,
          parentTaskToolCallId: input.toolCallId,
          taskToolCallRequest: input.taskToolCallRequest,
          selectedModelId: input.selectedModelId,
          ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
          assistantProviderModelPromptProfile: input.assistantProviderModelPromptProfile,
          workspaceRootPath: input.workspaceRootPath,
          workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex,
          projectInstructionTracker: input.projectInstructionTracker,
          readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
          ...(input.taskSubagentSoftElapsedTimeCheckpointMilliseconds !== undefined
            ? { taskSubagentSoftElapsedTimeCheckpointMilliseconds: input.taskSubagentSoftElapsedTimeCheckpointMilliseconds }
            : {}),
          abortSignal: input.abortSignal,
          throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
          diagnosticLogger: input.diagnosticLogger,
        }),
      {
        toolCallId: input.toolCallId,
        toolName: "task",
        subagentName: input.taskToolCallRequest.subagentName,
      },
    )
  ) {
    input.throwIfConversationTurnInterrupted();
    if (taskSubagentConversationProgress.progressKind === "subagent_child_tool_calls_changed") {
      latestSubagentChildToolCalls = taskSubagentConversationProgress.subagentChildToolCalls;
      yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "running",
          toolCallStartedAtMs,
          toolCallDetail: buildTaskToolCallDetail({
            startedToolCallDetail,
            subagentChildToolCalls: latestSubagentChildToolCalls,
            ...(latestSubagentResearchCheckpoint ? { subagentResearchCheckpoint: latestSubagentResearchCheckpoint } : {}),
          }),
        }),
      }));
      continue;
    }

    if (taskSubagentConversationProgress.progressKind === "subagent_research_checkpoint_reached") {
      latestSubagentResearchCheckpoint = taskSubagentConversationProgress.subagentResearchCheckpoint;
      yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "running",
          toolCallStartedAtMs,
          toolCallDetail: buildTaskToolCallDetail({
            startedToolCallDetail,
            subagentChildToolCalls: latestSubagentChildToolCalls,
            subagentResearchCheckpoint: latestSubagentResearchCheckpoint,
          }),
        }),
      }));
      continue;
    }

    taskSubagentConversationOutcome = taskSubagentConversationProgress.taskSubagentConversationOutcome;
  }
  input.throwIfConversationTurnInterrupted();
  if (!taskSubagentConversationOutcome) {
    throw new Error("Subagent conversation stream ended before returning an outcome.");
  }

  const completedToolCallDetail = buildTaskToolCallDetail({
    startedToolCallDetail,
    subagentChildToolCalls: latestSubagentChildToolCalls,
    ...(latestSubagentResearchCheckpoint ? { subagentResearchCheckpoint: latestSubagentResearchCheckpoint } : {}),
    subagentResultSummary: taskSubagentConversationOutcome.subagentResultSummary,
  });

  if (taskSubagentConversationOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: completedToolCallDetail,
      toolResultText: taskSubagentConversationOutcome.toolResultText,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "completed",
        toolCallStartedAtMs,
        toolCallDetail: completedToolCallDetail,
        durationMs: taskSubagentConversationOutcome.durationMilliseconds,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: taskSubagentConversationOutcome.toolResultText,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "completed",
    });
    return;
  }

  const failureExplanation = taskSubagentConversationOutcome.failureExplanation ?? "Subagent failed before returning a result.";
  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: completedToolCallDetail,
    toolResultText: taskSubagentConversationOutcome.toolResultText,
    failureExplanation,
  });
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
    type: "assistant_message_part_updated",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "failed",
      toolCallStartedAtMs,
      toolCallDetail: completedToolCallDetail,
      errorText: failureExplanation,
      durationMs: taskSubagentConversationOutcome.durationMilliseconds,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolResultText: taskSubagentConversationOutcome.toolResultText,
    diagnosticLogger: input.diagnosticLogger,
    toolResultKind: "failed",
  });
}

async function* streamTaskSubagentConversationProgress(input: {
  conversationTurnProvider: ConversationTurnProvider;
  conversationTurnId: string;
  parentTaskToolCallId: string;
  taskToolCallRequest: TaskToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
  workspaceRootPath: string;
  workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  projectInstructionTracker: ProjectInstructionTracker;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  taskSubagentSoftElapsedTimeCheckpointMilliseconds?: number | undefined;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<TaskSubagentConversationProgress> {
  const subagentConversationStartedAtMs = Date.now();
  const subagentPromptText = buildTaskSubagentPromptText({
    taskToolCallRequest: input.taskToolCallRequest,
    assistantProviderModelPromptProfile: input.assistantProviderModelPromptProfile,
  });
  const subagentConversationHistory = new InMemoryConversationHistory();
  const subagentConversationSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationTurnId: input.conversationTurnId,
    conversationHistory: subagentConversationHistory,
    userPromptText: subagentPromptText,
    assistantOperatingMode: "understand",
    diagnosticLogger: input.diagnosticLogger,
  });
  const subagentToolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationTurnId: input.conversationTurnId,
    conversationHistory: subagentConversationHistory,
    diagnosticLogger: input.diagnosticLogger,
  });
  const subagentAssistantMessageTextChunks: string[] = [];
  const subagentResearchBudget: TaskSubagentResearchBudget = {
    childToolCallCount: 0,
    childToolResultTextLength: 0,
  };
  let subagentResearchCheckpoint: SubagentResearchCheckpoint | undefined;
  let nextResearchBudgetScanEntryIndex = 0;
  const subagentChildToolCallsById = new Map<string, SubagentChildToolCall>();
  const orderedSubagentChildToolCallIds: string[] = [];

  try {
    subagentConversationSessionRecorder.appendAcceptedUserPromptSessionEntry(subagentPromptText);
    nextResearchBudgetScanEntryIndex = subagentConversationHistory.conversationSessionEntries.length;
    const subagentDefinition = resolveBuiltInSubagentDefinition(input.taskToolCallRequest.subagentName);
    const subagentProviderConversationTurn = input.conversationTurnProvider.startConversationTurn({
      conversationTurnId: input.conversationTurnId,
      providerTurnKind: "task_subagent",
      parentTaskToolCallId: input.parentTaskToolCallId,
      subagentName: input.taskToolCallRequest.subagentName,
      systemPromptText: buildBuliExplorerSystemPrompt({
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionSnapshots: toProjectInstructionSnapshots(input.projectInstructionTracker.listProjectInstructionFiles()),
        assistantProviderModelPromptProfile: input.assistantProviderModelPromptProfile,
      }),
      conversationSessionEntries: subagentConversationHistory.listConversationSessionEntries(),
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      availableToolNames: subagentDefinition.availableToolNames,
      abortSignal: input.abortSignal,
    });

    for await (const providerStreamEvent of subagentProviderConversationTurn.streamProviderEvents()) {
      input.throwIfConversationTurnInterrupted();

      if (providerStreamEvent.type === "text_chunk") {
        subagentAssistantMessageTextChunks.push(providerStreamEvent.text);
        continue;
      }

      if (providerStreamEvent.type === "tool_call_requested" || providerStreamEvent.type === "tool_calls_requested") {
        const requestedToolCalls = listRequestedToolCallsFromProviderStreamEvent(providerStreamEvent);
        if (subagentResearchCheckpoint) {
          const failureExplanation = buildTaskSubagentRepeatedToolAfterCheckpointFailureText({
            requestedToolCalls,
            subagentResearchCheckpoint,
          });
          const subagentAssistantMessageText = subagentAssistantMessageTextChunks.join("");
          subagentConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
            entryKind: "assistant_message",
            assistantMessageStatus: "failed",
            assistantMessageText: subagentAssistantMessageText,
            failureExplanation,
          });
          yield {
            progressKind: "subagent_conversation_finished",
            taskSubagentConversationOutcome: createFailedTaskSubagentConversationOutcome({
              taskToolCallRequest: input.taskToolCallRequest,
              failureExplanation,
              subagentResultSummary: subagentAssistantMessageText.trim(),
              subagentResearchCheckpoint,
              durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
              ...collectTaskSubagentFailureEvidence({
                subagentChildToolCallsById,
                orderedSubagentChildToolCallIds,
                subagentConversationHistory,
              }),
            }),
          };
          return;
        }

        const subagentElapsedMilliseconds = Date.now() - subagentConversationStartedAtMs;
        const softElapsedTimeCheckpointMilliseconds = input.taskSubagentSoftElapsedTimeCheckpointMilliseconds ??
          DEFAULT_TASK_SUBAGENT_SOFT_ELAPSED_TIME_CHECKPOINT_MS;
        const subagentResearchBudgetDecision = decideTaskSubagentResearchBudget({
          researchBudget: subagentResearchBudget,
          elapsedMilliseconds: subagentElapsedMilliseconds,
          softElapsedTimeCheckpointMilliseconds,
        });
        if (subagentResearchBudgetDecision.shouldRequestCheckpoint) {
          subagentResearchCheckpoint = createTaskSubagentResearchCheckpoint({
            researchBudget: subagentResearchBudget,
            checkpointReason: subagentResearchBudgetDecision.checkpointReason,
            skippedChildToolCallCount: requestedToolCalls.length,
            elapsedMilliseconds: subagentElapsedMilliseconds,
            softElapsedTimeCheckpointMilliseconds,
          });
          logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.task_subagent_research_checkpoint_requested", {
            conversationTurnId: input.conversationTurnId,
            subagentName: input.taskToolCallRequest.subagentName,
            checkpointReason: subagentResearchCheckpoint.checkpointReason,
            childToolCallCount: subagentResearchCheckpoint.childToolCallCount,
            childToolResultTextLength: subagentResearchCheckpoint.childToolResultTextLength,
            skippedChildToolCallCount: subagentResearchCheckpoint.skippedChildToolCallCount,
            elapsedMilliseconds: subagentResearchCheckpoint.elapsedMilliseconds ?? null,
            softElapsedTimeCheckpointMilliseconds: subagentResearchCheckpoint.softElapsedTimeCheckpointMilliseconds ?? null,
          });
          yield {
            progressKind: "subagent_research_checkpoint_reached",
            subagentResearchCheckpoint,
          };
          await submitTaskSubagentBudgetCheckpointToolResults({
            requestedToolCalls,
            subagentProviderConversationTurn,
            conversationTurnId: input.conversationTurnId,
            subagentConversationHistory,
            subagentToolResultSessionRecorder,
            checkpointRequestText: buildTaskSubagentCheckpointRequestText(subagentResearchCheckpoint),
            diagnosticLogger: input.diagnosticLogger,
          });
          updateTaskSubagentResearchBudgetFromNewEntries({
            researchBudget: subagentResearchBudget,
            conversationSessionEntries: subagentConversationHistory.conversationSessionEntries,
            firstEntryIndex: nextResearchBudgetScanEntryIndex,
          });
          nextResearchBudgetScanEntryIndex = subagentConversationHistory.conversationSessionEntries.length;
          continue;
        }

        const subagentChildToolCallActivity = streamTaskSubagentChildToolCallActivity({
          requestedToolCalls,
          subagentProviderConversationTurn,
          conversationTurnId: input.conversationTurnId,
          subagentConversationHistory,
          subagentToolResultSessionRecorder,
          workspaceRootPath: input.workspaceRootPath,
          workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex,
          projectInstructionTracker: input.projectInstructionTracker,
          readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
          abortSignal: input.abortSignal,
          throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
          diagnosticLogger: input.diagnosticLogger,
        });

        for await (const subagentChildToolCall of subagentChildToolCallActivity) {
          upsertSubagentChildToolCall({
            subagentChildToolCallsById,
            orderedSubagentChildToolCallIds,
            subagentChildToolCall,
          });
          yield {
            progressKind: "subagent_child_tool_calls_changed",
            subagentChildToolCalls: collectOrderedSubagentChildToolCalls({
              subagentChildToolCallsById,
              orderedSubagentChildToolCallIds,
            }),
          };
        }
        updateTaskSubagentResearchBudgetFromNewEntries({
          researchBudget: subagentResearchBudget,
          conversationSessionEntries: subagentConversationHistory.conversationSessionEntries,
          firstEntryIndex: nextResearchBudgetScanEntryIndex,
        });
        nextResearchBudgetScanEntryIndex = subagentConversationHistory.conversationSessionEntries.length;
        continue;
      }

      if (providerStreamEvent.type === "completed") {
        const subagentAssistantMessageText = subagentAssistantMessageTextChunks.join("");
        const subagentResultSummary = subagentAssistantMessageText.trim();
        if (subagentResultSummary.length === 0) {
          const failureExplanation = "Subagent completed without returning a summary.";
          subagentConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
            entryKind: "assistant_message",
            assistantMessageStatus: "failed",
            assistantMessageText: subagentAssistantMessageText,
            failureExplanation,
          });
          yield {
            progressKind: "subagent_conversation_finished",
            taskSubagentConversationOutcome: createFailedTaskSubagentConversationOutcome({
              taskToolCallRequest: input.taskToolCallRequest,
              failureExplanation,
              ...(subagentResearchCheckpoint ? { subagentResearchCheckpoint } : {}),
              durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
              ...collectTaskSubagentFailureEvidence({
                subagentChildToolCallsById,
                orderedSubagentChildToolCallIds,
                subagentConversationHistory,
              }),
            }),
          };
          return;
        }

        subagentConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "completed",
          assistantMessageText: subagentResultSummary,
        });
        yield {
          progressKind: "subagent_conversation_finished",
          taskSubagentConversationOutcome: {
            outcomeKind: "completed",
            subagentResultSummary,
            toolResultText: buildTaskSubagentCompletedToolResultText({
              taskToolCallRequest: input.taskToolCallRequest,
              ...(subagentResearchCheckpoint ? { subagentResearchCheckpoint } : {}),
              subagentResultSummary,
            }),
            durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
          },
        };
        return;
      }

      if (providerStreamEvent.type === "incomplete") {
        const subagentAssistantMessageText = subagentAssistantMessageTextChunks.join("");
        const failureExplanation = `Subagent stopped before completion: ${providerStreamEvent.incompleteReason}`;
        subagentConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "incomplete",
          assistantMessageText: subagentAssistantMessageText,
          incompleteReason: providerStreamEvent.incompleteReason,
        });
        yield {
          progressKind: "subagent_conversation_finished",
          taskSubagentConversationOutcome: createFailedTaskSubagentConversationOutcome({
            taskToolCallRequest: input.taskToolCallRequest,
            failureExplanation,
            subagentResultSummary: subagentAssistantMessageText.trim(),
            ...(subagentResearchCheckpoint ? { subagentResearchCheckpoint } : {}),
            durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
            ...collectTaskSubagentFailureEvidence({
              subagentChildToolCallsById,
              orderedSubagentChildToolCallIds,
              subagentConversationHistory,
            }),
          }),
        };
        return;
      }
    }

    const subagentAssistantMessageText = subagentAssistantMessageTextChunks.join("");
    const failureExplanation = "Subagent provider stream ended before completion.";
    subagentConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: subagentAssistantMessageText,
      failureExplanation,
    });
    yield {
      progressKind: "subagent_conversation_finished",
      taskSubagentConversationOutcome: createFailedTaskSubagentConversationOutcome({
        taskToolCallRequest: input.taskToolCallRequest,
        failureExplanation,
        subagentResultSummary: subagentAssistantMessageText.trim(),
        ...(subagentResearchCheckpoint ? { subagentResearchCheckpoint } : {}),
        durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
        ...collectTaskSubagentFailureEvidence({
          subagentChildToolCallsById,
          orderedSubagentChildToolCallIds,
          subagentConversationHistory,
        }),
      }),
    };
    return;
  } catch (error) {
    if (input.abortSignal.aborted) {
      throw error;
    }

    const subagentAssistantMessageText = subagentAssistantMessageTextChunks.join("");
    const failureExplanation = error instanceof Error ? error.message : String(error);
    if (!subagentConversationSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()) {
      subagentConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
        entryKind: "assistant_message",
        assistantMessageStatus: "failed",
        assistantMessageText: subagentAssistantMessageText,
        failureExplanation,
      });
    }
    yield {
      progressKind: "subagent_conversation_finished",
      taskSubagentConversationOutcome: createFailedTaskSubagentConversationOutcome({
        taskToolCallRequest: input.taskToolCallRequest,
        failureExplanation,
        subagentResultSummary: subagentAssistantMessageText.trim(),
        ...(subagentResearchCheckpoint ? { subagentResearchCheckpoint } : {}),
        durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
        ...collectTaskSubagentFailureEvidence({
          subagentChildToolCallsById,
          orderedSubagentChildToolCallIds,
          subagentConversationHistory,
        }),
      }),
    };
    return;
  }
}

type TaskSubagentResearchBudgetDecision =
  | { shouldRequestCheckpoint: false }
  | { shouldRequestCheckpoint: true; checkpointReason: SubagentResearchCheckpoint["checkpointReason"] };

type TaskSubagentResearchBudget = {
  childToolCallCount: number;
  childToolResultTextLength: number;
};

function decideTaskSubagentResearchBudget(input: {
  researchBudget: TaskSubagentResearchBudget;
  elapsedMilliseconds: number;
  softElapsedTimeCheckpointMilliseconds: number;
}): TaskSubagentResearchBudgetDecision {
  if (input.researchBudget.childToolCallCount >= TASK_SUBAGENT_CHILD_TOOL_CALL_CHECKPOINT_LIMIT) {
    return {
      shouldRequestCheckpoint: true,
      checkpointReason: "child_tool_call_count",
    };
  }

  if (input.researchBudget.childToolResultTextLength >= TASK_SUBAGENT_CHILD_TOOL_RESULT_TEXT_CHECKPOINT_LIMIT) {
    return {
      shouldRequestCheckpoint: true,
      checkpointReason: "child_tool_result_text_length",
    };
  }

  if (
    input.researchBudget.childToolCallCount > 0 &&
    input.elapsedMilliseconds >= input.softElapsedTimeCheckpointMilliseconds
  ) {
    return {
      shouldRequestCheckpoint: true,
      checkpointReason: "elapsed_time",
    };
  }

  return { shouldRequestCheckpoint: false };
}

function createTaskSubagentResearchCheckpoint(input: {
  researchBudget: TaskSubagentResearchBudget;
  checkpointReason: SubagentResearchCheckpoint["checkpointReason"];
  skippedChildToolCallCount: number;
  elapsedMilliseconds: number;
  softElapsedTimeCheckpointMilliseconds: number;
}): SubagentResearchCheckpoint {
  return {
    checkpointReason: input.checkpointReason,
    childToolCallCount: input.researchBudget.childToolCallCount,
    childToolResultTextLength: input.researchBudget.childToolResultTextLength,
    skippedChildToolCallCount: input.skippedChildToolCallCount,
    elapsedMilliseconds: input.elapsedMilliseconds,
    softElapsedTimeCheckpointMilliseconds: input.softElapsedTimeCheckpointMilliseconds,
  };
}

function updateTaskSubagentResearchBudgetFromNewEntries(input: {
  researchBudget: TaskSubagentResearchBudget;
  conversationSessionEntries: readonly ConversationSessionEntry[];
  firstEntryIndex: number;
}): void {
  for (let entryIndex = input.firstEntryIndex; entryIndex < input.conversationSessionEntries.length; entryIndex += 1) {
    const conversationSessionEntry = input.conversationSessionEntries[entryIndex];
    if (!conversationSessionEntry) {
      continue;
    }

    if (conversationSessionEntry.entryKind === "tool_call") {
      input.researchBudget.childToolCallCount += 1;
      continue;
    }

    if (isTaskSubagentToolResultConversationSessionEntry(conversationSessionEntry)) {
      input.researchBudget.childToolResultTextLength += conversationSessionEntry.toolResultText.length;
    }
  }
}

async function submitTaskSubagentBudgetCheckpointToolResults(input: {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
  subagentProviderConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  subagentConversationHistory: InMemoryConversationHistory;
  subagentToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  checkpointRequestText: string;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<void> {
  for (const requestedToolCall of input.requestedToolCalls) {
    input.subagentConversationHistory.appendConversationSessionEntry({
      entryKind: "tool_call",
      toolCallId: requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCall.toolCallRequest,
    });
    const deniedStartedToolCallDetail = createStartedToolCallDetailFromRequest(requestedToolCall.toolCallRequest);
    input.subagentToolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: requestedToolCall.toolCallId,
      toolCallDetail: deniedStartedToolCallDetail,
      toolResultText: input.checkpointRequestText,
      denialExplanation: input.checkpointRequestText,
    });
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.subagentProviderConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: requestedToolCall.toolCallId,
      toolResultText: input.checkpointRequestText,
      toolResultKind: "denied",
      diagnosticLogger: input.diagnosticLogger,
    });
  }
}

async function* streamTaskSubagentChildToolCallActivity(input: {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
  subagentProviderConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  subagentConversationHistory: InMemoryConversationHistory;
  subagentToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  projectInstructionTracker: ProjectInstructionTracker;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<SubagentChildToolCall> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Subagent cannot execute an empty child tool-call batch.");
  }

  const effectiveRequestedToolCalls = input.requestedToolCalls.map(createEffectiveTaskSubagentRequestedToolCall);

  for (const requestedToolCall of effectiveRequestedToolCalls) {
    input.subagentConversationHistory.appendConversationSessionEntry({
      entryKind: "tool_call",
      toolCallId: requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCall.toolCallRequest,
    });
  }

  if (effectiveRequestedToolCalls.length > 1 && areAllSubagentReadOnlyToolCalls(effectiveRequestedToolCalls)) {
    for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
      assistantResponseMessageId: randomUUID(),
      providerConversationTurn: input.subagentProviderConversationTurn,
      conversationTurnId: input.conversationTurnId,
      requestedToolCalls: effectiveRequestedToolCalls,
      workspaceRootPath: input.workspaceRootPath,
      workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex,
      projectInstructionTracker: input.projectInstructionTracker,
      toolResultSessionRecorder: input.subagentToolResultSessionRecorder,
      readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
      abortSignal: input.abortSignal,
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
      diagnosticLogger: input.diagnosticLogger,
    })) {
      input.throwIfConversationTurnInterrupted();
      const subagentChildToolCall = createSubagentChildToolCallFromAssistantResponseEvent(assistantResponseEvent);
      if (subagentChildToolCall) {
        yield subagentChildToolCall;
      }
    }
    return;
  }

  for (const requestedToolCall of effectiveRequestedToolCalls) {
    if (isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest)) {
      yield* streamSingleTaskSubagentReadOnlyChildToolCall({
        requestedToolCall: {
          toolCallId: requestedToolCall.toolCallId,
          toolCallRequest: requestedToolCall.toolCallRequest,
        },
        subagentProviderConversationTurn: input.subagentProviderConversationTurn,
        conversationTurnId: input.conversationTurnId,
        subagentToolResultSessionRecorder: input.subagentToolResultSessionRecorder,
        workspaceRootPath: input.workspaceRootPath,
        workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex,
        projectInstructionTracker: input.projectInstructionTracker,
        readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
        abortSignal: input.abortSignal,
        throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
        diagnosticLogger: input.diagnosticLogger,
      });
      continue;
    }

    const deniedChildToolCallStartedAtMs = Date.now();
    const deniedStartedToolCallDetail = createStartedToolCallDetailFromRequest(requestedToolCall.toolCallRequest);
    const deniedChildToolCallDetail = createSubagentChildToolCallDetailFromToolCallDetail(deniedStartedToolCallDetail);
    const denialExplanation = buildSubagentDisallowedToolDenialText(requestedToolCall.toolCallRequest);
    input.subagentToolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: requestedToolCall.toolCallId,
      toolCallDetail: deniedStartedToolCallDetail,
      toolResultText: denialExplanation,
      denialExplanation,
    });
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.subagentProviderConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: requestedToolCall.toolCallId,
      toolResultText: denialExplanation,
      toolResultKind: "denied",
      diagnosticLogger: input.diagnosticLogger,
    });
    if (deniedChildToolCallDetail) {
      yield createDeniedSubagentChildToolCall({
        toolCallId: requestedToolCall.toolCallId,
        deniedChildToolCallStartedAtMs,
        deniedChildToolCallDetail,
        denialExplanation,
      });
    }
  }
}

function createEffectiveTaskSubagentRequestedToolCall(
  requestedToolCall: ProviderRequestedToolCall,
): ProviderRequestedToolCall {
  if (
    requestedToolCall.toolCallRequest.toolName !== "read" ||
    requestedToolCall.toolCallRequest.maximumLineCount !== undefined
  ) {
    return requestedToolCall;
  }

  return {
    ...requestedToolCall,
    toolCallRequest: {
      ...requestedToolCall.toolCallRequest,
      maximumLineCount: MAX_READ_TOOL_LINE_COUNT,
    },
  };
}

async function* streamSingleTaskSubagentReadOnlyChildToolCall(input: {
  requestedToolCall: TaskSubagentReadOnlyRequestedToolCall;
  subagentProviderConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  subagentToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  workspaceCodebaseKnowledgeIndex: WorkspaceCodebaseKnowledgeIndex;
  projectInstructionTracker: ProjectInstructionTracker;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<SubagentChildToolCall> {
  for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall({
    assistantResponseMessageId: randomUUID(),
    providerConversationTurn: input.subagentProviderConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.requestedToolCall.toolCallId,
    toolCallRequest: input.requestedToolCall.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    workspaceCodebaseKnowledgeIndex: input.workspaceCodebaseKnowledgeIndex,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.subagentToolResultSessionRecorder,
    readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
    abortSignal: input.abortSignal,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  })) {
    input.throwIfConversationTurnInterrupted();
    const subagentChildToolCall = createSubagentChildToolCallFromAssistantResponseEvent(assistantResponseEvent);
    if (subagentChildToolCall) {
      yield subagentChildToolCall;
    }
  }
}

function listRequestedToolCallsFromProviderStreamEvent(
  providerStreamEvent: Extract<ProviderStreamEvent, { type: "tool_call_requested" | "tool_calls_requested" }>,
): ProviderRequestedToolCall[] {
  if (providerStreamEvent.type === "tool_calls_requested") {
    return [...providerStreamEvent.requestedToolCalls];
  }

  return [{
    toolCallId: providerStreamEvent.toolCallId,
    toolCallRequest: providerStreamEvent.toolCallRequest,
  }];
}

function areAllSubagentReadOnlyToolCalls(
  requestedToolCalls: readonly ProviderRequestedToolCall[],
): requestedToolCalls is readonly TaskSubagentReadOnlyRequestedToolCall[] {
  return requestedToolCalls.every((requestedToolCall) => isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest));
}

function buildTaskToolCallDetail(input: {
  startedToolCallDetail: ToolCallTaskDetail;
  subagentChildToolCalls: readonly SubagentChildToolCall[];
  subagentResearchCheckpoint?: SubagentResearchCheckpoint;
  subagentResultSummary?: string;
}): ToolCallTaskDetail {
  return {
    ...input.startedToolCallDetail,
    ...(input.subagentChildToolCalls.length > 0
      ? { subagentChildToolCalls: [...input.subagentChildToolCalls] }
      : {}),
    ...(input.subagentResearchCheckpoint !== undefined
      ? { subagentResearchCheckpoint: input.subagentResearchCheckpoint }
      : {}),
    ...(input.subagentResultSummary !== undefined
      ? { subagentResultSummary: input.subagentResultSummary }
      : {}),
  };
}

function createSubagentChildToolCallFromAssistantResponseEvent(
  assistantResponseEvent: AssistantResponseEvent,
): SubagentChildToolCall | undefined {
  if (
    assistantResponseEvent.type !== "assistant_message_part_added" &&
    assistantResponseEvent.type !== "assistant_message_part_updated"
  ) {
    return undefined;
  }

  if (assistantResponseEvent.part.partKind !== "assistant_tool_call") {
    return undefined;
  }

  const subagentChildToolCallDetail = createSubagentChildToolCallDetailFromToolCallDetail(
    assistantResponseEvent.part.toolCallDetail,
  );
  if (!subagentChildToolCallDetail) {
    return undefined;
  }

  return createSubagentChildToolCallFromPart({
    subagentChildToolCallPart: assistantResponseEvent.part,
    subagentChildToolCallDetail,
  });
}

function createSubagentChildToolCallFromPart(input: {
  subagentChildToolCallPart: AssistantToolCallConversationMessagePart;
  subagentChildToolCallDetail: SubagentChildToolCallDetail;
}): SubagentChildToolCall {
  return {
    subagentChildToolCallId: input.subagentChildToolCallPart.toolCallId,
    subagentChildToolCallStatus: mapSubagentChildToolCallStatus(input.subagentChildToolCallPart.toolCallStatus),
    subagentChildToolCallStartedAtMs: input.subagentChildToolCallPart.toolCallStartedAtMs,
    subagentChildToolCallDetail: input.subagentChildToolCallDetail,
    ...(input.subagentChildToolCallPart.durationMs !== undefined
      ? { subagentChildToolCallDurationMs: input.subagentChildToolCallPart.durationMs }
      : {}),
    ...(input.subagentChildToolCallPart.errorText !== undefined
      ? { subagentChildToolCallErrorText: input.subagentChildToolCallPart.errorText }
      : {}),
    ...(input.subagentChildToolCallPart.denialText !== undefined
      ? { subagentChildToolCallDenialText: input.subagentChildToolCallPart.denialText }
      : {}),
  };
}

function createSubagentChildToolCallDetailFromToolCallDetail(
  toolCallDetail: ToolCallDetail,
): SubagentChildToolCallDetail | undefined {
  if (
    toolCallDetail.toolName === "read" ||
    toolCallDetail.toolName === "glob" ||
    toolCallDetail.toolName === "grep" ||
    toolCallDetail.toolName === "locate_codebase_symbols" ||
    toolCallDetail.toolName === "bash" ||
    toolCallDetail.toolName === "edit" ||
    toolCallDetail.toolName === "edit_many" ||
    toolCallDetail.toolName === "patch" ||
    toolCallDetail.toolName === "patch_many" ||
    toolCallDetail.toolName === "write" ||
    toolCallDetail.toolName === "skill"
  ) {
    return toolCallDetail;
  }

  if (toolCallDetail.toolName === "task") {
    return {
      toolName: "task",
      subagentName: toolCallDetail.subagentName,
      subagentDescription: toolCallDetail.subagentDescription,
      ...(toolCallDetail.subagentPrompt !== undefined ? { subagentPrompt: toolCallDetail.subagentPrompt } : {}),
    };
  }

  return undefined;
}

function mapSubagentChildToolCallStatus(
  toolCallStatus: AssistantToolCallConversationMessagePart["toolCallStatus"],
): SubagentChildToolCallStatus {
  if (toolCallStatus === "pending_approval") {
    throw new Error("Subagent child tool calls cannot wait for approval.");
  }

  return toolCallStatus;
}

function createDeniedSubagentChildToolCall(input: {
  toolCallId: string;
  deniedChildToolCallStartedAtMs: number;
  deniedChildToolCallDetail: SubagentChildToolCallDetail;
  denialExplanation: string;
}): SubagentChildToolCall {
  return {
    subagentChildToolCallId: input.toolCallId,
    subagentChildToolCallStatus: "denied",
    subagentChildToolCallStartedAtMs: input.deniedChildToolCallStartedAtMs,
    subagentChildToolCallDetail: input.deniedChildToolCallDetail,
    subagentChildToolCallDenialText: input.denialExplanation,
    subagentChildToolCallDurationMs: Date.now() - input.deniedChildToolCallStartedAtMs,
  };
}

function upsertSubagentChildToolCall(input: {
  subagentChildToolCallsById: Map<string, SubagentChildToolCall>;
  orderedSubagentChildToolCallIds: string[];
  subagentChildToolCall: SubagentChildToolCall;
}): void {
  if (!input.subagentChildToolCallsById.has(input.subagentChildToolCall.subagentChildToolCallId)) {
    input.orderedSubagentChildToolCallIds.push(input.subagentChildToolCall.subagentChildToolCallId);
  }

  input.subagentChildToolCallsById.set(input.subagentChildToolCall.subagentChildToolCallId, input.subagentChildToolCall);
}

function collectOrderedSubagentChildToolCalls(input: {
  subagentChildToolCallsById: Map<string, SubagentChildToolCall>;
  orderedSubagentChildToolCallIds: readonly string[];
}): SubagentChildToolCall[] {
  const orderedSubagentChildToolCalls: SubagentChildToolCall[] = [];
  for (const subagentChildToolCallId of input.orderedSubagentChildToolCallIds) {
    const subagentChildToolCall = input.subagentChildToolCallsById.get(subagentChildToolCallId);
    if (subagentChildToolCall) {
      orderedSubagentChildToolCalls.push(subagentChildToolCall);
    }
  }

  return orderedSubagentChildToolCalls;
}

function collectTaskSubagentFailureEvidence(input: {
  subagentChildToolCallsById: Map<string, SubagentChildToolCall>;
  orderedSubagentChildToolCallIds: readonly string[];
  subagentConversationHistory: InMemoryConversationHistory;
}): {
  subagentChildToolCalls: SubagentChildToolCall[];
  subagentToolResultEntries: TaskSubagentToolResultConversationSessionEntry[];
} {
  return {
    subagentChildToolCalls: collectOrderedSubagentChildToolCalls({
      subagentChildToolCallsById: input.subagentChildToolCallsById,
      orderedSubagentChildToolCallIds: input.orderedSubagentChildToolCallIds,
    }),
    subagentToolResultEntries: listTaskSubagentToolResultConversationSessionEntries(
      input.subagentConversationHistory.conversationSessionEntries,
    ),
  };
}

function listTaskSubagentToolResultConversationSessionEntries(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): TaskSubagentToolResultConversationSessionEntry[] {
  const taskSubagentToolResultConversationSessionEntries: TaskSubagentToolResultConversationSessionEntry[] = [];
  for (const conversationSessionEntry of conversationSessionEntries) {
    if (isTaskSubagentToolResultConversationSessionEntry(conversationSessionEntry)) {
      taskSubagentToolResultConversationSessionEntries.push(conversationSessionEntry);
    }
  }

  return taskSubagentToolResultConversationSessionEntries;
}

function isTaskSubagentToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is TaskSubagentToolResultConversationSessionEntry {
  return conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result";
}

function buildTaskSubagentCheckpointRequestText(input: SubagentResearchCheckpoint): string {
  const reasonText = formatTaskSubagentCheckpointReasonText(input);
  const skippedChildToolCallText = input.skippedChildToolCallCount === 1
    ? "This child tool call was not executed."
    : `These ${input.skippedChildToolCallCount} child tool calls were not executed.`;
  const elapsedText = input.elapsedMilliseconds !== undefined ? `, ${input.elapsedMilliseconds} ms elapsed` : "";
  return [
    `Explorer research budget reached: ${reasonText}.`,
    `Current research state: ${input.childToolCallCount} child tool calls, ${input.childToolResultTextLength} characters of child tool output${elapsedText}.`,
    skippedChildToolCallText,
    "Stop requesting tools and return a concise checkpoint summary with findings, inspected files, important line references, remaining uncertainty, and recommended next searches.",
  ].join("\n");
}

function formatTaskSubagentCheckpointReasonText(input: SubagentResearchCheckpoint): string {
  switch (input.checkpointReason) {
    case "child_tool_call_count":
      return `the child tool-call limit of ${TASK_SUBAGENT_CHILD_TOOL_CALL_CHECKPOINT_LIMIT} was reached`;
    case "child_tool_result_text_length":
      return `child tool output reached ${input.childToolResultTextLength} characters`;
    case "elapsed_time": {
      const elapsedMilliseconds = input.elapsedMilliseconds ?? 0;
      return input.softElapsedTimeCheckpointMilliseconds !== undefined
        ? `the soft elapsed-time limit of ${input.softElapsedTimeCheckpointMilliseconds} ms was reached after ${elapsedMilliseconds} ms`
        : `the soft elapsed-time limit was reached after ${elapsedMilliseconds} ms`;
    }
  }
}

function buildTaskSubagentRepeatedToolAfterCheckpointFailureText(input: {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
  subagentResearchCheckpoint: SubagentResearchCheckpoint;
}): string {
  const requestedToolCallCount = input.requestedToolCalls.length;
  const toolCallLabel = requestedToolCallCount === 1 ? "tool call" : "tool calls";
  return [
    "Explorer continued requesting tools after the research checkpoint instead of returning a summary.",
    `Skipped ${requestedToolCallCount} additional child ${toolCallLabel}.`,
    `Checkpoint state was ${input.subagentResearchCheckpoint.childToolCallCount} child tool calls and ${input.subagentResearchCheckpoint.childToolResultTextLength} characters of child tool output${input.subagentResearchCheckpoint.elapsedMilliseconds !== undefined ? ` after ${input.subagentResearchCheckpoint.elapsedMilliseconds} ms` : ""}.`,
  ].join(" ");
}

function buildTaskSubagentPromptText(input: {
  taskToolCallRequest: TaskToolCallRequest;
  assistantProviderModelPromptProfile: AssistantProviderModelPromptProfile;
}): string {
  const providerModelPromptProfileBlock = formatAssistantProviderModelPromptProfileFragmentBlock({
    assistantProviderModelPromptProfile: input.assistantProviderModelPromptProfile,
    fragmentTarget: "taskSubagentPrompt",
  });
  return [
    `Subagent: ${input.taskToolCallRequest.subagentName}`,
    `Task description: ${input.taskToolCallRequest.subagentDescription}`,
    ...(providerModelPromptProfileBlock ? ["", providerModelPromptProfileBlock] : []),
    "",
    "Detailed task instructions:",
    input.taskToolCallRequest.subagentPrompt,
    "",
    "Return a concise report for the parent assistant. Include important file paths, function names, and line references when they matter.",
  ].join("\n");
}

function buildTaskSubagentCompletedToolResultText(input: {
  taskToolCallRequest: TaskToolCallRequest;
  subagentResearchCheckpoint?: SubagentResearchCheckpoint;
  subagentResultSummary: string;
}): string {
  return [
    "<task_result>",
    `<subagent>${escapeModelFacingXmlText(input.taskToolCallRequest.subagentName)}</subagent>`,
    `<description>${escapeModelFacingXmlText(input.taskToolCallRequest.subagentDescription)}</description>`,
    ...buildTaskSubagentResearchCheckpointXmlLines(input.subagentResearchCheckpoint),
    "<summary>",
    escapeModelFacingXmlText(input.subagentResultSummary),
    "</summary>",
    "</task_result>",
  ].join("\n");
}

function buildTaskSubagentResearchCheckpointXmlLines(
  subagentResearchCheckpoint: SubagentResearchCheckpoint | undefined,
): string[] {
  if (!subagentResearchCheckpoint) {
    return [];
  }

  return [
    "<research_checkpoint>",
    `<reason>${subagentResearchCheckpoint.checkpointReason}</reason>`,
    `<child_tool_call_count>${subagentResearchCheckpoint.childToolCallCount}</child_tool_call_count>`,
    `<child_tool_result_text_length>${subagentResearchCheckpoint.childToolResultTextLength}</child_tool_result_text_length>`,
    `<skipped_child_tool_call_count>${subagentResearchCheckpoint.skippedChildToolCallCount}</skipped_child_tool_call_count>`,
    ...(subagentResearchCheckpoint.elapsedMilliseconds !== undefined
      ? [`<elapsed_ms>${subagentResearchCheckpoint.elapsedMilliseconds}</elapsed_ms>`]
      : []),
    ...(subagentResearchCheckpoint.softElapsedTimeCheckpointMilliseconds !== undefined
      ? [
          `<soft_elapsed_time_checkpoint_ms>${subagentResearchCheckpoint.softElapsedTimeCheckpointMilliseconds}</soft_elapsed_time_checkpoint_ms>`,
        ]
      : []),
    "</research_checkpoint>",
  ];
}

function createFailedTaskSubagentConversationOutcome(input: {
  taskToolCallRequest: TaskToolCallRequest;
  failureExplanation: string;
  subagentResultSummary?: string;
  subagentResearchCheckpoint?: SubagentResearchCheckpoint;
  subagentChildToolCalls?: readonly SubagentChildToolCall[];
  subagentToolResultEntries?: readonly TaskSubagentToolResultConversationSessionEntry[];
  durationMilliseconds: number;
}): TaskSubagentConversationOutcome {
  const subagentResultSummary = input.subagentResultSummary && input.subagentResultSummary.length > 0
    ? input.subagentResultSummary
    : input.failureExplanation;
  return {
    outcomeKind: "failed",
    subagentResultSummary,
    toolResultText: [
      "<task_result>",
      `<subagent>${escapeModelFacingXmlText(input.taskToolCallRequest.subagentName)}</subagent>`,
      `<description>${escapeModelFacingXmlText(input.taskToolCallRequest.subagentDescription)}</description>`,
      `<duration_ms>${input.durationMilliseconds}</duration_ms>`,
      ...buildTaskSubagentResearchCheckpointXmlLines(input.subagentResearchCheckpoint),
      "<failure>",
      escapeModelFacingXmlText(input.failureExplanation),
      "</failure>",
      ...(input.subagentResultSummary && input.subagentResultSummary.length > 0
        ? ["<partial_summary>", escapeModelFacingXmlText(input.subagentResultSummary), "</partial_summary>"]
        : []),
      ...buildFailedTaskSubagentChildToolCallLines(input.subagentChildToolCalls ?? []),
      ...buildFailedTaskSubagentPartialToolResultLines(input.subagentToolResultEntries ?? []),
      "</task_result>",
    ].join("\n"),
    durationMilliseconds: input.durationMilliseconds,
    failureExplanation: input.failureExplanation,
  };
}

function buildFailedTaskSubagentChildToolCallLines(
  subagentChildToolCalls: readonly SubagentChildToolCall[],
): string[] {
  if (subagentChildToolCalls.length === 0) {
    return [];
  }

  return [
    "<child_tool_calls>",
    ...subagentChildToolCalls.map((subagentChildToolCall) => escapeModelFacingXmlText(formatSubagentChildToolCall(subagentChildToolCall))),
    "</child_tool_calls>",
  ];
}

function formatSubagentChildToolCall(subagentChildToolCall: SubagentChildToolCall): string {
  const statusDetail = subagentChildToolCall.subagentChildToolCallErrorText
    ? ` error=${subagentChildToolCall.subagentChildToolCallErrorText}`
    : subagentChildToolCall.subagentChildToolCallDenialText
      ? ` denial=${subagentChildToolCall.subagentChildToolCallDenialText}`
      : "";
  return [
    `- ${subagentChildToolCall.subagentChildToolCallId}:`,
    subagentChildToolCall.subagentChildToolCallStatus,
    formatSubagentChildToolCallDetail(subagentChildToolCall.subagentChildToolCallDetail),
    statusDetail,
  ].join(" ").trim();
}

function formatSubagentChildToolCallDetail(subagentChildToolCallDetail: SubagentChildToolCallDetail): string {
  switch (subagentChildToolCallDetail.toolName) {
    case "read":
      return `read ${subagentChildToolCallDetail.readFilePath}`;
    case "glob":
      return `glob ${subagentChildToolCallDetail.globPattern}`;
    case "grep":
      return `grep ${subagentChildToolCallDetail.searchPattern}`;
    case "locate_codebase_symbols":
      return `locate_codebase_symbols ${[...(subagentChildToolCallDetail.symbolNames ?? []), ...(subagentChildToolCallDetail.filePaths ?? [])].join(", ")}`;
    case "bash":
      return `bash ${subagentChildToolCallDetail.commandLine}`;
    case "edit":
      return `edit ${subagentChildToolCallDetail.editedFilePath}`;
    case "edit_many":
      return `edit_many ${subagentChildToolCallDetail.editCount} edits`;
    case "patch":
      return `patch ${subagentChildToolCallDetail.patchTargetText}`;
    case "patch_many":
      return `patch_many ${subagentChildToolCallDetail.patchTargetText}`;
    case "write":
      return `write ${subagentChildToolCallDetail.writtenFilePath}`;
    case "skill":
      return `skill ${subagentChildToolCallDetail.skillName}`;
    case "task":
      return `task ${subagentChildToolCallDetail.subagentName}: ${subagentChildToolCallDetail.subagentDescription}`;
    default:
      return assertUnhandledSubagentChildToolCallDetail(subagentChildToolCallDetail);
  }
}

function buildFailedTaskSubagentPartialToolResultLines(
  subagentToolResultEntries: readonly TaskSubagentToolResultConversationSessionEntry[],
): string[] {
  if (subagentToolResultEntries.length === 0) {
    return [];
  }

  const partialToolResultLines = ["<partial_child_tool_results>"];
  let remainingToolResultTextLength = MAX_FAILED_TASK_CHILD_TOOL_RESULT_TEXT_TOTAL_LENGTH;
  for (const subagentToolResultEntry of subagentToolResultEntries) {
    if (remainingToolResultTextLength <= 0) {
      partialToolResultLines.push("[additional child tool results omitted]");
      break;
    }

    const cappedToolResultText = capFailedTaskChildToolResultText(
      subagentToolResultEntry.toolResultText,
      Math.min(MAX_FAILED_TASK_CHILD_TOOL_RESULT_TEXT_LENGTH, remainingToolResultTextLength),
    );
    remainingToolResultTextLength -= cappedToolResultText.length;
    partialToolResultLines.push(
      `<child_tool_result tool_call_id="${escapeModelFacingXmlAttributeValue(subagentToolResultEntry.toolCallId)}" status="${readTaskSubagentToolResultStatus(subagentToolResultEntry)}">`,
      escapeModelFacingXmlText(cappedToolResultText),
      "</child_tool_result>",
    );
  }

  partialToolResultLines.push("</partial_child_tool_results>");
  return partialToolResultLines;
}

function capFailedTaskChildToolResultText(toolResultText: string, maximumLength: number): string {
  if (toolResultText.length <= maximumLength) {
    return toolResultText;
  }

  return `${toolResultText.slice(0, maximumLength)}\n[truncated ${toolResultText.length - maximumLength} chars]`;
}

function readTaskSubagentToolResultStatus(
  subagentToolResultEntry: TaskSubagentToolResultConversationSessionEntry,
): "completed" | "failed" | "denied" {
  if (subagentToolResultEntry.entryKind === "completed_tool_result") {
    return "completed";
  }
  if (subagentToolResultEntry.entryKind === "failed_tool_result") {
    return "failed";
  }

  return "denied";
}

function assertUnhandledSubagentChildToolCallDetail(subagentChildToolCallDetail: never): never {
  throw new Error(`Unhandled subagent child tool-call detail: ${JSON.stringify(subagentChildToolCallDetail)}`);
}

function buildSubagentDisallowedToolDenialText(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "task") {
    return NESTED_SUBAGENT_DENIAL_TEXT;
  }

  return `Subagent is read-only and cannot use ${toolCallRequest.toolName}. Use read, glob, grep, or locate_codebase_symbols instead.`;
}
