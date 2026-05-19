import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantResponseEvent,
  type AssistantToolCallConversationMessagePart,
  type BuliDiagnosticLogger,
  type ProviderRequestedToolCall,
  type ProviderStreamEvent,
  type ReasoningEffort,
  type SubagentChildToolCall,
  type SubagentChildToolCallDetail,
  type SubagentChildToolCallStatus,
  type TaskToolCallRequest,
  type ToolCallDetail,
  type ToolCallRequest,
  type ToolCallTaskDetail,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import { escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";
import { toProjectInstructionSnapshots, type ProjectInstructionTracker } from "./projectInstructions.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import {
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "./runtimeReadOnlyToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { buildBuliExplorerSystemPrompt } from "./systemPrompt.ts";
import { resolveBuiltInSubagentDefinition } from "./assistantAgentCatalog.ts";

const NESTED_SUBAGENT_DENIAL_TEXT = "Subagents cannot spawn another subagent. Continue with read, glob, and grep instead.";

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
  toolCallId: string;
  taskToolCallRequest: TaskToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
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
      toolCallId: input.toolCallId,
      toolResultText: NESTED_SUBAGENT_DENIAL_TEXT,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "denied",
    });
    return;
  }

  input.throwIfConversationTurnInterrupted();
  let latestSubagentChildToolCalls: SubagentChildToolCall[] = [];
  let taskSubagentConversationOutcome: TaskSubagentConversationOutcome | undefined;
  for await (const taskSubagentConversationProgress of streamTaskSubagentConversationProgress({
    conversationTurnProvider: input.conversationTurnProvider,
    taskToolCallRequest: input.taskToolCallRequest,
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    abortSignal: input.abortSignal,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  })) {
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
    toolCallId: input.toolCallId,
    toolResultText: taskSubagentConversationOutcome.toolResultText,
    diagnosticLogger: input.diagnosticLogger,
    toolResultKind: "failed",
  });
}

async function* streamTaskSubagentConversationProgress(input: {
  conversationTurnProvider: ConversationTurnProvider;
  taskToolCallRequest: TaskToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<TaskSubagentConversationProgress> {
  const subagentConversationStartedAtMs = Date.now();
  const subagentPromptText = buildTaskSubagentPromptText(input.taskToolCallRequest);
  const subagentConversationHistory = new InMemoryConversationHistory();
  const subagentConversationSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory: subagentConversationHistory,
    userPromptText: subagentPromptText,
    assistantOperatingMode: "understand",
    diagnosticLogger: input.diagnosticLogger,
  });
  const subagentToolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationHistory: subagentConversationHistory,
    diagnosticLogger: input.diagnosticLogger,
  });
  let subagentAssistantMessageText = "";
  const subagentChildToolCallsById = new Map<string, SubagentChildToolCall>();
  const orderedSubagentChildToolCallIds: string[] = [];

  try {
    subagentConversationSessionRecorder.appendAcceptedUserPromptSessionEntry(subagentPromptText);
    const subagentDefinition = resolveBuiltInSubagentDefinition(input.taskToolCallRequest.subagentName);
    const subagentProviderConversationTurn = input.conversationTurnProvider.startConversationTurn({
      systemPromptText: buildBuliExplorerSystemPrompt({
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionSnapshots: toProjectInstructionSnapshots(input.projectInstructionTracker.listProjectInstructionFiles()),
      }),
      conversationSessionEntries: subagentConversationHistory.listConversationSessionEntries(),
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      availableToolNames: subagentDefinition.availableToolNames,
      availablePresentationFunctionNames: [],
      abortSignal: input.abortSignal,
    });

    for await (const providerStreamEvent of subagentProviderConversationTurn.streamProviderEvents()) {
      input.throwIfConversationTurnInterrupted();

      if (providerStreamEvent.type === "text_chunk") {
        subagentAssistantMessageText += providerStreamEvent.text;
        continue;
      }

      if (providerStreamEvent.type === "tool_call_requested" || providerStreamEvent.type === "tool_calls_requested") {
        for await (const subagentChildToolCall of streamTaskSubagentChildToolCallActivity({
          requestedToolCalls: listRequestedToolCallsFromProviderStreamEvent(providerStreamEvent),
          subagentProviderConversationTurn,
          subagentConversationHistory,
          subagentToolResultSessionRecorder,
          workspaceRootPath: input.workspaceRootPath,
          projectInstructionTracker: input.projectInstructionTracker,
          abortSignal: input.abortSignal,
          throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
          diagnosticLogger: input.diagnosticLogger,
        })) {
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
        continue;
      }

      if (providerStreamEvent.type === "completed") {
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
              durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
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
              subagentResultSummary,
            }),
            durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
          },
        };
        return;
      }

      if (providerStreamEvent.type === "incomplete") {
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
            durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
          }),
        };
        return;
      }
    }

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
        durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
      }),
    };
    return;
  } catch (error) {
    if (input.abortSignal.aborted) {
      throw error;
    }

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
        durationMilliseconds: Date.now() - subagentConversationStartedAtMs,
      }),
    };
    return;
  }
}

