import { expect, test } from "bun:test";
import type { AssistantResponseEvent } from "@buli/contracts";
import type { ConversationAutoCompactionResult } from "@buli/engine";
import {
  resolveAutoCompactionFollowUpPromptAfterAssistantTurn,
  type SubmittedChatAppPrompt,
} from "../src/useChatAppAssistantTurnActions.ts";

type TerminalAssistantResponseEvent = Extract<AssistantResponseEvent, {
  type: "assistant_message_completed" | "assistant_message_incomplete" | "assistant_message_failed" | "assistant_message_interrupted";
}>;

test("resolveAutoCompactionFollowUpPromptAfterAssistantTurn retries the original prompt after overflow compaction", () => {
  const activeSubmittedPrompt = createSubmittedPrompt();
  const followUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
    activeSubmittedPrompt,
    terminalAssistantResponseEvent: {
      type: "assistant_message_failed",
      messageId: "assistant-1",
      errorText: "Input exceeds the model context window.",
      failureKind: "context_window_overflow",
    },
    autoCompactionResult: createCompactedAutoCompactionResult({
      reason: "context_window_overflow",
      triggerKind: "context_window_overflow",
    }),
  });

  expect(followUpPrompt).toEqual({
    submittedPromptText: activeSubmittedPrompt.submittedPromptText,
    submittedPromptImageAttachments: activeSubmittedPrompt.submittedPromptImageAttachments,
    submittedAssistantOperatingMode: "plan",
    submittedPromptSource: "auto_compaction_retry",
  });
});

test("resolveAutoCompactionFollowUpPromptAfterAssistantTurn does not retry an overflow retry again", () => {
  const followUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
    activeSubmittedPrompt: createSubmittedPrompt("auto_compaction_retry"),
    terminalAssistantResponseEvent: {
      type: "assistant_message_failed",
      messageId: "assistant-1",
      errorText: "Input exceeds the model context window.",
      failureKind: "context_window_overflow",
    },
    autoCompactionResult: createCompactedAutoCompactionResult({
      reason: "context_window_overflow",
      triggerKind: "context_window_overflow",
    }),
  });

  expect(followUpPrompt).toBeUndefined();
});

test("resolveAutoCompactionFollowUpPromptAfterAssistantTurn continues after regular auto-compaction", () => {
  const followUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
    activeSubmittedPrompt: createSubmittedPrompt(),
    terminalAssistantResponseEvent: createCompletedAssistantResponseEvent(),
    autoCompactionResult: createCompactedAutoCompactionResult({
      reason: "context_usage_threshold_reached",
      triggerKind: "threshold_ratio",
    }),
  });

  expect(followUpPrompt).toEqual({
    submittedPromptText: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.",
    submittedPromptImageAttachments: [],
    submittedAssistantOperatingMode: "plan",
    submittedPromptSource: "auto_compaction_continue",
  });
});

test("resolveAutoCompactionFollowUpPromptAfterAssistantTurn continues after retry stops at max output tokens", () => {
  const followUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
    activeSubmittedPrompt: createSubmittedPrompt("auto_compaction_retry"),
    terminalAssistantResponseEvent: createIncompleteAssistantResponseEvent("max_output_tokens"),
    autoCompactionResult: createCompactedAutoCompactionResult({
      reason: "context_usage_threshold_reached",
      triggerKind: "threshold_ratio",
    }),
  });

  expect(followUpPrompt).toEqual({
    submittedPromptText: "Continue the previous response from where it stopped. Do not repeat completed content.",
    submittedPromptImageAttachments: [],
    submittedAssistantOperatingMode: "plan",
    submittedPromptSource: "auto_compaction_continue",
  });
});

test("resolveAutoCompactionFollowUpPromptAfterAssistantTurn does not continue max output tokens twice", () => {
  const followUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
    activeSubmittedPrompt: createSubmittedPrompt("auto_compaction_continue"),
    terminalAssistantResponseEvent: createIncompleteAssistantResponseEvent("max_output_tokens"),
    autoCompactionResult: createCompactedAutoCompactionResult({
      reason: "context_usage_threshold_reached",
      triggerKind: "threshold_ratio",
    }),
  });

  expect(followUpPrompt).toBeUndefined();
});

test("resolveAutoCompactionFollowUpPromptAfterAssistantTurn does not continue retry for other incomplete reasons", () => {
  const followUpPrompt = resolveAutoCompactionFollowUpPromptAfterAssistantTurn({
    activeSubmittedPrompt: createSubmittedPrompt("auto_compaction_retry"),
    terminalAssistantResponseEvent: createIncompleteAssistantResponseEvent("content_filter"),
    autoCompactionResult: createCompactedAutoCompactionResult({
      reason: "context_usage_threshold_reached",
      triggerKind: "threshold_ratio",
    }),
  });

  expect(followUpPrompt).toBeUndefined();
});

function createSubmittedPrompt(submittedPromptSource?: SubmittedChatAppPrompt["submittedPromptSource"]): SubmittedChatAppPrompt {
  return {
    submittedPromptText: "Explain the failing build",
    submittedPromptImageAttachments: [],
    submittedAssistantOperatingMode: "plan",
    ...(submittedPromptSource ? { submittedPromptSource } : {}),
  };
}

function createCompletedAssistantResponseEvent(): TerminalAssistantResponseEvent {
  return {
    type: "assistant_message_completed",
    messageId: "assistant-1",
    usage: {
      total: 10,
      input: 4,
      output: 5,
      reasoning: 1,
      cache: { read: 0, write: 0 },
    },
  };
}

function createIncompleteAssistantResponseEvent(incompleteReason: string): TerminalAssistantResponseEvent {
  return {
    type: "assistant_message_incomplete",
    messageId: "assistant-1",
    incompleteReason,
    usage: {
      total: 10,
      input: 4,
      output: 5,
      reasoning: 1,
      cache: { read: 0, write: 0 },
    },
  };
}

function createCompactedAutoCompactionResult(input: {
  reason: ConversationAutoCompactionResult["decision"]["reason"];
  triggerKind: NonNullable<ConversationAutoCompactionResult["decision"]["triggerKind"]>;
}): ConversationAutoCompactionResult {
  return {
    didCompact: true,
    conversationSessionEntries: [],
    decision: {
      shouldCompact: true,
      reason: input.reason,
      selectedModelId: "gpt-5.1",
      contextTokensUsed: input.triggerKind === "context_window_overflow" ? 0 : 321_000,
      contextUsageRatio: input.triggerKind === "context_window_overflow" ? undefined : 0.8025,
      contextWindowTokenCapacity: input.triggerKind === "context_window_overflow" ? undefined : 400_000,
      contextCompactionTriggerTokenCount: input.triggerKind === "context_window_overflow" ? undefined : 320_000,
      reservedTokenCount: undefined,
      thresholdRatio: 0.8,
      triggerKind: input.triggerKind,
      sessionEntryCountAfterLatestCompactionSummary: 4,
    },
  };
}
