import { randomUUID } from "node:crypto";
import {
  AssistantMessagePartAddedEventSchema,
  AssistantMessagePartUpdatedEventSchema,
  AssistantPendingToolApprovalClearedEventSchema,
  AssistantPendingToolApprovalRequestedEventSchema,
  AssistantToolCallConversationMessagePartSchema,
  type AssistantOperatingMode,
  type AssistantResponseEvent,
  type BashToolCallRequest,
  type BuliDiagnosticLogger,
} from "@buli/contracts";
import type { ProviderConversationTurn } from "./provider.ts";
import { formatAssistantOperatingModeName, isReadOnlyAssistantOperatingMode } from "./assistantOperatingModePolicy.ts";
import { logEngineDiagnosticEvent } from "./runtimeDiagnostics.ts";
import { logAssistantResponseEventEmitted, submitProviderToolResultWithDiagnostics } from "./runtimeToolCallExecutionDiagnostics.ts";
import type { RuntimePendingToolApproval, RuntimePendingToolApprovalInput } from "./runtimeToolApproval.ts";
import type { RuntimeToolResultSessionRecorder } from "./runtimeToolResultSessionRecorder.ts";
import {
  beginRuntimeWorkspacePatchCapture,
  recordWorkspacePatchAndCreateAssistantEvent,
} from "./runtimeWorkspacePatchCapture.ts";
import { createStartedBashToolCallDetail, runApprovedBashToolCall } from "./tools/bashTool.ts";
import {
  classifyBashToolApprovalRequirement,
  type BashToolApprovalMode,
} from "./tools/bashToolApprovalPolicy.ts";
import type { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";
import { appendWorkspacePatchSummaryToToolResultText } from "./workspaceSnapshot/workspacePatchSummary.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export type StreamAssistantResponseEventsForBashToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  toolCallId: string;
  bashToolCallRequest: BashToolCallRequest;
  assistantOperatingMode: AssistantOperatingMode;
  bashToolApprovalMode: BashToolApprovalMode;
  workspaceRootPath: string;
  workspaceSnapshotStore?: WorkspaceSnapshotStore | undefined;
  workspaceShellCommandExecutor: WorkspaceShellCommandExecutor;
  toolResultSessionRecorder: RuntimeToolResultSessionRecorder;
  abortSignal: AbortSignal;
  createPendingToolApproval: (input: RuntimePendingToolApprovalInput) => RuntimePendingToolApproval;
  throwIfConversationTurnInterrupted: () => void;
  diagnosticLogger?: BuliDiagnosticLogger | undefined;
};

