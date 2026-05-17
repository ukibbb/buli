import type {
  AssistantConversationMessagePart,
  AssistantResponseEvent,
  BuliDiagnosticLogFields,
} from "@buli/contracts";
import { summarizeTokenUsageForDiagnostics } from "@buli/contracts";

export function summarizeAssistantResponseEventsForDiagnostics(
  assistantResponseEvents: readonly AssistantResponseEvent[],
): BuliDiagnosticLogFields {
  return {
    eventCount: assistantResponseEvents.length,
    eventTypes: assistantResponseEvents.map((assistantResponseEvent) => assistantResponseEvent.type),
  };
}

export function summarizeAssistantResponseEventForDiagnostics(
  assistantResponseEvent: AssistantResponseEvent,
): BuliDiagnosticLogFields {
  switch (assistantResponseEvent.type) {
    case "assistant_turn_started":
      return {
        messageId: assistantResponseEvent.messageId,
        startedAtMs: assistantResponseEvent.startedAtMs,
      };
    case "assistant_message_part_added":
    case "assistant_message_part_updated":
      return {
        messageId: assistantResponseEvent.messageId,
        partId: assistantResponseEvent.part.id,
        partKind: assistantResponseEvent.part.partKind,
        ...summarizeConversationMessagePartStatusForDiagnostics(assistantResponseEvent.part),
      };
    case "assistant_pending_tool_approval_requested":
      return {
        approvalId: assistantResponseEvent.approvalRequest.approvalId,
        pendingToolCallId: assistantResponseEvent.approvalRequest.pendingToolCallId,
        riskExplanationLength: assistantResponseEvent.approvalRequest.riskExplanation.length,
      };
    case "assistant_pending_tool_approval_cleared":
      return {
        approvalId: assistantResponseEvent.approvalId,
      };
    case "assistant_message_completed":
      return {
        messageId: assistantResponseEvent.messageId,
        ...summarizeTokenUsageForDiagnostics(assistantResponseEvent.usage),
      };
    case "assistant_message_incomplete":
      return {
        messageId: assistantResponseEvent.messageId,
        incompleteReason: assistantResponseEvent.incompleteReason,
        ...summarizeTokenUsageForDiagnostics(assistantResponseEvent.usage),
      };
    case "assistant_message_failed":
      return {
        messageId: assistantResponseEvent.messageId,
        errorTextLength: assistantResponseEvent.errorText.length,
      };
    case "assistant_message_interrupted":
      return {
        messageId: assistantResponseEvent.messageId,
        interruptionReasonLength: assistantResponseEvent.interruptionReason.length,
      };
  }

  const unhandledAssistantResponseEvent: never = assistantResponseEvent;
  return unhandledAssistantResponseEvent;
}

function summarizeConversationMessagePartStatusForDiagnostics(
  conversationMessagePart: AssistantConversationMessagePart,
): BuliDiagnosticLogFields {
  switch (conversationMessagePart.partKind) {
    case "assistant_text":
      return {
        partStatus: conversationMessagePart.partStatus,
        rawMarkdownTextLength: conversationMessagePart.rawMarkdownText.length,
      };
    case "assistant_reasoning":
      return {
        partStatus: conversationMessagePart.partStatus,
        reasoningSummaryTextLength: conversationMessagePart.reasoningSummaryText.length,
      };
    case "assistant_tool_call":
      return {
        toolCallId: conversationMessagePart.toolCallId,
        toolCallStatus: conversationMessagePart.toolCallStatus,
        toolName: conversationMessagePart.toolCallDetail.toolName,
      };
    case "assistant_plan_proposal":
      return {
        planId: conversationMessagePart.planId,
        planStepCount: conversationMessagePart.planSteps.length,
      };
    case "assistant_rate_limit_notice":
      return {
        retryAfterSeconds: conversationMessagePart.retryAfterSeconds,
        limitExplanationLength: conversationMessagePart.limitExplanation.length,
      };
    case "assistant_incomplete_notice":
      return {
        incompleteReason: conversationMessagePart.incompleteReason,
      };
    case "assistant_error_notice":
      return {
        errorTextLength: conversationMessagePart.errorText.length,
      };
    case "assistant_interrupted_notice":
      return {
        interruptionReasonLength: conversationMessagePart.interruptionReason.length,
      };
    case "assistant_turn_summary":
      return {
        turnDurationMs: conversationMessagePart.turnDurationMs,
        modelDisplayName: conversationMessagePart.modelDisplayName,
        ...(conversationMessagePart.usage
          ? summarizeTokenUsageForDiagnostics(conversationMessagePart.usage)
          : {}),
      };
  }

  const unhandledConversationMessagePart: never = conversationMessagePart;
  return unhandledConversationMessagePart;
}
