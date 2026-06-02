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
  type WorkspacePatch,
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
import { buildProviderVisibleToolResultBudgetGateText } from "./tools/toolResultTextBudget.ts";
import type { WorkspaceShellCommandExecutor } from "./tools/workspaceShellCommandExecutor.ts";
import {
  appendWorkspacePatchSummaryToToolResultText,
  formatWorkspacePatchSummaryForToolResult,
} from "./workspaceSnapshot/workspacePatchSummary.ts";
import type { WorkspaceSnapshotStore } from "./workspaceSnapshot/workspaceSnapshotStore.ts";

export const BASH_PROVIDER_TOOL_RESULT_MAX_CHARACTER_COUNT = 32 * 1024;

export type StreamAssistantResponseEventsForBashToolCallInput = {
  assistantResponseMessageId: string;
  providerConversationTurn: ProviderConversationTurn;
  conversationTurnId: string;
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

  if (isReadOnlyAssistantOperatingMode(input.assistantOperatingMode)) {
    const denialText = `${formatAssistantOperatingModeName(input.assistantOperatingMode)} is read-only, so this bash command was not executed.`;
    input.toolResultSessionRecorder.appendDeniedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: startedToolCallDetail,
      toolResultText: denialText,
      denialExplanation: denialText,
    });
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.read_only_mode_blocked", {
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      assistantOperatingMode: input.assistantOperatingMode,
      toolName: input.bashToolCallRequest.toolName,
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
      conversationTurnId: input.conversationTurnId,
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
    conversationTurnId: input.conversationTurnId,
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
    const approvalWaitStartedAtMs = Date.now();
    const approvalDecision = await approvalDecisionPromise;
    logEngineDiagnosticEvent(input.diagnosticLogger, "tool_call.bash_approval_wait_finished", {
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
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
  const isReadOnlyCommand = bashToolApprovalDecision.approvalPolicy === "auto_run" && bashToolApprovalDecision.isReadOnly;
  const workspacePatchCapture = isReadOnlyCommand
    ? undefined
    : await beginRuntimeWorkspacePatchCapture({
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
    const completedToolResultTextWithWorkspacePatchSummary = appendWorkspacePatchSummaryToToolResultText({
      toolResultText: bashToolCallOutcome.toolResultText,
      workspacePatch,
    });
    const providerVisibleCompletedToolResultText = createProviderVisibleBashToolResultText({
      toolCallId: input.toolCallId,
      bashToolCallOutcome,
      canonicalToolResultText: completedToolResultTextWithWorkspacePatchSummary,
      workspacePatch,
    });
    input.toolResultSessionRecorder.appendCompletedToolResultSessionEntry({
      toolCallId: input.toolCallId,
      toolCallDetail: bashToolCallOutcome.toolCallDetail,
      toolResultText: completedToolResultTextWithWorkspacePatchSummary,
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
      conversationTurnId: input.conversationTurnId,
      toolCallId: input.toolCallId,
      toolResultText: providerVisibleCompletedToolResultText,
      toolResultKind: "completed",
      diagnosticLogger: input.diagnosticLogger,
    });
    return;
  }

  const failedToolResultText = appendWorkspacePatchSummaryToToolResultText({
    toolResultText: bashToolCallOutcome.toolResultText,
    workspacePatch,
  });
  const providerVisibleFailedToolResultText = createProviderVisibleBashToolResultText({
    toolCallId: input.toolCallId,
    bashToolCallOutcome,
    canonicalToolResultText: failedToolResultText,
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
    conversationTurnId: input.conversationTurnId,
    toolCallId: input.toolCallId,
    toolResultText: providerVisibleFailedToolResultText,
    toolResultKind: "failed",
    diagnosticLogger: input.diagnosticLogger,
  });
}

function createProviderVisibleBashToolResultText(input: {
  toolCallId: string;
  bashToolCallOutcome: Awaited<ReturnType<typeof runApprovedBashToolCall>>;
  canonicalToolResultText: string;
  workspacePatch: WorkspacePatch | undefined;
}): string {
  const hasCapturedOutputTruncation = input.bashToolCallOutcome.toolCallDetail.outputLines?.some((outputLine) =>
    outputLine.lineText.startsWith("stdout truncated;") || outputLine.lineText.startsWith("stderr truncated;")
  ) ?? false;

  return buildProviderVisibleToolResultBudgetGateText({
    toolName: "bash",
    sourceText: input.canonicalToolResultText,
    maximumCharacterCount: BASH_PROVIDER_TOOL_RESULT_MAX_CHARACTER_COUNT,
    metadataLines: [
      `tool_call_id: ${input.toolCallId}`,
      `outcome_kind: ${input.bashToolCallOutcome.outcomeKind}`,
      `command_line: ${formatBashBudgetGateMetadataValue(input.bashToolCallOutcome.toolCallDetail.commandLine)}`,
      `working_directory_path: ${input.bashToolCallOutcome.toolCallDetail.workingDirectoryPath ?? "unknown"}`,
      `exit_code: ${input.bashToolCallOutcome.toolCallDetail.exitCode ?? "not_completed"}`,
      `duration_ms: ${input.bashToolCallOutcome.durationMilliseconds}`,
      `captured_output_was_truncated: ${hasCapturedOutputTruncation}`,
      ...formatWorkspacePatchBudgetGateMetadataLines(input.workspacePatch),
      ...(input.bashToolCallOutcome.outcomeKind === "failed"
        ? [`failure_explanation_length: ${input.bashToolCallOutcome.failureExplanation.length}`]
        : []),
    ],
    guidanceLines: [
      "Rerun a narrower command, write large output to a file and read bounded windows, or pipe the command to a smaller targeted query.",
      "If the command already changed files, use the retained workspace change metadata and inspect exact files with read before concluding.",
    ],
    rawEvidenceStorage: hasCapturedOutputTruncation
      ? "external_output_capture_may_be_truncated"
      : "canonical_tool_result_text_stored",
  });
}

function formatWorkspacePatchBudgetGateMetadataLines(workspacePatch: WorkspacePatch | undefined): string[] {
  if (!workspacePatch) {
    return ["Workspace changes: none"];
  }

  return formatWorkspacePatchSummaryForToolResult(workspacePatch).split("\n");
}

function formatBashBudgetGateMetadataValue(metadataValue: string): string {
  const maximumMetadataValueLength = 500;
  if (metadataValue.length <= maximumMetadataValueLength) {
    return metadataValue;
  }

  return `${metadataValue.slice(0, maximumMetadataValueLength)}... (${metadataValue.length} characters)`;
}
