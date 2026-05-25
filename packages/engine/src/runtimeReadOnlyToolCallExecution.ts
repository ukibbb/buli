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
import { runReadManyToolCall } from "./tools/readManyTool.ts";
import { runReadToolCall } from "./tools/readTool.ts";
import { runSearchManyToolCall } from "./tools/searchManyTool.ts";
import type { ToolCallOutcome } from "./tools/toolCallOutcome.ts";

export type AutoApprovedReadOnlyToolCallRequest = WorkspaceInspectionToolCallRequest;

type AutoApprovedReadOnlyToolName = WorkspaceInspectionToolRequestName;
type SingleReadOnlyToolName = Exclude<AutoApprovedReadOnlyToolName, "read_many" | "search_many">;
type SingleReadOnlyToolCallRequestByName<ToolName extends SingleReadOnlyToolName> = ToolCallRequestByName<ToolName>;

type SingleReadOnlyToolCallExecutorRunInput<ToolName extends SingleReadOnlyToolName> = {
  toolCallRequest: SingleReadOnlyToolCallRequestByName<ToolName>;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
};

type SingleReadOnlyToolCallExecutor<ToolName extends SingleReadOnlyToolName> = {
  runToolCall(input: SingleReadOnlyToolCallExecutorRunInput<ToolName>): Promise<ToolCallOutcome>;
};

const singleReadOnlyToolCallExecutorByName: {
  readonly [ToolName in SingleReadOnlyToolName]: SingleReadOnlyToolCallExecutor<ToolName>;
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

  const readOnlyToolCallConcurrencyLimiter = input.readOnlyToolCallConcurrencyLimiter ?? new RuntimeReadOnlyToolCallConcurrencyLimiter({
    diagnosticLogger: input.diagnosticLogger,
  });

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
      toolCallOutcome: await runAutoApprovedReadOnlyToolCall({
        toolCallRequest: input.pendingToolCallExecution.toolCallRequest,
        toolCallId: input.pendingToolCallExecution.toolCallId,
        readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
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
  toolCallId: string;
  readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
  workspaceRootPath: string;
  projectInstructionTracker?: ProjectInstructionTracker;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.toolCallRequest.toolName === "read_many") {
    return runReadManyToolCall({
      readManyToolCallRequest: input.toolCallRequest,
      parentToolCallId: input.toolCallId,
      workspaceRootPath: input.workspaceRootPath,
      readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
      ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
      abortSignal: input.abortSignal,
    });
  }

  if (input.toolCallRequest.toolName === "search_many") {
    return runSearchManyToolCall({
      searchManyToolCallRequest: input.toolCallRequest,
      parentToolCallId: input.toolCallId,
      workspaceRootPath: input.workspaceRootPath,
      readOnlyToolCallConcurrencyLimiter: input.readOnlyToolCallConcurrencyLimiter,
      abortSignal: input.abortSignal,
    });
  }

  if (input.toolCallRequest.toolName === "read") {
    return runSingleAutoApprovedReadOnlyToolCall(input, "read", singleReadOnlyToolCallExecutorByName.read, input.toolCallRequest);
  }
  if (input.toolCallRequest.toolName === "glob") {
    return runSingleAutoApprovedReadOnlyToolCall(input, "glob", singleReadOnlyToolCallExecutorByName.glob, input.toolCallRequest);
  }
  if (input.toolCallRequest.toolName === "grep") {
    return runSingleAutoApprovedReadOnlyToolCall(input, "grep", singleReadOnlyToolCallExecutorByName.grep, input.toolCallRequest);
  }

  return assertUnhandledReadOnlyToolCallRequest(input.toolCallRequest);
}

function runSingleAutoApprovedReadOnlyToolCall<ToolName extends SingleReadOnlyToolName>(
  input: {
    toolCallId: string;
    readOnlyToolCallConcurrencyLimiter: RuntimeReadOnlyToolCallConcurrencyLimiter;
    workspaceRootPath: string;
    projectInstructionTracker?: ProjectInstructionTracker;
    abortSignal: AbortSignal;
  },
  toolName: ToolName,
  toolCallExecutor: SingleReadOnlyToolCallExecutor<ToolName>,
  toolCallRequest: ToolCallRequestByName<ToolName>,
): Promise<ToolCallOutcome> {
  return input.readOnlyToolCallConcurrencyLimiter.run(
    () =>
      toolCallExecutor.runToolCall({
        toolCallRequest,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.projectInstructionTracker ? { projectInstructionTracker: input.projectInstructionTracker } : {}),
        abortSignal: input.abortSignal,
      }),
    {
      toolCallId: input.toolCallId,
      toolName,
    },
  );
}

function assertUnhandledReadOnlyToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled read-only tool call request: ${JSON.stringify(toolCallRequest)}`);
}
