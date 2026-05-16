import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES,
  createStartedToolCallDetailFromRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantResponseEvent,
  type AssistantToolCallConversationMessagePart,
  type BuliDiagnosticLogger,
  type ExplorerChildToolCall,
  type ExplorerChildToolCallDetail,
  type ExplorerChildToolCallStatus,
  type ExploreToolCallRequest,
  type ProviderStreamEvent,
  type ProviderRequestedToolCall,
  type ReasoningEffort,
  type ToolCallDetail,
  type ToolCallExploreDetail,
  type ToolCallRequest,
  type WorkspaceInspectionToolCallRequest,
} from "@buli/contracts";
import { InMemoryConversationHistory } from "./conversationHistory.ts";
import type { ConversationTurnProvider, ProviderConversationTurn } from "./provider.ts";
import { toProjectInstructionSnapshots, type ProjectInstructionTracker } from "./projectInstructions.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import {
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall,
  streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls,
} from "./runtimeReadOnlyToolCallExecution.ts";
import { RuntimeConversationTurnSessionRecorder } from "./runtimeConversationTurnSessionRecorder.ts";
import { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { buildBuliExplorerSystemPrompt } from "./systemPrompt.ts";
import { escapeModelFacingXmlText } from "./modelFacingXmlEscaping.ts";

const EXPLORER_AVAILABLE_TOOL_NAMES = WORKSPACE_INSPECTION_TOOL_REQUEST_NAMES;
const NESTED_EXPLORER_DENIAL_TEXT = "Explorer cannot spawn another Explorer. Continue with read, glob, and grep instead.";

type ExplorerConversationOutcome = {
  outcomeKind: "completed" | "failed";
  explorationResultSummary: string;
  toolResultText: string;
  durationMilliseconds: number;
  failureExplanation?: string;
};

type ExplorerConversationProgress =
  | {
    progressKind: "explorer_child_tool_calls_changed";
    explorationChildToolCalls: ExplorerChildToolCall[];
  }
  | {
    progressKind: "explorer_conversation_finished";
    explorerConversationOutcome: ExplorerConversationOutcome;
  };

type ExplorerReadOnlyRequestedToolCall = {
  toolCallId: string;
  toolCallRequest: WorkspaceInspectionToolCallRequest;
};

export type StreamAssistantResponseEventsForExploreToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnProvider: ConversationTurnProvider;
  toolCallId: string;
  exploreToolCallRequest: ExploreToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  canSpawnExplorer: boolean;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForExploreToolCall(
  input: StreamAssistantResponseEventsForExploreToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.exploreToolCallRequest);

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

  if (!input.canSpawnExplorer) {
    const deniedToolCallDetail = startedToolCallDetail;
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: deniedToolCallDetail,
      toolResultText: NESTED_EXPLORER_DENIAL_TEXT,
      denialExplanation: NESTED_EXPLORER_DENIAL_TEXT,
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
        toolCallDetail: deniedToolCallDetail,
        denialText: NESTED_EXPLORER_DENIAL_TEXT,
        durationMs: Date.now() - toolCallStartedAtMs,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: NESTED_EXPLORER_DENIAL_TEXT,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "denied",
    });
    return;
  }

  input.throwIfConversationTurnInterrupted();
  let latestExplorationChildToolCalls: ExplorerChildToolCall[] = [];
  let explorerConversationOutcome: ExplorerConversationOutcome | undefined;
  for await (const explorerConversationProgress of streamExplorerConversationProgress({
    conversationTurnProvider: input.conversationTurnProvider,
    exploreToolCallRequest: input.exploreToolCallRequest,
    selectedModelId: input.selectedModelId,
    ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    abortSignal: input.abortSignal,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  })) {
    input.throwIfConversationTurnInterrupted();
    if (explorerConversationProgress.progressKind === "explorer_child_tool_calls_changed") {
      latestExplorationChildToolCalls = explorerConversationProgress.explorationChildToolCalls;
      yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.toolCallId,
          toolCallStatus: "running",
          toolCallStartedAtMs,
          toolCallDetail: buildExplorerToolCallDetail({
            startedToolCallDetail,
            explorationChildToolCalls: latestExplorationChildToolCalls,
          }),
        }),
      }));
      continue;
    }

    explorerConversationOutcome = explorerConversationProgress.explorerConversationOutcome;
  }
  input.throwIfConversationTurnInterrupted();
  if (!explorerConversationOutcome) {
    throw new Error("Explorer conversation stream ended before returning an outcome.");
  }

  const completedToolCallDetail = buildExplorerToolCallDetail({
    startedToolCallDetail,
    explorationChildToolCalls: latestExplorationChildToolCalls,
    explorationResultSummary: explorerConversationOutcome.explorationResultSummary,
  });

  if (explorerConversationOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: completedToolCallDetail,
      toolResultText: explorerConversationOutcome.toolResultText,
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
        durationMs: explorerConversationOutcome.durationMilliseconds,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: explorerConversationOutcome.toolResultText,
      diagnosticLogger: input.diagnosticLogger,
      toolResultKind: "completed",
    });
    return;
  }

  const failureExplanation = explorerConversationOutcome.failureExplanation ?? "Explorer failed before returning a result.";
  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: completedToolCallDetail,
    toolResultText: explorerConversationOutcome.toolResultText,
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
      durationMs: explorerConversationOutcome.durationMilliseconds,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    toolResultText: explorerConversationOutcome.toolResultText,
    diagnosticLogger: input.diagnosticLogger,
    toolResultKind: "failed",
  });
}

