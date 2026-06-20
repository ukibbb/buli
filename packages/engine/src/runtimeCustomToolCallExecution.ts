import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPendingToolApprovalClearedEventSchema,
  AssistantPendingToolApprovalRequestedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  CustomToolCallDetailSchema,
  createStartedToolCallDetailFromRequest,
  type AssistantResponseEvent,
  type BuliDiagnosticLogger,
  type CustomToolCallDetail,
  type CustomToolCallRequest,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimePendingToolApproval, RuntimePendingToolApprovalInput } from "./runtimeToolApproval.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import type { AssistantToolRegistry, CustomAssistantToolDefinition, CustomAssistantToolExecutionOutcome } from "./assistantToolRegistry.ts";
import type { RuntimeReadOnlyToolCallConcurrencyLimiter } from "./runtimeReadOnlyToolCallConcurrencyLimiter.ts";

export type StreamAssistantResponseEventsForCustomToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
  toolCallId: string;
  customToolCallRequest: CustomToolCallRequest;
  assistantToolRegistry: AssistantToolRegistry;
  workspaceRootPath: string;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  readOnlyToolCallConcurrencyLimiter?: RuntimeReadOnlyToolCallConcurrencyLimiter | undefined;
  abortSignal: AbortSignal;
  createPendingToolApproval: (input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForCustomToolCall(
  input: StreamAssistantResponseEventsForCustomToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const customToolDefinition = input.assistantToolRegistry.resolveCustomToolDefinition(input.customToolCallRequest.toolName);
  const startedToolCallDetail = createStartedToolCallDetailFromRequest(input.customToolCallRequest);
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const approvalPolicy = input.assistantToolRegistry.resolveCustomToolApprovalPolicy(customToolDefinition);

  if (approvalPolicy.approvalPolicyKind === "requires_user_approval") {
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantMessagePartAddedEventSchema.parse({
      type: "assistant_message_part_added",
      messageId: input.assistantResponseMessageId,
      part: AssistantToolCallConversationMessagePartSchema.parse({
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: input.toolCallId,
        toolCallStatus: "pending_approval",
        toolCallStartedAtMs,
        toolCallDetail: startedToolCallDetail,
      }),
    }));

    const { approvalId, approvalDecisionPromise } = input.createPendingToolApproval({
      toolCallId: input.toolCallId,
      toolCallRequest: input.customToolCallRequest,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantPendingToolApprovalRequestedEventSchema.parse({
      type: "assistant_pending_tool_approval_requested",
      approvalRequest: {
        approvalId,
        pendingToolCallId: input.toolCallId,
        pendingToolCallDetail: startedToolCallDetail,
        riskExplanation: approvalPolicy.riskExplanation,
      },
    }));

    const approvalWaitStartedAtMs = Date.now();
    const approvalDecision = await approvalDecisionPromise;
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.custom_approval_wait_finished", {
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolName: input.customToolCallRequest.toolName,
      approvalDecision,
      durationMs: Date.now() - approvalWaitStartedAtMs,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantPendingToolApprovalClearedEventSchema.parse({
      type: "assistant_pending_tool_approval_cleared",
      approvalId,
    }));

    if (approvalDecision === "interrupted") {
      input.throwIfConversationTurnInterrupted();
    }

    if (approvalDecision === "denied") {
      const denialText = `The user denied ${input.customToolCallRequest.toolName}, so it was not executed.`;
      input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
        toolCallId: input.toolCallId,
        toolCallDetail: startedToolCallDetail,
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
          toolCallDetail: startedToolCallDetail,
          denialText,
        }),
      }));
      await submitProviderToolResultWithDiagnostics({
        providerConversationTurn: input.providerConversationTurn,
        conversationTurnId: input.conversationTurnId,
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
        toolCallDetail: startedToolCallDetail,
      }),
    }));
  } else {
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
  }

  input.throwIfConversationTurnInterrupted();
  const toolExecutionStartedAtMs = Date.now();
  const customToolExecutionOutcome = await runCustomToolExecutor({
    customToolDefinition,
    customToolCallRequest: input.customToolCallRequest,
    toolCallId: input.toolCallId,
    conversationTurnId: input.conversationTurnId,
    workspaceRootPath: input.workspaceRootPath,
    readOnlyToolCallConcurrencyLimiter: customToolDefinition.executionPolicy.isAutoApprovedReadOnly
      ? input.readOnlyToolCallConcurrencyLimiter
      : undefined,
    abortSignal: input.abortSignal,
    diagnosticLogger: input.diagnosticLogger,
  });
  input.throwIfConversationTurnInterrupted();

  const durationMs = Date.now() - toolExecutionStartedAtMs;
  const completedOrFailedToolCallDetail = createCustomToolCallDetailForOutcome({
    startedToolCallDetail,
    customToolExecutionOutcome,
  });

  if (customToolExecutionOutcome.outcomeKind === "completed") {
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: completedOrFailedToolCallDetail,
      toolResultText: customToolExecutionOutcome.toolResultText,
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
        toolCallDetail: completedOrFailedToolCallDetail,
        durationMs,
      }),
    }));
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: customToolExecutionOutcome.toolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: completedOrFailedToolCallDetail,
    toolResultText: customToolExecutionOutcome.toolResultText,
    failureExplanation: customToolExecutionOutcome.failureExplanation,
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
      toolCallDetail: completedOrFailedToolCallDetail,
      errorText: customToolExecutionOutcome.failureExplanation,
      durationMs,
    }),
  }));
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolResultText: customToolExecutionOutcome.toolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}