export async function* streamAssistantResponseEventsForBashToolCall(
  input: StreamAssistantResponseEventsForBashToolCallInput,
): AsyncGenerator<AssistantResponseEvent> {
  const startedToolCallDetail = createStartedBashToolCallDetail(input.bashToolCallRequest);
  const toolCallPartId = randomUUID();
  const toolCallStartedAtMs = Date.now();
  const readOnlyModeBashToolDecision = isReadOnlyAssistantOperatingMode(input.assistantOperatingMode)
    ? classifyBashToolApprovalRequirement(input.bashToolCallRequest, "risk_based")
    : undefined;

  if (readOnlyModeBashToolDecision?.approvalPolicy === "requires_user_approval") {
    const denialText = [
      `${formatAssistantOperatingModeName(input.assistantOperatingMode)} is read-only, so this bash command was not executed.`,
      readOnlyModeBashToolDecision.riskExplanation,
    ].join(" ");
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
      toolResultText: denialText,
      denialExplanation: denialText,
    });
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.read_only_mode_blocked", {
      toolCallId: input.toolCallId,
      assistantOperatingMode: input.assistantOperatingMode,
      matchedRiskKind: readOnlyModeBashToolDecision.matchedRiskKind,
      riskExplanationLength: readOnlyModeBashToolDecision.riskExplanation.length,
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

  const bashToolApprovalDecision = classifyBashToolApprovalRequirement(
    input.bashToolCallRequest,
    input.bashToolApprovalMode,
  );
  logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.approval_policy_classified", {
    toolCallId: input.toolCallId,
    bashToolApprovalMode: input.bashToolApprovalMode,
    approvalPolicy: bashToolApprovalDecision.approvalPolicy,
    ...(bashToolApprovalDecision.approvalPolicy === "requires_user_approval"
      ? {
          matchedRiskKind: bashToolApprovalDecision.matchedRiskKind,
          riskExplanationLength: bashToolApprovalDecision.riskExplanation.length,
        }
      : {}),
  });

  if (bashToolApprovalDecision.approvalPolicy === "requires_user_approval") {
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
      toolCallRequest: input.bashToolCallRequest,
    });
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, AssistantPendingToolApprovalRequestedEventSchema.parse({
      type: "assistant_pending_tool_approval_requested",
      approvalRequest: {
        approvalId,
        pendingToolCallId: input.toolCallId,
        pendingToolCallDetail: startedToolCallDetail,
        riskExplanation: bashToolApprovalDecision.riskExplanation,
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
      const denialText = "The user denied this bash command, so it was not executed.";
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
  const workspacePatchCapture = await beginRuntimeWorkspacePatchCapture({
    workspaceSnapshotStore: input.workspaceSnapshotStore,
    toolCallId: input.toolCallId,
    abortSignal: input.abortSignal,
    diagnosticLogger: input.diagnosticLogger,
  });
  const bashToolCallOutcome = await runApprovedBashToolCall({
    bashToolCallRequest: input.bashToolCallRequest,
    workspaceRootPath: input.workspaceRootPath,
    workspaceShellCommandExecutor: input.workspaceShellCommandExecutor,
    diagnosticLogger: input.diagnosticLogger,
    abortSignal: input.abortSignal,
  });
  const workspacePatch = await workspacePatchCapture?.captureWorkspacePatch();
  input.throwIfConversationTurnInterrupted();

  if (bashToolCallOutcome.outcomeKind === "completed") {
    const completedToolResultText = appendWorkspacePatchSummaryToToolResultText({
      toolResultText: bashToolCallOutcome.toolResultText,
      workspacePatch,
    });
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: bashToolCallOutcome.toolCallDetail,
      toolResultText: completedToolResultText,
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
        toolCallDetail: bashToolCallOutcome.toolCallDetail,
        durationMs: bashToolCallOutcome.durationMilliseconds,
      }),
    }));
    const workspacePatchEvent = recordWorkspacePatchAndCreateAssistantEvent({
      workspacePatch,
      assistantResponseMessageId: input.assistantResponseMessageId,
      toolResultSessionRecorder: input.toolResultSessionRecorder,
    });
    if (workspacePatchEvent) {
      yield logAssistantResponseEventEmitted(input.diagnosticLogger, workspacePatchEvent);
    }
    await submitProviderToolResultWithDiagnostics({
      providerConversationTurn: input.providerConversationTurn,
      toolCallId: input.toolCallId,
      toolResultText: completedToolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  const failedToolResultText = appendWorkspacePatchSummaryToToolResultText({
    toolResultText: bashToolCallOutcome.toolResultText,
    workspacePatch,
  });
  input.toolResultSessionRecorder.appendFailedToolResultSessionEntry({
    toolCallId: input.toolCallId,
    toolCallDetail: bashToolCallOutcome.toolCallDetail,
    toolResultText: failedToolResultText,
    failureExplanation: bashToolCallOutcome.failureExplanation,
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
      toolCallDetail: bashToolCallOutcome.toolCallDetail,
      errorText: bashToolCallOutcome.failureExplanation,
      durationMs: bashToolCallOutcome.durationMilliseconds,
    }),
  }));
  const workspacePatchEvent = recordWorkspacePatchAndCreateAssistantEvent({
    workspacePatch,
    assistantResponseMessageId: input.assistantResponseMessageId,
    toolResultSessionRecorder: input.toolResultSessionRecorder,
  });
  if (workspacePatchEvent) {
    yield logAssistantResponseEventEmitted(input.diagnosticLogger, workspacePatchEvent);
  }
  await submitProviderToolResultWithDiagnostics({
    providerConversationTurn: input.providerConversationTurn,
    toolCallId: input.toolCallId,
    toolResultText: failedToolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}