async function* streamExplorerConversationProgress(input: {
  conversationTurnProvider: ConversationTurnProvider;
  exploreToolCallRequest: ExploreToolCallRequest;
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<ExplorerConversationProgress> {
  const explorerConversationStartedAtMs = Date.now();
  const explorerPromptText = buildExplorerPromptText(input.exploreToolCallRequest);
  const explorerConversationHistory = new InMemoryConversationHistory();
  const explorerConversationSessionRecorder = new RuntimeConversationTurnSessionRecorder({
    conversationHistory: explorerConversationHistory,
    userPromptText: explorerPromptText,
    assistantOperatingMode: "understand",
    diagnosticLogger: input.diagnosticLogger,
  });
  const explorerToolResultSessionRecorder = new RuntimeToolResultSessionRecorder({
    conversationHistory: explorerConversationHistory,
    diagnosticLogger: input.diagnosticLogger,
  });
  let explorerAssistantMessageText = "";
  const explorerChildToolCallsById = new Map<string, ExplorerChildToolCall>();
  const orderedExplorerChildToolCallIds: string[] = [];

  try {
    explorerConversationSessionRecorder.appendAcceptedUserPromptSessionEntry(explorerPromptText);
    const explorerProviderConversationTurn = input.conversationTurnProvider.startConversationTurn({
      systemPromptText: buildBuliExplorerSystemPrompt({
        workspaceRootPath: input.workspaceRootPath,
        projectInstructionSnapshots: toProjectInstructionSnapshots(input.projectInstructionTracker.listProjectInstructionFiles()),
      }),
      conversationSessionEntries: explorerConversationHistory.listConversationSessionEntries(),
      selectedModelId: input.selectedModelId,
      ...(input.selectedReasoningEffort ? { selectedReasoningEffort: input.selectedReasoningEffort } : {}),
      availableToolNames: EXPLORER_AVAILABLE_TOOL_NAMES,
      abortSignal: input.abortSignal,
    });

    for await (const providerStreamEvent of explorerProviderConversationTurn.streamProviderEvents()) {
      input.throwIfConversationTurnInterrupted();

      if (providerStreamEvent.type === "text_chunk") {
        explorerAssistantMessageText += providerStreamEvent.text;
        continue;
      }

      if (providerStreamEvent.type === "tool_call_requested" || providerStreamEvent.type === "tool_calls_requested") {
        for await (const explorerChildToolCall of streamExplorerChildToolCallsActivity({
          requestedToolCalls: listRequestedToolCallsFromProviderStreamEvent(providerStreamEvent),
          explorerProviderConversationTurn,
          explorerConversationHistory,
          explorerToolResultSessionRecorder,
          workspaceRootPath: input.workspaceRootPath,
          projectInstructionTracker: input.projectInstructionTracker,
          abortSignal: input.abortSignal,
          throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
          diagnosticLogger: input.diagnosticLogger,
        })) {
          upsertExplorerChildToolCall({
            explorerChildToolCallsById,
            orderedExplorerChildToolCallIds,
            explorerChildToolCall,
          });
          yield {
            progressKind: "explorer_child_tool_calls_changed",
            explorationChildToolCalls: collectOrderedExplorerChildToolCalls({
              explorerChildToolCallsById,
              orderedExplorerChildToolCallIds,
            }),
          };
        }
        continue;
      }

      if (providerStreamEvent.type === "completed") {
        const explorationResultSummary = explorerAssistantMessageText.trim();
        if (explorationResultSummary.length === 0) {
          const failureExplanation = "Explorer completed without returning a summary.";
          explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
            entryKind: "assistant_message",
            assistantMessageStatus: "failed",
            assistantMessageText: explorerAssistantMessageText,
            failureExplanation,
          });
          yield {
            progressKind: "explorer_conversation_finished",
            explorerConversationOutcome: createFailedExplorerConversationOutcome({
              exploreToolCallRequest: input.exploreToolCallRequest,
              failureExplanation,
              durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
            }),
          };
          return;
        }

        explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "completed",
          assistantMessageText: explorationResultSummary,
        });
        yield {
          progressKind: "explorer_conversation_finished",
          explorerConversationOutcome: {
            outcomeKind: "completed",
            explorationResultSummary,
            toolResultText: buildExplorerCompletedToolResultText({
              exploreToolCallRequest: input.exploreToolCallRequest,
              explorationResultSummary,
            }),
            durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
          },
        };
        return;
      }

      if (providerStreamEvent.type === "incomplete") {
        const failureExplanation = `Explorer stopped before completion: ${providerStreamEvent.incompleteReason}`;
        explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
          entryKind: "assistant_message",
          assistantMessageStatus: "incomplete",
          assistantMessageText: explorerAssistantMessageText,
          incompleteReason: providerStreamEvent.incompleteReason,
        });
        yield {
          progressKind: "explorer_conversation_finished",
          explorerConversationOutcome: createFailedExplorerConversationOutcome({
            exploreToolCallRequest: input.exploreToolCallRequest,
            failureExplanation,
            explorationResultSummary: explorerAssistantMessageText.trim(),
            durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
          }),
        };
        return;
      }
    }

    const failureExplanation = "Explorer provider stream ended before completion.";
    explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: explorerAssistantMessageText,
      failureExplanation,
    });
    yield {
      progressKind: "explorer_conversation_finished",
      explorerConversationOutcome: createFailedExplorerConversationOutcome({
        exploreToolCallRequest: input.exploreToolCallRequest,
        failureExplanation,
        explorationResultSummary: explorerAssistantMessageText.trim(),
        durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
      }),
    };
    return;
  } catch (error) {
    if (input.abortSignal.aborted) {
      throw error;
    }

    const failureExplanation = error instanceof Error ? error.message : String(error);
    if (!explorerConversationSessionRecorder.hasAppendedTerminalAssistantMessageSessionEntry()) {
      explorerConversationSessionRecorder.appendTerminalAssistantMessageSessionEntry({
        entryKind: "assistant_message",
        assistantMessageStatus: "failed",
        assistantMessageText: explorerAssistantMessageText,
        failureExplanation,
      });
    }
    yield {
      progressKind: "explorer_conversation_finished",
      explorerConversationOutcome: createFailedExplorerConversationOutcome({
        exploreToolCallRequest: input.exploreToolCallRequest,
        failureExplanation,
        explorationResultSummary: explorerAssistantMessageText.trim(),
        durationMilliseconds: Date.now() - explorerConversationStartedAtMs,
      }),
    };
    return;
  }
}

