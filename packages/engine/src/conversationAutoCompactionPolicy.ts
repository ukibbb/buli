import type { ConversationSessionEntry, ReasoningEffort, TokenUsage } from "@buli/contracts";
import { lookupContextWindowTokenCapacityForModel } from "./modelContextWindowCapacity.ts";

export const DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO = 0.75;
export const DEFAULT_MINIMUM_SESSION_ENTRY_COUNT_AFTER_LATEST_COMPACTION_SUMMARY = 2;

export type ConversationAutoCompactionRequest = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  latestTokenUsage: TokenUsage;
};

export type ConversationAutoCompactionPolicyInput = ConversationAutoCompactionRequest & {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  thresholdRatio?: number;
  minimumSessionEntryCountAfterLatestCompactionSummary?: number;
};

export type ConversationAutoCompactionDecisionReason =
  | "auto_compaction_disabled"
  | "context_usage_below_threshold"
  | "context_usage_threshold_reached"
  | "latest_entry_is_compaction_summary"
  | "not_enough_entries_after_latest_compaction_summary"
  | "unknown_context_window";

export type ConversationAutoCompactionDecision = {
  shouldCompact: boolean;
  reason: ConversationAutoCompactionDecisionReason;
  selectedModelId: string;
  thresholdRatio: number;
  contextTokensUsed: number;
  contextUsageRatio: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  sessionEntryCountAfterLatestCompactionSummary: number;
};

export type ConversationAutoCompactionResult =
  | {
      didCompact: false;
      decision: ConversationAutoCompactionDecision;
    }
  | {
      didCompact: true;
      decision: ConversationAutoCompactionDecision;
      conversationSessionEntries: readonly ConversationSessionEntry[];
    };

// The researched agents converge on the same shape: Codex/goose trigger from a
// usage threshold, pi-mono keeps compaction as a non-destructive checkpoint, and
// OpenCode/KiloCode surface compaction as an explicit history marker. Keeping
// this as a pure policy lets the CLI own user configuration while the runtime
// reuses the manual append-only compaction path.
export function decideConversationAutoCompaction(
  input: ConversationAutoCompactionPolicyInput,
): ConversationAutoCompactionDecision {
  const thresholdRatio = input.thresholdRatio ?? DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO;
  const contextTokensUsed = calculateContextTokensUsedFromTokenUsage(input.latestTokenUsage);
  const latestCompactionSummaryEntryIndex = findLatestCompactionSummaryEntryIndex(input.conversationSessionEntries);
  const sessionEntryCountAfterLatestCompactionSummary = countSessionEntriesAfterLatestCompactionSummary({
    conversationSessionEntries: input.conversationSessionEntries,
    latestCompactionSummaryEntryIndex,
  });

  const baseDecision = {
    selectedModelId: input.selectedModelId,
    thresholdRatio,
    contextTokensUsed,
    contextWindowTokenCapacity: undefined,
    contextUsageRatio: undefined,
    sessionEntryCountAfterLatestCompactionSummary,
  } satisfies Omit<ConversationAutoCompactionDecision, "reason" | "shouldCompact">;

  if (thresholdRatio <= 0 || thresholdRatio >= 1) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "auto_compaction_disabled",
    };
  }

  if (input.conversationSessionEntries.at(-1)?.entryKind === "conversation_compaction_summary") {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "latest_entry_is_compaction_summary",
    };
  }

  const minimumSessionEntryCountAfterLatestCompactionSummary =
    input.minimumSessionEntryCountAfterLatestCompactionSummary ??
      DEFAULT_MINIMUM_SESSION_ENTRY_COUNT_AFTER_LATEST_COMPACTION_SUMMARY;
  if (sessionEntryCountAfterLatestCompactionSummary < minimumSessionEntryCountAfterLatestCompactionSummary) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "not_enough_entries_after_latest_compaction_summary",
    };
  }

  const contextWindowTokenCapacity = lookupContextWindowTokenCapacityForModel(input.selectedModelId);
  if (contextWindowTokenCapacity === undefined) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "unknown_context_window",
    };
  }

  const contextUsageRatio = contextTokensUsed / contextWindowTokenCapacity;
  if (contextUsageRatio < thresholdRatio) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "context_usage_below_threshold",
      contextWindowTokenCapacity,
      contextUsageRatio,
    };
  }

  return {
    ...baseDecision,
    shouldCompact: true,
    reason: "context_usage_threshold_reached",
    contextWindowTokenCapacity,
    contextUsageRatio,
  };
}

export function calculateContextTokensUsedFromTokenUsage(tokenUsage: TokenUsage): number {
  return tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning + tokenUsage.cache.read + tokenUsage.cache.write;
}

function findLatestCompactionSummaryEntryIndex(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): number {
  return conversationSessionEntries.findLastIndex(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "conversation_compaction_summary",
  );
}

function countSessionEntriesAfterLatestCompactionSummary(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  latestCompactionSummaryEntryIndex: number;
}): number {
  if (input.latestCompactionSummaryEntryIndex === -1) {
    return input.conversationSessionEntries.length;
  }

  return input.conversationSessionEntries.length - input.latestCompactionSummaryEntryIndex - 1;
}
