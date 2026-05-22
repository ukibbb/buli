import type { ConversationSessionEntry, ReasoningEffort, TokenUsage } from "@buli/contracts";
import { lookupContextWindowTokenCapacityForModel } from "../modelContextWindowCapacity.ts";

export const DEFAULT_CONVERSATION_AUTO_COMPACTION_RESERVED_TOKEN_COUNT = 20_000;
export const DEFAULT_UNKNOWN_GPT_5_CONTEXT_WINDOW_TOKEN_CAPACITY = 256_000;
export const DEFAULT_MINIMUM_SESSION_ENTRY_COUNT_AFTER_LATEST_COMPACTION_SUMMARY = 2;

export type ConversationAutoCompactionRequest = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  latestContextWindowUsage: TokenUsage;
};

export type ConversationAutoCompactionPolicyInput = ConversationAutoCompactionRequest & {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  thresholdRatio?: number | undefined;
  reservedTokenCount?: number | undefined;
  minimumSessionEntryCountAfterLatestCompactionSummary?: number;
};

export type ConversationAutoCompactionDecisionReason =
  | "auto_compaction_disabled"
  | "context_usage_below_reserved_token_limit"
  | "context_usage_below_threshold"
  | "context_usage_reserved_token_limit_reached"
  | "context_usage_threshold_reached"
  | "latest_entry_is_compaction_summary"
  | "model_not_eligible_for_auto_compaction"
  | "not_enough_entries_after_latest_compaction_summary"
  | "unknown_context_window";

export type ConversationAutoCompactionTriggerKind = "reserved_token_count" | "threshold_ratio";

export type ConversationAutoCompactionDecision = {
  shouldCompact: boolean;
  reason: ConversationAutoCompactionDecisionReason;
  selectedModelId: string;
  contextTokensUsed: number;
  contextUsageRatio: number | undefined;
  contextWindowTokenCapacity: number | undefined;
  contextCompactionTriggerTokenCount: number | undefined;
  reservedTokenCount: number | undefined;
  thresholdRatio: number | undefined;
  triggerKind: ConversationAutoCompactionTriggerKind | undefined;
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

export function decideConversationAutoCompaction(
  input: ConversationAutoCompactionPolicyInput,
): ConversationAutoCompactionDecision {
  const contextTokensUsed = calculateContextTokensUsedFromTokenUsage(input.latestContextWindowUsage);
  const latestCompactionSummaryEntryIndex = findLatestCompactionSummaryEntryIndex(input.conversationSessionEntries);
  const sessionEntryCountAfterLatestCompactionSummary = countSessionEntriesAfterLatestCompactionSummary({
    conversationSessionEntries: input.conversationSessionEntries,
    latestCompactionSummaryEntryIndex,
  });
  const contextWindowTokenCapacity = resolveAutoCompactionContextWindowTokenCapacity(input.selectedModelId);
  const contextUsageRatio = contextWindowTokenCapacity === undefined ? undefined : contextTokensUsed / contextWindowTokenCapacity;
  const baseDecision = {
    selectedModelId: input.selectedModelId,
    contextTokensUsed,
    contextWindowTokenCapacity,
    contextUsageRatio,
    contextCompactionTriggerTokenCount: undefined,
    reservedTokenCount: undefined,
    thresholdRatio: input.thresholdRatio,
    triggerKind: undefined,
    sessionEntryCountAfterLatestCompactionSummary,
  } satisfies Omit<ConversationAutoCompactionDecision, "reason" | "shouldCompact">;

  if (!isGpt5ModelIdentifier(input.selectedModelId)) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "model_not_eligible_for_auto_compaction",
    };
  }

  if (input.thresholdRatio !== undefined && (input.thresholdRatio <= 0 || input.thresholdRatio >= 1)) {
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

  if (contextWindowTokenCapacity === undefined) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "unknown_context_window",
    };
  }

  if (input.thresholdRatio !== undefined) {
    const thresholdTriggerTokenCount = Math.floor(contextWindowTokenCapacity * input.thresholdRatio);
    return {
      ...baseDecision,
      contextCompactionTriggerTokenCount: thresholdTriggerTokenCount,
      triggerKind: "threshold_ratio",
      shouldCompact: contextTokensUsed >= thresholdTriggerTokenCount,
      reason: contextTokensUsed >= thresholdTriggerTokenCount
        ? "context_usage_threshold_reached"
        : "context_usage_below_threshold",
    };
  }

  const reservedTokenCount = input.reservedTokenCount ?? DEFAULT_CONVERSATION_AUTO_COMPACTION_RESERVED_TOKEN_COUNT;
  const reservedTokenTriggerTokenCount = Math.max(0, contextWindowTokenCapacity - reservedTokenCount);
  return {
    ...baseDecision,
    contextCompactionTriggerTokenCount: reservedTokenTriggerTokenCount,
    reservedTokenCount,
    triggerKind: "reserved_token_count",
    shouldCompact: contextTokensUsed >= reservedTokenTriggerTokenCount,
    reason: contextTokensUsed >= reservedTokenTriggerTokenCount
      ? "context_usage_reserved_token_limit_reached"
      : "context_usage_below_reserved_token_limit",
  };
}

export function calculateContextTokensUsedFromTokenUsage(tokenUsage: TokenUsage): number {
  return tokenUsage.total ?? tokenUsage.input + tokenUsage.output + tokenUsage.reasoning + tokenUsage.cache.read + tokenUsage.cache.write;
}

export function isGpt5ModelIdentifier(modelIdentifier: string): boolean {
  const normalizedModelIdentifier = modelIdentifier.toLowerCase();
  return normalizedModelIdentifier === "gpt-5" ||
    normalizedModelIdentifier.startsWith("gpt-5.") ||
    normalizedModelIdentifier.startsWith("gpt-5-");
}

function resolveAutoCompactionContextWindowTokenCapacity(modelIdentifier: string): number | undefined {
  if (!isGpt5ModelIdentifier(modelIdentifier)) {
    return lookupContextWindowTokenCapacityForModel(modelIdentifier);
  }

  return lookupContextWindowTokenCapacityForModel(modelIdentifier) ?? DEFAULT_UNKNOWN_GPT_5_CONTEXT_WINDOW_TOKEN_CAPACITY;
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