async function* streamExplorerChildToolCallsActivity(input: {
  requestedToolCalls: readonly ProviderRequestedToolCall[];
  explorerProviderConversationTurn: ProviderConversationTurn;
  explorerConversationHistory: InMemoryConversationHistory;
  explorerToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<ExplorerChildToolCall> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Explorer cannot execute an empty child tool-call batch.");
  }

  for (const requestedToolCall of input.requestedToolCalls) {
    input.explorerConversationHistory.appendConversationSessionEntry({
      entryKind: "tool_call",
      toolCallId: requestedToolCall.toolCallId,
      toolCallRequest: requestedToolCall.toolCallRequest,
    });
  }

  if (input.requestedToolCalls.length > 1 && areAllExplorerReadOnlyToolCalls(input.requestedToolCalls)) {
    for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
      assistantResponseMessageId: randomUUID(),
      providerConversationTurn: input.explorerProviderConversationTurn,
      requestedToolCalls: input.requestedToolCalls,
      workspaceRootPath: input.workspaceRootPath,
      projectInstructionTracker: input.projectInstructionTracker,
      toolResultSessionRecorder: input.explorerToolResultSessionRecorder,
      abortSignal: input.abortSignal,
      throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
      diagnosticLogger: input.diagnosticLogger,
    })) {
      input.throwIfConversationTurnInterrupted();
      const explorerChildToolCall = createExplorerChildToolCallFromAssistantResponseEvent(assistantResponseEvent);
      if (explorerChildToolCall) {
        yield explorerChildToolCall;
      }
    }
    return;
  }

  for (const requestedToolCall of input.requestedToolCalls) {
    if (isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest)) {
      yield* streamSingleExplorerReadOnlyChildToolCall({
        ...input,
        requestedToolCall: {
          toolCallId: requestedToolCall.toolCallId,
          toolCallRequest: requestedToolCall.toolCallRequest,
        },
      });
      continue;
    }

    const denialExplanation = buildExplorerDisallowedToolDenialText(requestedToolCall.toolCallRequest);
    input.explorerToolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: requestedToolCall.toolCallId,
      toolCallDetail: createStartedToolCallDetailFromRequest(requestedToolCall.toolCallRequest),
      toolResultText: denialExplanation,
      denialExplanation,
    });
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.explorerProviderConversationTurn,
      toolCallId: requestedToolCall.toolCallId,
      toolResultText: denialExplanation,
      toolResultKind: "denied",
      diagnosticLogger: input.diagnosticLogger,
    });
  }
}

