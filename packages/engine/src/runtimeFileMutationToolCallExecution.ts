import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPendingToolApprovalClearedEventSchema,
  AssistantPendingToolApprovalRequestedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  createStartedToolCallDetailFromRequest,
  isFileMutationToolCallRequest as isContractFileMutationToolCallRequest,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type FileMutationToolCallRequest as ContractFileMutationToolCallRequest,
  type ToolCallDetail,
  type ToolCallRequest,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { formatAssistantOperatingModeName, isReadOnlyAssistantOperatingMode } from "./assistantOperatingModePolicy.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimePendingToolApproval, RuntimePendingToolApprovalInput } from "./runtimeToolApproval.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import {
  prepareEditToolCall,
  runPreparedEditToolCall,
  type PreparedEditToolCall,
} from "./tools/editTool.ts";
import type { FailedToolCallOutcome, ToolCallOutcome } from "./tools/toolCallOutcome.ts";
import {
  prepareWriteToolCall,
  runPreparedWriteToolCall,
  type PreparedWriteToolCall,
} from "./tools/writeTool.ts";

export type FileMutationToolCallRequest = ContractFileMutationToolCallRequest;

type PreparedFileMutationToolCall =
  | { toolName: "edit"; preparedEditToolCall: PreparedEditToolCall }
  | { toolName: "write"; preparedWriteToolCall: PreparedWriteToolCall };

