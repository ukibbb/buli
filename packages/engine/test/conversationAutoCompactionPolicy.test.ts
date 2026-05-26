import { describe, expect, test } from "bun:test";
import type { ConversationSessionEntry, TokenUsage } from "@buli/contracts";
import {
  calculateContextTokensUsedFromTokenUsage,
  decideConversationAutoCompaction,
} from "../src/index.ts";

const completedConversationTurnEntries: ConversationSessionEntry[] = [
  {
    entryKind: "user_prompt",
    promptText: "Continue the implementation",
    modelFacingPromptText: "Continue the implementation",
  },
  {
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Implemented the next slice.",
  },
];

function createTokenUsage(totalTokenCount: number): TokenUsage {
  return {
    total: totalTokenCount,
    input: totalTokenCount,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
}

describe("decideConversationAutoCompaction", () => {
  test("compacts known OpenAI models when context usage reaches the default 80 percent threshold", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-4o",
      latestContextWindowUsage: createTokenUsage(102_400),
    });

    expect(decision).toMatchObject({
      shouldCompact: true,
      reason: "context_usage_threshold_reached",
      contextTokensUsed: 102_400,
      contextWindowTokenCapacity: 128_000,
      contextUsageRatio: 0.8,
      contextCompactionTriggerTokenCount: 102_400,
      thresholdRatio: 0.8,
      triggerKind: "threshold_ratio",
      sessionEntryCountAfterLatestCompactionSummary: 2,
    });
  });

  test("skips known OpenAI compaction below the default 80 percent threshold", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.4",
      latestContextWindowUsage: createTokenUsage(839_999),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "context_usage_below_threshold",
      contextWindowTokenCapacity: 1_050_000,
    });
  });

  test("uses Buli's GPT 5.5 performance budget with reserved headroom", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(252_000),
    });

    expect(decision).toMatchObject({
      shouldCompact: true,
      reason: "context_usage_threshold_reached",
      contextTokensUsed: 252_000,
      contextWindowTokenCapacity: 1_050_000,
      contextUsageRatio: 0.24,
      contextCompactionTriggerTokenCount: 252_000,
      thresholdRatio: 0.8,
      triggerKind: "threshold_ratio",
    });
  });

  test("skips GPT 5.5 compaction below the performance budget with reserved headroom", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(251_999),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "context_usage_below_threshold",
      contextCompactionTriggerTokenCount: 252_000,
    });
  });

  test("honors an explicit threshold override", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(300_000),
      thresholdRatio: 0.75,
    });

    expect(decision).toMatchObject({
      shouldCompact: true,
      reason: "context_usage_threshold_reached",
      contextTokensUsed: 300_000,
      contextWindowTokenCapacity: 1_050_000,
      contextUsageRatio: 300_000 / 1_050_000,
      contextCompactionTriggerTokenCount: 252_000,
      thresholdRatio: 0.75,
      triggerKind: "threshold_ratio",
      sessionEntryCountAfterLatestCompactionSummary: 2,
    });
  });

  test("skips ratio compaction when the model context window is unknown", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "unknown-model",
      latestContextWindowUsage: createTokenUsage(300_000),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "unknown_context_window",
      contextWindowTokenCapacity: undefined,
      contextUsageRatio: undefined,
    });
  });

  test("compacts unknown models after a provider context-window overflow", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5-future",
      requestTriggerKind: "context_window_overflow",
    });

    expect(decision).toMatchObject({
      shouldCompact: true,
      reason: "context_window_overflow",
      contextWindowTokenCapacity: undefined,
      triggerKind: "context_window_overflow",
    });
  });

  test("honors an explicit reserved-token override", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(380_000),
      reservedTokenCount: 20_000,
    });

    expect(decision).toMatchObject({
      shouldCompact: true,
      reason: "context_usage_reserved_token_limit_reached",
      contextCompactionTriggerTokenCount: 252_000,
      reservedTokenCount: 20_000,
      triggerKind: "reserved_token_count",
    });
  });

  test("skips compaction when the threshold disables auto-compaction", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(400_000),
      thresholdRatio: 0,
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "auto_compaction_disabled",
    });
  });

  test("skips compaction immediately after a compaction summary", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: [
        ...completedConversationTurnEntries,
        {
          entryKind: "conversation_compaction_summary",
          summaryText: "Goal: continue from compacted context.",
          compactedEntryCount: 2,
          retainedRecentConversationSessionEntryCount: 0,
        },
      ],
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(400_000),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "latest_entry_is_compaction_summary",
      sessionEntryCountAfterLatestCompactionSummary: 0,
    });
  });

  test("requires enough new entries after the latest compaction summary", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: [
        ...completedConversationTurnEntries,
        {
          entryKind: "conversation_compaction_summary",
          summaryText: "Goal: continue from compacted context.",
          compactedEntryCount: 2,
          retainedRecentConversationSessionEntryCount: 0,
        },
        {
          entryKind: "user_prompt",
          promptText: "One new prompt",
          modelFacingPromptText: "One new prompt",
        },
      ],
      selectedModelId: "gpt-5.5",
      latestContextWindowUsage: createTokenUsage(400_000),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "not_enough_entries_after_latest_compaction_summary",
      sessionEntryCountAfterLatestCompactionSummary: 1,
    });
  });
});

describe("calculateContextTokensUsedFromTokenUsage", () => {
  test("uses provider total when available", () => {
    expect(calculateContextTokensUsedFromTokenUsage(createTokenUsage(123))).toBe(123);
  });

  test("falls back to all normalized usage buckets when total is missing", () => {
    expect(
      calculateContextTokensUsedFromTokenUsage({
        input: 100,
        output: 30,
        reasoning: 20,
        cache: { read: 50, write: 7 },
      }),
    ).toBe(207);
  });
});