async function runCustomToolExecutor(input: {
  customToolDefinition: CustomAssistantToolDefinition;
  customToolCallRequest: CustomToolCallRequest;
  toolCallId: string;
  conversationTurnId: string;
  workspaceRootPath: string;
  readOnlyToolCallConcurrencyLimiter?: RuntimeReadOnlyToolCallConcurrencyLimiter | undefined;
  abortSignal: AbortSignal;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
}): Promise<CustomAssistantToolExecutionOutcome> {
  try {
    const runCustomExecutor = () => input.customToolDefinition.executor({
      toolCallId: input.toolCallId,
      toolCallRequest: input.customToolCallRequest,
      workspaceRootPath: input.workspaceRootPath,
      abortSignal: input.abortSignal,
      diagnosticLogger: input.diagnosticLogger,
    });

    if (!input.readOnlyToolCallConcurrencyLimiter) {
      return await runCustomExecutor();
    }

    return await input.readOnlyToolCallConcurrencyLimiter.run(runCustomExecutor, {
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolName: input.customToolCallRequest.toolName,
    });
  } catch (error) {
    const failureExplanation = formatUnknownCustomToolError(error);
    return {
      outcomeKind: "failed",
      toolResultText: failureExplanation,
      failureExplanation,
    };
  }
}

function createCustomToolCallDetailForOutcome(input: {
  startedToolCallDetail: CustomToolCallDetail;
  customToolExecutionOutcome: CustomAssistantToolExecutionOutcome;
}): CustomToolCallDetail {
  const outcomeToolCallDetail = input.customToolExecutionOutcome.toolCallDetail;
  const mergedToolCallDetail = {
    ...input.startedToolCallDetail,
    ...(outcomeToolCallDetail ?? {}),
    ...(input.customToolExecutionOutcome.toolResultJson !== undefined
      ? { toolResultJson: input.customToolExecutionOutcome.toolResultJson }
      : {}),
    ...(input.customToolExecutionOutcome.toolResultSummary !== undefined
      ? { toolResultSummary: input.customToolExecutionOutcome.toolResultSummary }
      : {}),
  };

  return CustomToolCallDetailSchema.parse(mergedToolCallDetail);
}

function formatUnknownCustomToolError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return String(error) || "Custom tool execution failed.";
}
