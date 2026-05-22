import { expect, test } from "bun:test";
import type {
  AssistantConversationMessagePart,
  AssistantResponseEvent,
  BuliDiagnosticLogFields,
  TokenUsage,
} from "@buli/contracts";
import {
  summarizeAssistantResponseEventForDiagnostics,
  summarizeAssistantResponseEventsForDiagnostics,
} from "../src/assistantResponseEventDiagnostics.ts";

const tokenUsage: TokenUsage = {
  total: 17,
  input: 10,
  output: 5,
  reasoning: 2,
  cache: { read: 3, write: 1 },
};

const contextWindowTokenUsage: TokenUsage = {
  total: 170,
  input: 100,
  output: 50,
  reasoning: 20,
  cache: { read: 30, write: 10 },
};

function summarizeConversationMessagePart(conversationMessagePart: AssistantConversationMessagePart) {
  return summarizeAssistantResponseEventForDiagnostics({
    type: "assistant_message_part_added",
    messageId: "assistant-1",
    part: conversationMessagePart,
  });
}

test("summarizeAssistantResponseEventsForDiagnostics reports batch size and event types", () => {
  expect(
    summarizeAssistantResponseEventsForDiagnostics([
      { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
      { type: "assistant_message_failed", messageId: "assistant-1", errorText: "Provider failed" },
    ]),
  ).toEqual({
    eventCount: 2,
    eventTypes: ["assistant_turn_started", "assistant_message_failed"],
  });
});

test("summarizeAssistantResponseEventForDiagnostics covers assistant response event variants", () => {
  const assistantTextPart: AssistantConversationMessagePart = {
    id: "part-text-1",
    partKind: "assistant_text",
    partStatus: "streaming",
    rawMarkdownText: "Visible assistant text",
  };
  const eventCases: Array<{ assistantResponseEvent: AssistantResponseEvent; expectedFields: BuliDiagnosticLogFields }> = [
    {
      assistantResponseEvent: { type: "assistant_turn_started", messageId: "assistant-1", startedAtMs: 1 },
      expectedFields: { messageId: "assistant-1", startedAtMs: 1 },
    },
    {
      assistantResponseEvent: { type: "assistant_message_part_added", messageId: "assistant-1", part: assistantTextPart },
      expectedFields: {
        messageId: "assistant-1",
        partId: "part-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownTextLength: "Visible assistant text".length,
      },
    },
    {
      assistantResponseEvent: { type: "assistant_message_part_updated", messageId: "assistant-1", part: assistantTextPart },
      expectedFields: {
        messageId: "assistant-1",
        partId: "part-text-1",
        partKind: "assistant_text",
        partStatus: "streaming",
        rawMarkdownTextLength: "Visible assistant text".length,
      },
    },
    {
      assistantResponseEvent: {
        type: "assistant_pending_tool_approval_requested",
        approvalRequest: {
          approvalId: "approval-1",
          pendingToolCallId: "call-1",
          pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
          riskExplanation: "This command mutates files.",
        },
      },
      expectedFields: {
        approvalId: "approval-1",
        pendingToolCallId: "call-1",
        riskExplanationLength: "This command mutates files.".length,
      },
    },
    {
      assistantResponseEvent: { type: "assistant_pending_tool_approval_cleared", approvalId: "approval-1" },
      expectedFields: { approvalId: "approval-1" },
    },
    {
      assistantResponseEvent: {
        type: "assistant_message_completed",
        messageId: "assistant-1",
        usage: tokenUsage,
        contextWindowUsage: contextWindowTokenUsage,
      },
      expectedFields: {
        messageId: "assistant-1",
        totalTokens: 17,
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 2,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        contextWindowTotalTokens: 170,
        contextWindowInputTokens: 100,
        contextWindowOutputTokens: 50,
        contextWindowReasoningTokens: 20,
        contextWindowCacheReadTokens: 30,
        contextWindowCacheWriteTokens: 10,
      },
    },
    {
      assistantResponseEvent: {
        type: "assistant_message_incomplete",
        messageId: "assistant-1",
        incompleteReason: "max_output_tokens",
        usage: tokenUsage,
        contextWindowUsage: contextWindowTokenUsage,
      },
      expectedFields: {
        messageId: "assistant-1",
        incompleteReason: "max_output_tokens",
        totalTokens: 17,
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 2,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        contextWindowTotalTokens: 170,
        contextWindowInputTokens: 100,
        contextWindowOutputTokens: 50,
        contextWindowReasoningTokens: 20,
        contextWindowCacheReadTokens: 30,
        contextWindowCacheWriteTokens: 10,
      },
    },
    {
      assistantResponseEvent: { type: "assistant_message_failed", messageId: "assistant-1", errorText: "Provider failed" },
      expectedFields: { messageId: "assistant-1", errorTextLength: "Provider failed".length },
    },
    {
      assistantResponseEvent: {
        type: "assistant_message_interrupted",
        messageId: "assistant-1",
        interruptionReason: "Interrupted by user.",
      },
      expectedFields: { messageId: "assistant-1", interruptionReasonLength: "Interrupted by user.".length },
    },
  ];

  for (const eventCase of eventCases) {
    expect(summarizeAssistantResponseEventForDiagnostics(eventCase.assistantResponseEvent)).toEqual(eventCase.expectedFields);
  }
});

test("summarizeAssistantResponseEventForDiagnostics covers conversation message part variants without raw text", () => {
  const partCases: Array<{
    conversationMessagePart: AssistantConversationMessagePart;
    expectedFields: BuliDiagnosticLogFields;
    rawTextNotExpected?: string;
  }> = [
    {
      conversationMessagePart: {
        id: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: "Visible assistant text",
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "assistant-text-1",
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownTextLength: "Visible assistant text".length,
      },
      rawTextNotExpected: "Visible assistant text",
    },
    {
      conversationMessagePart: {
        id: "reasoning-1",
        partKind: "assistant_reasoning",
        partStatus: "completed",
        reasoningSummaryText: "Visible reasoning summary",
        reasoningStartedAtMs: 1,
        reasoningDurationMs: 2,
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "reasoning-1",
        partKind: "assistant_reasoning",
        partStatus: "completed",
        reasoningSummaryTextLength: "Visible reasoning summary".length,
      },
      rawTextNotExpected: "Visible reasoning summary",
    },
    {
      conversationMessagePart: {
        id: "tool-1",
        partKind: "assistant_tool_call",
        toolCallId: "call-1",
        toolCallStatus: "running",
        toolCallStartedAtMs: 1,
        toolCallDetail: { toolName: "read", readFilePath: "README.md" },
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "tool-1",
        partKind: "assistant_tool_call",
        toolCallId: "call-1",
        toolCallStatus: "running",
        toolName: "read",
      },
    },
    {
      conversationMessagePart: {
        id: "plan-1",
        partKind: "assistant_plan_proposal",
        planId: "plan-1",
        planTitle: "Implement diagnostics",
        planSteps: [{ stepIndex: 0, stepTitle: "Add tests", stepStatus: "pending" }],
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "plan-1",
        partKind: "assistant_plan_proposal",
        planId: "plan-1",
        planStepCount: 1,
      },
      rawTextNotExpected: "Implement diagnostics",
    },
    {
      conversationMessagePart: {
        id: "rate-limit-1",
        partKind: "assistant_rate_limit_notice",
        retryAfterSeconds: 3,
        limitExplanation: "Retry later",
        noticeStartedAtMs: 1,
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "rate-limit-1",
        partKind: "assistant_rate_limit_notice",
        retryAfterSeconds: 3,
        limitExplanationLength: "Retry later".length,
      },
      rawTextNotExpected: "Retry later",
    },
    {
      conversationMessagePart: {
        id: "incomplete-1",
        partKind: "assistant_incomplete_notice",
        incompleteReason: "max_output_tokens",
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "incomplete-1",
        partKind: "assistant_incomplete_notice",
        incompleteReason: "max_output_tokens",
      },
    },
    {
      conversationMessagePart: {
        id: "error-1",
        partKind: "assistant_error_notice",
        errorText: "Provider failed",
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "error-1",
        partKind: "assistant_error_notice",
        errorTextLength: "Provider failed".length,
      },
      rawTextNotExpected: "Provider failed",
    },
    {
      conversationMessagePart: {
        id: "interrupted-1",
        partKind: "assistant_interrupted_notice",
        interruptionReason: "Interrupted by user.",
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "interrupted-1",
        partKind: "assistant_interrupted_notice",
        interruptionReasonLength: "Interrupted by user.".length,
      },
      rawTextNotExpected: "Interrupted by user.",
    },
    {
      conversationMessagePart: {
        id: "turn-summary-1",
        partKind: "assistant_turn_summary",
        turnDurationMs: 1200,
        modelDisplayName: "GPT 5.4",
        usage: tokenUsage,
      },
      expectedFields: {
        messageId: "assistant-1",
        partId: "turn-summary-1",
        partKind: "assistant_turn_summary",
        turnDurationMs: 1200,
        modelDisplayName: "GPT 5.4",
        totalTokens: 17,
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 2,
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
      },
    },
  ];

  for (const partCase of partCases) {
    const diagnosticFields = summarizeConversationMessagePart(partCase.conversationMessagePart);
    expect(diagnosticFields).toEqual(partCase.expectedFields);
    if (partCase.rawTextNotExpected !== undefined) {
      expect(JSON.stringify(diagnosticFields)).not.toContain(partCase.rawTextNotExpected);
    }
  }
});