async function* streamTaskSubagentChildToolCallActivity(input: {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
  subagentProviderConversationTurn: ProviderConversationTurn;
  subagentConversationHistory: InMemoryConversationHistory;
  subagentToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<SubagentChildToolCall> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Subagent cannot execute an empty child tool-call batch.");
  }

  for (const requestedToolCall of input.requestedToolCalls) {
    input.subagentConversationHistory.appendConversationSessionEntry({
      entryKind: "tool_call",
      toolCallId: requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCall.toolCallRequest,
    });
  }

  if (input.requestedToolCalls.length > 1 && areAllSubagentReadOnlyToolCalls(input.requestedToolCalls)) {
    for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
      assistantResponseMessageId: randomUUID(),
      providerConversationTurn: input.subagentProviderConversationTurn,
      requestedToolCalls: input.requestedToolCalls,
      workspaceRootPath: input.workspaceRootPath,
      projectInstructionTracker: input.projectInstructionTracker,
      toolResultSessionRecorder: input.subagentToolResultSessionRecorder,
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

  for (const requestedToolCall of input.requestedToolCalls) {
    if (isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest)) {
      yield* streamSingleTaskSubagentReadOnlyChildToolCall({
        requestedToolCall: {
          toolCallId: requestedToolCall.toolCallId,
          toolCallRequest: requestedToolCall.toolCallRequest,
        },
        subagentProviderConversationTurn: input.subagentProviderConversationTurn,
        subagentToolResultSessionRecorder: input.subagentToolResultSessionRecorder,
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionTracker: input.projectInstructionTracker,
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

async function* streamSingleTaskSubagentReadOnlyChildToolCall(input: {
  requestedToolCall: TaskSubagentReadOnlyRequestedToolCall;
  subagentProviderConversationTurn: ProviderConversationTurn;
  subagentToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<SubagentChildToolCall> {
  for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall({
    assistantResponseMessageId: randomUUID(),
    providerConversationTurn: input.subagentProviderConversationTurn,
    toolCallId: input.requestedToolCall.toolCallId,
    toolCallRequest: input.requestedToolCall.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.subagentToolResultSessionRecorder,
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
  subagentResultSummary?: string;
}): ToolCallTaskDetail {
  return {
    ...input.startedToolCallDetail,
    ...(input.subagentChildToolCalls.length > 0
      ? { subagentChildToolCalls: [...input.subagentChildToolCalls] }
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
    toolCallDetail.toolName === "bash" ||
    toolCallDetail.toolName === "edit" ||
    toolCallDetail.toolName === "write"
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
  return input.orderedSubagentChildToolCallIds.flatMap((subagentChildToolCallId) => {
    const subagentChildToolCall = input.subagentChildToolCallsById.get(subagentChildToolCallId);
    return subagentChildToolCall ? [subagentChildToolCall] : [];
  });
}

function buildTaskSubagentPromptText(taskToolCallRequest: TaskToolCallRequest): string {
  return [
    `Subagent: ${taskToolCallRequest.subagentName}`,
    `Task description: ${taskToolCallRequest.subagentDescription}`,
    "",
    "Detailed task instructions:",
    taskToolCallRequest.subagentPrompt,
    "",
    "Return a concise report for the parent assistant. Include important file paths, function names, and line references when they matter.",
  ].join("\n");
}

function buildTaskSubagentCompletedToolResultText(input: {
  taskToolCallRequest: TaskToolCallRequest;
  subagentResultSummary: string;
}): string {
  return [
    "<task_result>",
    `<subagent>${escapeModelFacingXmlText(input.taskToolCallRequest.subagentName)}</subagent>`,
    `<description>${escapeModelFacingXmlText(input.taskToolCallRequest.subagentDescription)}</description>`,
    "<summary>",
    escapeModelFacingXmlText(input.subagentResultSummary),
    "</summary>",
    "</task_result>",
  ].join("\n");
}

function createFailedTaskSubagentConversationOutcome(input: {
  taskToolCallRequest: TaskToolCallRequest;
  failureExplanation: string;
  subagentResultSummary?: string;
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
      "<failure>",
      escapeModelFacingXmlText(input.failureExplanation),
      "</failure>",
      ...(input.subagentResultSummary && input.subagentResultSummary.length > 0
        ? ["<partial_summary>", escapeModelFacingXmlText(input.subagentResultSummary), "</partial_summary>"]
        : []),
      "</task_result>",
    ].join("\n"),
    durationMilliseconds: input.durationMilliseconds,
    failureExplanation: input.failureExplanation,
  };
}

function buildSubagentDisallowedToolDenialText(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "task") {
    return NESTED_SUBAGENT_DENIAL_TEXT;
  }

  return `Subagent is read-only and cannot use ${toolCallRequest.toolName}. Use read, glob, or grep instead.`;
}
