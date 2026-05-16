import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isWorkspaceInspectionToolCallRequest,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type ToolCallRequest,
  type ToolCallRequestByName,
  type WorkspaceInspectionToolCallRequest,
  type WorkspaceInspectionToolRequestName,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import type { ProjectInstructionTracker } from "./projectInstructions.ts";
import { logEngineDiagnosticEvent, summarizeAssistantResponseEventForDiagnostics } from "./runtimeDiagnostics.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import { runGlobToolCall } from "./tools/globTool.ts";
import { runGrepToolCall } from "./tools/grepTool.ts";
import { runReadToolCall } from "./tools/readTool.ts";
import type { ToolCallOutcome } from "./tools/toolCallOutcome.ts";

export type AutoApprovedReadOnlyToolCallRequest = WorkspaceInspectionToolCallRequest;

type AutoApprovedReadOnlyToolName = WorkspaceInspectionToolRequestName;
type AutoApprovedReadOnlyToolCallRequestByName<ToolName extends AutoApprovedReadOnlyToolName> = ToolCallRequestByName<ToolName>;

type AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName extends AutoApprovedReadOnlyToolName> = {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequestByName<ToolName>;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
};

type AutoApprovedReadOnlyToolCallExecutor<ToolName extends AutoApprovedReadOnlyToolName> = {
  runToolCall(input: AutoApprovedReadOnlyToolCallExecutorRunInput<ToolName>): Promise<ToolCallOutcome>;
};

const autoApprovedReadOnlyToolCallExecutorByName: {
  readonly [ToolName in AutoApprovedReadOnlyToolName]: AutoApprovedReadOnlyToolCallExecutor<ToolName>;
} = {
  read: {
    runToolCall: (input) =>
      runReadToolCall({
        readToolCallRequest: input.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
  },
  glob: {
    runToolCall: (input) =>
      runGlobToolCall({
        globToolCallRequest: input.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        abortSignal: input.abortSignal,
      }),
  },
  grep: {
    runToolCall: (input) =>
      runGrepToolCall({
        grepToolCallRequest: input.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        abortSignal: input.abortSignal,
      }),
  },
};

export type StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export type AutoApprovedReadOnlyRequestedToolCall = {
  toolCallId: string;
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
};

export type StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallsInput = Omit<
  StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput,
  "toolCallId" | "toolCallRequest"
> & {
  requestedToolCalls: readonly AutoApprovedReadOnlyRequestedToolCall[];
};

type PendingAutoApprovedReadOnlyToolCallExecution = AutoApprovedReadOnlyRequestedToolCall & {
  toolCallPartId: string;
  toolCallStartedAtMs: number;
  startedToolCallDetail: ReturnType<typeof createStartedToolCallDetailFromRequest>;
};

export async function* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCall(
  input: StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const { toolCallId, toolCallRequest, ...sharedInput } = input;

  yield* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls({
    ...sharedInput,
    requestedToolCalls: [{ toolCallId, toolCallRequest }],
  });
}

export async function* streamAssistantResponseEventsForAutoApprovedReadOnlyToolCalls(
  input: StreamAssistantResponseEventsForAutoApprovedReadOnlyToolCallsInput,
): AsyncGenerator<AssistantResponseEvent> {
  if (input.requestedToolCalls.length === 0) {
    throw new Error("Cannot execute an empty read-only tool-call batch.");
  }

  const pendingToolCallExecutions = input.requestedToolCalls.map((requestedToolCall): PendingAutoApprovedReadOnlyToolCallExecution => ({
    ...requestedToolCall,
    toolCallPartId: randomUUID(),
    toolCallStartedAtMs: Date.now(),
    startedToolCallDetail: createStartedToolCallDetailFromRequest(requestedToolCall.toolCallRequest),
  }));

  for (const pendingToolCallExecution of pendingToolCallExecutions) {
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: pendingToolCallExecution.toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: pendingToolCallExecution.toolCallId,
        toolCallStatus: "running",
        toolCallStartedAtMs: pendingToolCallExecution.toolCallStartedAtMs,
        toolCallDetail: pendingToolCallExecution.startedToolCallDetail,
      }),
    }));
  }

  input.throwIfConversationTurnInterrupted();
  const toolCallOutcomes = await Promise.all(
    pendingToolCallExecutions.map((pendingToolCallExecution) =>
      runAutoApprovedReadOnlyToolCall({
        toolCallRequest: pendingToolCallExecution.toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      })
    ),
  );
  input.throwIfConversationTurnInterrupted();

  for (const [toolCallOutcomeIndex, toolCallOutcome] of toolCallOutcomes.entries()) {
    const pendingToolCallExecution = pendingToolCallExecutions[toolCallOutcomeIndex];
    if (!pendingToolCallExecution) {
      throw new Error(`Missing read-only tool-call execution state at index ${toolCallOutcomeIndex}.`);
    }

    if (toolCallOutcome.outcomeKind === "completed") {
      input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
        toolCallId: pendingToolCallExecution.toolCallId,
        toolCallDetail: toolCallOutcome.toolCallDetail,
        toolResultText: toolCallOutcome.toolResultText,
      });
      yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: pendingToolCallExecution.toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: pendingToolCallExecution.toolCallId,
          toolCallStatus: "completed",
          toolCallStartedAtMs: pendingToolCallExecution.toolCallStartedAtMs,
          toolCallDetail: toolCallOutcome.toolCallDetail,
          durationMs: toolCallOutcome.durationMilliseconds,
        }),
      }));
      logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.tool_result_submitted", {
        toolCallId: pendingToolCallExecution.toolCallId,
        toolResultKind: "completed",
        toolResultTextLength: toolCallOutcome.toolResultText.length,
      });
      await input.providerConversationTurn.submitToolResult({
        toolCallId: pendingToolCallExecution.toolCallId,
        toolResultText: toolCallOutcome.toolResultText,
      });
      continue;
    }

    input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
      toolCallId: pendingToolCallExecution.toolCallId,
      toolCallDetail: toolCallOutcome.toolCallDetail,
      toolResultText: toolCallOutcome.toolResultText,
      failureExplanation: toolCallOutcome.failureExplanation,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: pendingToolCallExecution.toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: pendingToolCallExecution.toolCallId,
        toolCallStatus: "failed",
        toolCallStartedAtMs: pendingToolCallExecution.toolCallStartedAtMs,
        toolCallDetail: toolCallOutcome.toolCallDetail,
        errorText: toolCallOutcome.failureExplanation,
        durationMs: toolCallOutcome.durationMilliseconds,
      }),
    }));
    logEngineDiagnosticEvent(input.diagnosticLogger, "provider_turn.tool_result_submitted", {
      toolCallId: pendingToolCallExecution.toolCallId,
      toolResultKind: "failed",
      toolResultTextLength: toolCallOutcome.toolResultText.length,
    });
    await input.providerConversationTurn.submitToolResult({
      toolCallId: pendingToolCallExecution.toolCallId,
      toolResultText: toolCallOutcome.toolResultText,
    });
  }
}

export function isAutoApprovedReadOnlyToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is AutoApprovedReadOnlyToolCallRequest {
  return isWorkspaceInspectionToolCallRequest(toolCallRequest);
}

function runAutoApprovedReadOnlyToolCall(input: {
  toolCallRequest: AutoApprovedReadOnlyToolCallRequest;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.toolCallRequest.toolName === "read") {
    return autoApprovedReadOnlyToolCallExecutorByName.read.runToolCall({
      ...input,
      toolCallRequest: input.toolCallRequest,
    });
  }
  if (input.toolCallRequest.toolName === "glob") {
    return autoApprovedReadOnlyToolCallExecutorByName.glob.runToolCall({
      ...input,
      toolCallRequest: input.toolCallRequest,
    });
  }
  if (input.toolCallRequest.toolName === "grep") {
    return autoApprovedReadOnlyToolCallExecutorByName.grep.runToolCall({
      ...input,
      toolCallRequest: input.toolCallRequest,
    });
  }

  return assertUnhandledReadOnlyToolCallRequest(input.toolCallRequest);
}

function assertUnhandledReadOnlyToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled read-only tool call request: ${JSON.stringify(toolCallRequest)}`);
}

function logAssistantResponseEventEmitted(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  assistantResponseEvent: AssistantResponseEvent,
): AssistantResponseEvent {
  logEngineDiagnosticEvent(diagnosticLogger, "assistant_response_event.emitted", {
    eventType: assistantResponseEvent.type,
    ...summarizeAssistantResponseEventForDiagnostics(assistantResponseEvent),
  });
  return assistantResponseEvent;
}
