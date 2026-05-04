import type {
  AssistantResponseEvent,
  BuliDiagnosticLogFields,
  ConversationMessagePart,
  TokenUsage,
} from "@buli/contracts";

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
      ...summarizeConversationMessagePartStatusForDiagnostics(assistantResponseEvent.part),
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

  return {
    messageId: assistantResponseEvent.messageId,
    errorTextLength: assistantResponseEvent.errorText.length,
  };
}

function summarizeConversationMessagePartStatusForDiagnostics(
  conversationMessagePart: ConversationMessagePart,
): BuliDiagnosticLogFields {
  if (conversationMessagePart.partKind === "assistant_text") {
    return {
      partStatus: conversationMessagePart.partStatus,
      rawMarkdownTextLength: conversationMessagePart.rawMarkdownText.length,
      completedContentPartCount: conversationMessagePart.completedContentParts.length,
      openContentPartKind: conversationMessagePart.openContentPart?.kind ?? null,
    };
  }

  if (conversationMessagePart.partKind === "assistant_reasoning") {
    return {
      partStatus: conversationMessagePart.partStatus,
      reasoningSummaryTextLength: conversationMessagePart.reasoningSummaryText.length,
    };
  }

  if (conversationMessagePart.partKind === "assistant_tool_call") {
    return {
      toolCallId: conversationMessagePart.toolCallId,
      toolCallStatus: conversationMessagePart.toolCallStatus,
      toolName: conversationMessagePart.toolCallDetail.toolName,
    };
  }

  if (conversationMessagePart.partKind === "assistant_plan_proposal") {
    return {
      planId: conversationMessagePart.planId,
      planStepCount: conversationMessagePart.planSteps.length,
    };
  }

  if (conversationMessagePart.partKind === "assistant_rate_limit_notice") {
    return {
      retryAfterSeconds: conversationMessagePart.retryAfterSeconds,
      limitExplanationLength: conversationMessagePart.limitExplanation.length,
    };
  }

  if (conversationMessagePart.partKind === "assistant_incomplete_notice") {
    return {
      incompleteReason: conversationMessagePart.incompleteReason,
    };
  }

  if (conversationMessagePart.partKind === "assistant_error_notice") {
    return {
      errorTextLength: conversationMessagePart.errorText.length,
    };
  }

  if (conversationMessagePart.partKind === "assistant_turn_summary") {
    return {
      turnDurationMs: conversationMessagePart.turnDurationMs,
      modelDisplayName: conversationMessagePart.modelDisplayName,
      ...(conversationMessagePart.usage
        ? summarizeTokenUsageForDiagnostics(conversationMessagePart.usage)
        : {}),
    };
  }

  return {
    userTextLength: conversationMessagePart.text.length,
  };
}

function summarizeTokenUsageForDiagnostics(tokenUsage: TokenUsage): BuliDiagnosticLogFields {
  return {
    totalTokens: tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    reasoningTokens: tokenUsage.reasoning,
    cacheReadTokens: tokenUsage.cache.read,
    cacheWriteTokens: tokenUsage.cache.write,
  };
}