export type StreamAssistantResponseEventsForFileMutationToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  fileMutationToolCallRequest: FileMutationToolCallRequest;
  assistantOperatingMode: AssistantOperatingMode;
  workspaceRootPath: string;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  createPendingToolApproval: (input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForFileMutationToolCall(
  input: StreamAssistantResponseEventsForFileMutationToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.fileMutationToolCallRequest);
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();

  if (isReadOnlyAssistantOperatingMode(input.assistantOperatingMode)) {
    const denialText = `${formatAssistantOperatingModeName(input.assistantOperatingMode)} is read-only, so this ${input.fileMutationToolCallRequest.toolName} tool call was not applied.`;
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
      toolResultText: denialText,
      denialExplanation: denialText,
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
        denialText,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: denialText,
      toolResultKind: "denied",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.throwIfConversationTurnInterrupted();
  const preparedFileMutationToolCall = await prepareFileMutationToolCall({
    fileMutationToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  input.throwIfConversationTurnInterrupted();

  if (isFailedToolCallOutcome(preparedFileMutationToolCall)) {
    input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: preparedFileMutationToolCall.toolCallDetail,
      toolResultText: preparedFileMutationToolCall.toolResultText,
      failureExplanation: preparedFileMutationToolCall.failureExplanation,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "failed",
        toolCallStartedAtMs,
        toolCallDetail: preparedFileMutationToolCall.toolCallDetail,
        errorText: preparedFileMutationToolCall.failureExplanation,
        durationMs: preparedFileMutationToolCall.durationMilliseconds,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: preparedFileMutationToolCall.toolResultText,
      toolResultKind: "failed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  const preparedToolCallDetail = getPreparedFileMutationToolCallDetail(preparedFileMutationToolCall);
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
    type: "assistant_message_part_added",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "pending_approval",
      toolCallStartedAtMs,
      toolCallDetail: preparedToolCallDetail,
    }),
  }));

  const { approvalId, approvalDecisionPromise } = input.createPendingToolApproval({
    toolCallId: input.toolCallId,
    toolCallRequest: input.fileMutationToolCallRequest,
  });
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantPendingToolApprovalRequestedEventSchema.parse({
    type: "assistant_pending_tool_approval_requested",
    approvalRequest: {
      approvalId,
      pendingToolCallId: input.toolCallId,
      pendingToolCallDetail: preparedToolCallDetail,
      riskExplanation: buildFileMutationRiskExplanation(preparedToolCallDetail),
    },
  }));
  const approvalDecision = await approvalDecisionPromise;
  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantPendingToolApprovalClearedEventSchema.parse({
    type: "assistant_pending_tool_approval_cleared",
    approvalId,
  }));

  if (approvalDecision === "interrupted") {
    input.throwIfConversationTurnInterrupted();
  }

  if (approvalDecision === "denied") {
    const denialText = `The user denied this ${input.fileMutationToolCallRequest.toolName} tool call, so it was not applied.`;
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: preparedToolCallDetail,
      toolResultText: denialText,
      denialExplanation: denialText,
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
        toolCallDetail: preparedToolCallDetail,
        denialText,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: denialText,
      toolResultKind: "denied",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartUpdatedEventSchema.parse({
    type: "assistant_message_part_updated",
    messageId: input.assistantResponseMessageId,
    part: AssistantToolCallConversationMessagePartSchema.parse({
      id: toolCallPartId,
      partKind: "assistant_tool_call",
      toolCallId: input.toolCallId,
      toolCallStatus: "running",
      toolCallStartedAtMs,
      toolCallDetail: preparedToolCallDetail,
    }),
  }));

  input.throwIfConversationTurnInterrupted();
  const toolCallOutcome = await runPreparedFileMutationToolCall({
    preparedFileMutationToolCall,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  input.throwIfConversationTurnInterrupted();

  if (toolCallOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: toolCallOutcome.toolCallDetail,
      toolResultText: toolCallOutcome.toolResultText,
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
        toolCallDetail: toolCallOutcome.toolCallDetail,
        durationMs: toolCallOutcome.durationMilliseconds,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: toolCallOutcome.toolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: toolCallOutcome.toolCallDetail,
    toolResultText: toolCallOutcome.toolResultText,
    failureExplanation: toolCallOutcome.failureExplanation,
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
      toolCallDetail: toolCallOutcome.toolCallDetail,
      errorText: toolCallOutcome.failureExplanation,
      durationMs: toolCallOutcome.durationMilliseconds,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    toolResultText: toolCallOutcome.toolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}

export function isFileMutationToolCallRequest(
  toolCallRequest: ToolCallRequest,
): toolCallRequest is FileMutationToolCallRequest {
  return isContractFileMutationToolCallRequest(toolCallRequest);
}

async function prepareFileMutationToolCall(input: {
  fileMutationToolCallRequest: FileMutationToolCallRequest;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
}): Promise<PreparedFileMutationToolCall | FailedToolCallOutcome> {
  if (input.fileMutationToolCallRequest.toolName === "edit") {
    const editPreparationOutcome = await prepareEditToolCall({
      editToolCallRequest: input.fileMutationToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
    });
    if (isFailedToolCallOutcome(editPreparationOutcome)) {
      return editPreparationOutcome;
    }

    return { toolName: "edit", preparedEditToolCall: editPreparationOutcome.preparedEditToolCall };
  }

  const writePreparationOutcome = await prepareWriteToolCall({
    writeToolCallRequest: input.fileMutationToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
  if (isFailedToolCallOutcome(writePreparationOutcome)) {
    return writePreparationOutcome;
  }

  return { toolName: "write", preparedWriteToolCall: writePreparationOutcome.preparedWriteToolCall };
}

function getPreparedFileMutationToolCallDetail(preparedFileMutationToolCall: PreparedFileMutationToolCall): ToolCallDetail {
  if (preparedFileMutationToolCall.toolName === "edit") {
    return preparedFileMutationToolCall.preparedEditToolCall.toolCallDetail;
  }

  return preparedFileMutationToolCall.preparedWriteToolCall.toolCallDetail;
}

function runPreparedFileMutationToolCall(input: {
  preparedFileMutationToolCall: PreparedFileMutationToolCall;
  workspaceRootPath: string;
  abortSignal: AbortSignal;
}): Promise<ToolCallOutcome> {
  if (input.preparedFileMutationToolCall.toolName === "edit") {
    return runPreparedEditToolCall({
      preparedEditToolCall: input.preparedFileMutationToolCall.preparedEditToolCall,
      abortSignal: input.abortSignal,
    });
  }

  return runPreparedWriteToolCall({
    preparedWriteToolCall: input.preparedFileMutationToolCall.preparedWriteToolCall,
    workspaceRootPath: input.workspaceRootPath,
    abortSignal: input.abortSignal,
  });
}

function buildFileMutationRiskExplanation(toolCallDetail: ToolCallDetail): string {
  if (toolCallDetail.toolName === "edit") {
    return `This edit will modify ${toolCallDetail.editedFilePath}. Review the diff before approving.`;
  }
  if (toolCallDetail.toolName === "write") {
    return `This write will create or overwrite ${toolCallDetail.writtenFilePath}. Review the diff before approving.`;
  }

  return "This tool call changes files. Review the diff before approving.";
}

function isFailedToolCallOutcome(value: unknown): value is FailedToolCallOutcome {
  return typeof value === "object" && value !== null && "outcomeKind" in value && value.outcomeKind === "failed";
}
