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
import { RuntimeReadOnlyToolCallConcurrencyLimiter } from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
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
  readOnlyToolCallConcurrencyLimiter?: RuntimeReadOnlyToolCallConcurrencyLimiter;
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

type FulfilledAutoApprovedReadOnlyToolCallExecution = {
  executionResultKind: "fulfilled";
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  toolCallOutcome: ToolCallOutcome;
};

type RejectedAutoApprovedReadOnlyToolCallExecution = {
  executionResultKind: "rejected";
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  error: unknown;
};

type SettledAutoApprovedReadOnlyToolCallExecution =
  | FulfilledAutoApprovedReadOnlyToolCallExecution
  | RejectedAutoApprovedReadOnlyToolCallExecution;

type SubmittedAutoApprovedReadOnlyToolResultKind = "completed" | "failed";

type RecordedAutoApprovedReadOnlyToolCallOutcome = {
  assistantResponseEvent: AssistantResponseEvent;
  providerToolResult: {
    toolCallId: string;
    toolResultText: string;
    toolResultKind: SubmittedAutoApprovedReadOnlyToolResultKind;
  };
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

  const readOnlyToolCallConcurrencyLimiter = input.readOnlyToolCallConcurrencyLimiter ?? new RuntimeReadOnlyToolCallConcurrencyLimiter();

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
  const activeToolCallExecutionPromisesByPartId = new Map(
    pendingToolCallExecutions.map((pendingToolCallExecution) => [
      pendingToolCallExecution.toolCallPartId,
      runPendingAutoApprovedReadOnlyToolCallExecution({
        pendingToolCallExecution,
        readOnlyToolCallConcurrencyLimiter,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
    ]),
  );

  while (activeToolCallExecutionPromisesByPartId.size > 0) {
    input.throwIfConversationTurnInterrupted();
    const settledToolCallExecution = await Promise.race(activeToolCallExecutionPromisesByPartId.values());
    if (!activeToolCallExecutionPromisesByPartId.delete(settledToolCallExecution.pendingToolCallExecution.toolCallPartId)) {
      throw new Error(
        `Received a completed read-only tool-call execution for inactive part ${settledToolCallExecution.pendingToolCallExecution.toolCallPartId}.`,
      );
    }
    input.throwIfConversationTurnInterrupted();

    if (settledToolCallExecution.executionResultKind === "rejected") {
      throw settledToolCallExecution.error;
    }

    const recordedToolCallOutcome = recordAutoApprovedReadOnlyToolCallOutcome({
      assistantResponseMessageId: input.assistantResponseMessageId,
      pendingToolCallExecution: settledToolCallExecution.pendingToolCallExecution,
      toolCallOutcome: settledToolCallExecution.toolCallOutcome,
      toolResultSessionRecorder: input.toolResultSessionRecorder,
      diagnosticLogger: input.diagnosticLogger,
    });
    yield recordedToolCallOutcome.assistantResponseEvent;
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: recordedToolCallOutcome.providerToolResult.toolCallId,
      toolResultText: recordedToolCallOutcome.providerToolResult.toolResultText,
      toolResultKind: recordedToolCallOutcome.providerToolResult.toolResultKind,
      diagnosticLogger: input.diagnosticLogger,
    });
  }
}

async function runPendingAutoApprovedReadOnlyToolCallExecution(input: {
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
}): Promise<SettledAutoApprovedReadOnlyToolCallExecution> {
  try {
    return {
      executionResultKind: "fulfilled",
      pendingToolCallExecution: input.pendingToolCallExecution,
      toolCallOutcome: await input.readOnlyToolCallConcurrencyLimiter.run(() =>
        runAutoApprovedReadOnlyToolCall({
          toolCallRequest: input.pendingToolCallExecution.toolCallRequest,
          workspaceRootPath: input.workspaceRootPath,
          ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
          abortSignal: input.abortSignal,
        })
      ),
    };
  } catch (error) {
    return {
      executionResultKind: "rejected",
      pendingToolCallExecution: input.pendingToolCallExecution,
      error,
    };
  }
}

function recordAutoApprovedReadOnlyToolCallOutcome(input: {
  assistantResponseMessageId: string;
  pendingToolCallExecution: PendingAutoApprovedReadOnlyToolCallExecution;
  toolCallOutcome: ToolCallOutcome;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): RecordedAutoApprovedReadOnlyToolCallOutcome {
  if (input.toolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.pendingToolCallExecution.toolCallId,
      toolCallDetail: input.toolCallOutcome.toolCallDetail,
      toolResultText: input.toolCallOutcome.toolResultText,
    });
    return {
      assistantResponseEvent: logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
        type: "assistant_message_part_updated",
        messageId: input.assistantResponseMessageId,
        part: AssistantToolCallConversationMessagePartSchema.parse({
          id: input.pendingToolCallExecution.toolCallPartId,
          partKind: "assistant_tool_call",
          toolCallId: input.pendingToolCallExecution.toolCallId,
          toolCallStatus: "completed",
          toolCallStartedAtMs: input.pendingToolCallExecution.toolCallStartedAtMs,
          toolCallDetail: input.toolCallOutcome.toolCallDetail,
          durationMs: input.toolCallOutcome.durationMilliseconds,
        }),
      })),
      providerToolResult: {
        toolCallId: input.pendingToolCallExecution.toolCallId,
        toolResultText: input.toolCallOutcome.toolResultText,
        toolResultKind: "completed",
      },
    };
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.pendingToolCallExecution.toolCallId,
    toolCallDetail: input.toolCallOutcome.toolCallDetail,
    toolResultText: input.toolCallOutcome.toolResultText,
    failureExplanation: input.toolCallOutcome.failureExplanation,
  });
  return {
    assistantResponseEvent: logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
      type: "assistant_message_part_updated",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: input.pendingToolCallExecution.toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.pendingToolCallExecution.toolCallId,
        toolCallStatus: "failed",
        toolCallStartedAtMs: input.pendingToolCallExecution.toolCallStartedAtMs,
        toolCallDetail: input.toolCallOutcome.toolCallDetail,
        errorText: input.toolCallOutcome.failureExplanation,
        durationMs: input.toolCallOutcome.durationMilliseconds,
      }),
    })),
    providerToolResult: {
      toolCallId: input.pendingToolCallExecution.toolCallId,
      toolResultText: input.toolCallOutcome.toolResultText,
      toolResultKind: "failed",
    },
  };
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
