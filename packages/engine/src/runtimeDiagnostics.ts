import type {
  AssistantResponseEvent,
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ProviderStreamEvent,
} from "@buli/contracts";
import { emitBuliDiagnosticLogEvent, summarizeTokenUsageForDiagnostics } from "@buli/contracts";

export function logEngineDiagnosticEvent(
  diagnosticLogger: BuliDiagnosticLogger | undefined,
  eventName: string,
  fields?: BuliDiagnosticLogFields,
): void {
  emitBuliDiagnosticLogEvent(diagnosticLogger, {
    subsystem: "engine",
    eventName,
    ...(fields ? { fields } : {}),
  });
}

export function summarizeProviderStreamEventForDiagnostics(
  providerStreamEvent: ProviderStreamEvent,
): BuliDiagnosticLogFields {
  if (providerStreamEvent.type === "text_chunk") {
    return {
      textLength: providerStreamEvent.text.length,
    };
  }

  if (providerStreamEvent.type === "completed") {
    return summarizeTokenUsageForDiagnostics(providerStreamEvent.usage);
  }

  if (providerStreamEvent.type === "incomplete") {
    return {
      incompleteReason: providerStreamEvent.incompleteReason,
      ...summarizeTokenUsageForDiagnostics(providerStreamEvent.usage),
    };
  }

  if (providerStreamEvent.type === "reasoning_summary_text_chunk") {
    return {
      textLength: providerStreamEvent.text.length,
    };
  }

  if (providerStreamEvent.type === "reasoning_summary_completed") {
    return {
      reasoningDurationMs: providerStreamEvent.reasoningDurationMs,
    };
  }

  if (providerStreamEvent.type === "tool_call_requested") {
    return {
      toolCallId: providerStreamEvent.toolCallId,
      toolName: providerStreamEvent.toolCallRequest.toolName,
      ...(providerStreamEvent.toolCallRequest.toolName === "bash"
        ? {
            shellCommandLength: providerStreamEvent.toolCallRequest.shellCommand.length,
            commandDescriptionLength: providerStreamEvent.toolCallRequest.commandDescription.length,
          }
      : {}),
    };
  }

  if (providerStreamEvent.type === "tool_calls_requested") {
    return {
      toolCallCount: providerStreamEvent.requestedToolCalls.length,
      toolCallIds: providerStreamEvent.requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallId),
      toolNames: providerStreamEvent.requestedToolCalls.map((requestedToolCall) => requestedToolCall.toolCallRequest.toolName),
    };
  }

  if (providerStreamEvent.type === "learning_sequence_presented") {
    return {
      presentationCallId: providerStreamEvent.presentationCallId,
      learningSequenceTitleLength: providerStreamEvent.learningSequence.titleText.length,
      learningSequenceItemCount: providerStreamEvent.learningSequence.sequenceItems.length,
    };
  }

  if (providerStreamEvent.type === "rate_limit_pending") {
    return {
      retryAfterSeconds: providerStreamEvent.retryAfterSeconds,
      limitExplanationLength: providerStreamEvent.limitExplanation.length,
    };
  }

  if (providerStreamEvent.type === "plan_proposed") {
    return {
      planId: providerStreamEvent.planId,
      planTitleLength: providerStreamEvent.planTitle.length,
      planStepCount: providerStreamEvent.planSteps.length,
    };
  }

  return {};
}

export function summarizeAssistantResponseEventForDiagnostics(
  assistantResponseEvent: AssistantResponseEvent,
): BuliDiagnosticLogFields {
  if (assistantResponseEvent.type === "assistant_turn_started") {
    return {
      messageId: assistantResponseEvent.messageId,
      startedAtMs: assistantResponseEvent.startedAtMs,
    };
  }

  if (
    assistantResponseEvent.type === "assistant_message_part_added" ||
    assistantResponseEvent.type === "assistant_message_part_updated"
  ) {
    return {
      messageId: assistantResponseEvent.messageId,
      partId: assistantResponseEvent.part.id,
      partKind: assistantResponseEvent.part.partKind,
      ...(assistantResponseEvent.part.partKind === "assistant_text"
        ? {
            partStatus: assistantResponseEvent.part.partStatus,
            rawMarkdownTextLength: assistantResponseEvent.part.rawMarkdownText.length,
          }
        : {}),
      ...(assistantResponseEvent.part.partKind === "assistant_reasoning"
        ? {
            partStatus: assistantResponseEvent.part.partStatus,
            reasoningSummaryTextLength: assistantResponseEvent.part.reasoningSummaryText.length,
          }
        : {}),
      ...(assistantResponseEvent.part.partKind === "assistant_tool_call"
        ? {
            toolCallId: assistantResponseEvent.part.toolCallId,
            toolCallStatus: assistantResponseEvent.part.toolCallStatus,
            toolName: assistantResponseEvent.part.toolCallDetail.toolName,
          }
        : {}),
    };
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_requested") {
    return {
      approvalId: assistantResponseEvent.approvalRequest.approvalId,
      pendingToolCallId: assistantResponseEvent.approvalRequest.pendingToolCallId,
      riskExplanationLength: assistantResponseEvent.approvalRequest.riskExplanation.length,
    };
  }

  if (assistantResponseEvent.type === "assistant_pending_tool_approval_cleared") {
    return {
      approvalId: assistantResponseEvent.approvalId,
    };
  }

  if (assistantResponseEvent.type === "assistant_message_completed") {
    return {
      messageId: assistantResponseEvent.messageId,
      ...summarizeTokenUsageForDiagnostics(assistantResponseEvent.usage),
    };
  }

  if (assistantResponseEvent.type === "assistant_message_incomplete") {
    return {
      messageId: assistantResponseEvent.messageId,
      incompleteReason: assistantResponseEvent.incompleteReason,
      ...summarizeTokenUsageForDiagnostics(assistantResponseEvent.usage),
    };
  }

  if (assistantResponseEvent.type === "assistant_message_interrupted") {
    return {
      messageId: assistantResponseEvent.messageId,
      interruptionReasonLength: assistantResponseEvent.interruptionReason.length,
    };
  }

  return {
    messageId: assistantResponseEvent.messageId,
    errorTextLength: assistantResponseEvent.errorText.length,
  };
}