async function* streamSingleExplorerReadOnlyChildToolCall(input: {
  requestedToolCall: ExplorerReadOnlyRequestedToolCall;
  explorerProviderConversationTurn: ProviderConversationTurn;
  explorerToolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  workspaceRootPath: string;
  projectInstructionTracker: ProjectInstructionTracker;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): AsyncGenerator<ExplorerChildToolCall> {
  for await (const assistantResponseEvent of streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall({
    assistantResponseMessageId: randomUUID(),
    providerConversationTurn: input.explorerProviderConversationTurn,
    toolCallId: input.requestedToolCall.toolCallId,
    toolCallRequest: input.requestedToolCall.toolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    projectInstructionTracker: input.projectInstructionTracker,
    toolResultSessionRecorder: input.explorerToolResultSessionRecorder,
    abortSignal: input.abortSignal,
    throwIfConversationTurnInterrupted: input.throwIfConversationTurnInterrupted,
    diagnosticLogger: input.diagnosticLogger,
  })) {
    input.throwIfConversationTurnInterrupted();
    const explorerChildToolCall = createExplorerChildToolCallFromAssistantResponseEvent(assistantResponseEvent);
    if (explorerChildToolCall) {
      yield explorerChildToolCall;
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

function areAllExplorerReadOnlyToolCalls(
  requestedToolCalls: readonly ProviderRequestedToolCall[],
): requestedToolCalls is readonly ExplorerReadOnlyRequestedToolCall[] {
  return requestedToolCalls.every((requestedToolCall) => isWorkspaceInspectionToolCallRequest(requestedToolCall.toolCallRequest));
}

function buildExplorerToolCallDetail(input: {
  startedToolCallDetail: ToolCallExploreDetail;
  explorationChildToolCalls: readonly ExplorerChildToolCall[];
  explorationResultSummary?: string;
}): ToolCallExploreDetail {
  return {
    ...input.startedToolCallDetail,
    ...(input.explorationChildToolCalls.length > 0
      ? { explorationChildToolCalls: [...input.explorationChildToolCalls] }
      : {}),
    ...(input.explorationResultSummary !== undefined
      ? { explorationResultSummary: input.explorationResultSummary }
      : {}),
  };
}

function createExplorerChildToolCallFromAssistantResponseEvent(
  assistantResponseEvent: AssistantResponseEvent,
): ExplorerChildToolCall | undefined {
  if (
    assistantResponseEvent.type !== "assistant_message_part_added" &&
    assistantResponseEvent.type !== "assistant_message_part_updated"
  ) {
    return undefined;
  }

  if (assistantResponseEvent.part.partKind !== "assistant_tool_call") {
    return undefined;
  }

  if (!isExplorerChildToolCallDetail(assistantResponseEvent.part.toolCallDetail)) {
    return undefined;
  }

  return createExplorerChildToolCallFromPart({
    explorerChildToolCallPart: assistantResponseEvent.part,
    explorerChildToolCallDetail: assistantResponseEvent.part.toolCallDetail,
  });
}

function createExplorerChildToolCallFromPart(input: {
  explorerChildToolCallPart: AssistantToolCallConversationMessagePart;
  explorerChildToolCallDetail: ExplorerChildToolCallDetail;
}): ExplorerChildToolCall {
  return {
    explorerChildToolCallId: input.explorerChildToolCallPart.toolCallId,
    explorerChildToolCallStatus: mapExplorerChildToolCallStatus(input.explorerChildToolCallPart.toolCallStatus),
    explorerChildToolCallStartedAtMs: input.explorerChildToolCallPart.toolCallStartedAtMs,
    explorerChildToolCallDetail: input.explorerChildToolCallDetail,
    ...(input.explorerChildToolCallPart.durationMs !== undefined
      ? { explorerChildToolCallDurationMs: input.explorerChildToolCallPart.durationMs }
      : {}),
    ...(input.explorerChildToolCallPart.errorText !== undefined
      ? { explorerChildToolCallErrorText: input.explorerChildToolCallPart.errorText }
      : {}),
    ...(input.explorerChildToolCallPart.denialText !== undefined
      ? { explorerChildToolCallDenialText: input.explorerChildToolCallPart.denialText }
      : {}),
  };
}

function mapExplorerChildToolCallStatus(
  toolCallStatus: AssistantToolCallConversationMessagePart["toolCallStatus"],
): ExplorerChildToolCallStatus {
  if (toolCallStatus === "pending_approval") {
    throw new Error("Explorer child tool calls cannot wait for approval.");
  }

  return toolCallStatus;
}

function isExplorerChildToolCallDetail(toolCallDetail: ToolCallDetail): toolCallDetail is ExplorerChildToolCallDetail {
  return toolCallDetail.toolName === "read" || toolCallDetail.toolName === "glob" || toolCallDetail.toolName === "grep";
}

function upsertExplorerChildToolCall(input: {
  explorerChildToolCallsById: Map<string, ExplorerChildToolCall>;
  orderedExplorerChildToolCallIds: string[];
  explorerChildToolCall: ExplorerChildToolCall;
}): void {
  if (!input.explorerChildToolCallsById.has(input.explorerChildToolCall.explorerChildToolCallId)) {
    input.orderedExplorerChildToolCallIds.push(input.explorerChildToolCall.explorerChildToolCallId);
  }

  input.explorerChildToolCallsById.set(input.explorerChildToolCall.explorerChildToolCallId, input.explorerChildToolCall);
}

function collectOrderedExplorerChildToolCalls(input: {
  explorerChildToolCallsById: Map<string, ExplorerChildToolCall>;
  orderedExplorerChildToolCallIds: readonly string[];
}): ExplorerChildToolCall[] {
  return input.orderedExplorerChildToolCallIds.flatMap((explorerChildToolCallId) => {
    const explorerChildToolCall = input.explorerChildToolCallsById.get(explorerChildToolCallId);
    return explorerChildToolCall ? [explorerChildToolCall] : [];
  });
}

function buildExplorerPromptText(exploreToolCallRequest: ExploreToolCallRequest): string {
  return [
    `Exploration description: ${exploreToolCallRequest.explorationDescription}`,
    "",
    "Detailed exploration instructions:",
    exploreToolCallRequest.explorationPrompt,
    "",
    "Return a concise report for the parent assistant. Include important file paths, function names, and line references when they matter.",
  ].join("\n");
}

function buildExplorerCompletedToolResultText(input: {
  exploreToolCallRequest: ExploreToolCallRequest;
  explorationResultSummary: string;
}): string {
  return [
    "<explorer_result>",
    `<description>${escapeModelFacingXmlText(input.exploreToolCallRequest.explorationDescription)}</description>`,
    "<summary>",
    escapeModelFacingXmlText(input.explorationResultSummary),
    "</summary>",
    "</explorer_result>",
  ].join("\n");
}

function createFailedExplorerConversationOutcome(input: {
  exploreToolCallRequest: ExploreToolCallRequest;
  failureExplanation: string;
  explorationResultSummary?: string;
  durationMilliseconds: number;
}): ExplorerConversationOutcome {
  const explorationResultSummary = input.explorationResultSummary && input.explorationResultSummary.length > 0
    ? input.explorationResultSummary
    : input.failureExplanation;
  return {
    outcomeKind: "failed",
    explorationResultSummary,
    toolResultText: [
      "<explorer_result>",
      `<description>${escapeModelFacingXmlText(input.exploreToolCallRequest.explorationDescription)}</description>`,
      "<failure>",
      escapeModelFacingXmlText(input.failureExplanation),
      "</failure>",
      ...(input.explorationResultSummary && input.explorationResultSummary.length > 0
        ? ["<partial_summary>", escapeModelFacingXmlText(input.explorationResultSummary), "</partial_summary>"]
        : []),
      "</explorer_result>",
    ].join("\n"),
    durationMilliseconds: input.durationMilliseconds,
    failureExplanation: input.failureExplanation,
  };
}

function buildExplorerDisallowedToolDenialText(toolCallRequest: ToolCallRequest): string {
  if (toolCallRequest.toolName === "explore") {
    return NESTED_EXPLORER_DENIAL_TEXT;
  }

  return `Explorer is read-only and cannot use ${toolCallRequest.toolName}. Use read, glob, or grep instead.`;
}
