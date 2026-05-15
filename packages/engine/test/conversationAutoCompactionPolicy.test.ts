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
  test("compacts when known context usage reaches the configured threshold", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestTokenUsage: createTokenUsage(300_000),
    });

    expect(decision).toMatchObject({
      shouldCompact: true,
      reason: "context_usage_threshold_reached",
      contextTokensUsed: 300_000,
      contextWindowTokenCapacity: 400_000,
      contextUsageRatio: 0.75,
      thresholdRatio: 0.75,
      sessionEntryCountAfterLatestCompactionSummary: 2,
    });
  });

  test("skips compaction below the usage threshold", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestTokenUsage: createTokenUsage(299_999),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "context_usage_below_threshold",
      contextWindowTokenCapacity: 400_000,
    });
  });

  test("skips compaction for unknown model context windows", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "unknown-model",
      latestTokenUsage: createTokenUsage(300_000),
    });

    expect(decision).toMatchObject({
      shouldCompact: false,
      reason: "unknown_context_window",
      contextWindowTokenCapacity: undefined,
      contextUsageRatio: undefined,
    });
  });

  test("skips compaction when the threshold disables auto-compaction", () => {
    const decision = decideConversationAutoCompaction({
      conversationSessionEntries: completedConversationTurnEntries,
      selectedModelId: "gpt-5.5",
      latestTokenUsage: createTokenUsage(400_000),
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
        },
      ],
      selectedModelId: "gpt-5.5",
      latestTokenUsage: createTokenUsage(400_000),
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
        },
        {
          entryKind: "user_prompt",
          promptText: "One new prompt",
          modelFacingPromptText: "One new prompt",
        },
      ],
      selectedModelId: "gpt-5.5",
      latestTokenUsage: createTokenUsage(400_000),
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
