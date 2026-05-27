import {
  calculateContextTokensUsedFromTokenUsage,
  lookupModelContextWindowTokenLimitsForModel,
  type ConversationSessionEntry,
  type ReasoningEffort,
  type TokenUsage,
} from "@buli/contracts";

export const DEFAULT_CONVERSATION_AUTO_COMPACTION_RESERVED_TOKEN_COUNT = 20_000;
export const DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO = 0.8;
export const DEFAULT_MINIMUM_SESSION_ENTRY_COUNT_AFTER_LATEST_COMPACTION_SUMMARY = 2;

export type ConversationAutoCompactionRequestTriggerKind = "context_usage" | "context_window_overflow";

export type ConversationAutoCompactionRequest = {
  selectedModelId: string;
  selectedReasoningEffort?: ReasoningEffort;
  latestContextWindowUsage?: TokenUsage | undefined;
  requestTriggerKind?: ConversationAutoCompactionRequestTriggerKind | undefined;
  onCompactionSummaryTextUpdated?: (summaryText: string) => void;
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
  | "context_window_overflow"
  | "context_usage_reserved_token_limit_reached"
  | "context_usage_threshold_reached"
  | "latest_entry_is_compaction_summary"
  | "model_not_eligible_for_auto_compaction"
  | "not_enough_entries_after_latest_compaction_summary"
  | "unknown_context_window";

export type ConversationAutoCompactionTriggerKind = "reserved_token_count" | "threshold_ratio" | "context_window_overflow";

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
  const contextTokensUsed = input.latestContextWindowUsage
    ? calculateContextTokensUsedFromTokenUsage(input.latestContextWindowUsage)
    : 0;
  const latestCompactionSummaryEntryIndex = findLatestCompactionSummaryEntryIndex(input.conversationSessionEntries);
  const sessionEntryCountAfterLatestCompactionSummary = countSessionEntriesAfterLatestCompactionSummary({
    conversationSessionEntries: input.conversationSessionEntries,
    latestCompactionSummaryEntryIndex,
  });
  const modelContextWindowTokenLimits = lookupModelContextWindowTokenLimitsForModel(input.selectedModelId);
  const contextWindowTokenCapacity = modelContextWindowTokenLimits?.contextWindowTokenCapacity;
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

  if (input.requestTriggerKind === "context_window_overflow") {
    return {
      ...baseDecision,
      shouldCompact: true,
      reason: "context_window_overflow",
      triggerKind: "context_window_overflow",
      thresholdRatio: input.thresholdRatio ?? DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO,
    };
  }

  if (contextWindowTokenCapacity === undefined) {
    return {
      ...baseDecision,
      shouldCompact: false,
      reason: "unknown_context_window",
    };
  }

  if (input.reservedTokenCount !== undefined) {
    const reservedTokenTriggerTokenCount = calculateReservedTokenTriggerTokenCount({
      contextWindowTokenCapacity,
      inputTokenCapacity: modelContextWindowTokenLimits?.inputTokenCapacity,
      preferredContextPerformanceBudgetTokenCount: modelContextWindowTokenLimits?.preferredContextPerformanceBudgetTokenCount,
      reservedTokenCount: input.reservedTokenCount,
    });
    return {
      ...baseDecision,
      contextCompactionTriggerTokenCount: reservedTokenTriggerTokenCount,
      reservedTokenCount: input.reservedTokenCount,
      triggerKind: "reserved_token_count",
      shouldCompact: contextTokensUsed >= reservedTokenTriggerTokenCount,
      reason: contextTokensUsed >= reservedTokenTriggerTokenCount
        ? "context_usage_reserved_token_limit_reached"
        : "context_usage_below_reserved_token_limit",
    };
  }

  const thresholdRatio = input.thresholdRatio ?? DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO;
  const thresholdTriggerTokenCount = calculateThresholdTokenTriggerTokenCount({
    contextWindowTokenCapacity,
    inputTokenCapacity: modelContextWindowTokenLimits?.inputTokenCapacity,
    preferredContextPerformanceBudgetTokenCount: modelContextWindowTokenLimits?.preferredContextPerformanceBudgetTokenCount,
    thresholdRatio,
    reservedTokenCount: DEFAULT_CONVERSATION_AUTO_COMPACTION_RESERVED_TOKEN_COUNT,
  });
  return {
    ...baseDecision,
    contextCompactionTriggerTokenCount: thresholdTriggerTokenCount,
    thresholdRatio,
    triggerKind: "threshold_ratio",
    shouldCompact: contextTokensUsed >= thresholdTriggerTokenCount,
    reason: contextTokensUsed >= thresholdTriggerTokenCount
      ? "context_usage_threshold_reached"
      : "context_usage_below_threshold",
  };
}

export function lookupDefaultConversationAutoCompactionTriggerTokenCountForModel(
  modelIdentifier: string,
): number | undefined {
  const modelContextWindowTokenLimits = lookupModelContextWindowTokenLimitsForModel(modelIdentifier);
  if (!modelContextWindowTokenLimits) {
    return undefined;
  }

  return calculateThresholdTokenTriggerTokenCount({
    contextWindowTokenCapacity: modelContextWindowTokenLimits.contextWindowTokenCapacity,
    inputTokenCapacity: modelContextWindowTokenLimits.inputTokenCapacity,
    preferredContextPerformanceBudgetTokenCount: modelContextWindowTokenLimits.preferredContextPerformanceBudgetTokenCount,
    thresholdRatio: DEFAULT_CONVERSATION_AUTO_COMPACTION_THRESHOLD_RATIO,
    reservedTokenCount: DEFAULT_CONVERSATION_AUTO_COMPACTION_RESERVED_TOKEN_COUNT,
  });
}

function calculateThresholdTokenTriggerTokenCount(input: {
  contextWindowTokenCapacity: number;
  inputTokenCapacity?: number | undefined;
  preferredContextPerformanceBudgetTokenCount?: number | undefined;
  thresholdRatio: number;
  reservedTokenCount: number;
}): number {
  const rawContextThresholdTokenCount = Math.floor(input.contextWindowTokenCapacity * input.thresholdRatio);
  const inputCapacityTriggerTokenCount = calculateReservedHeadroomTriggerTokenCount({
    tokenCapacity: input.inputTokenCapacity,
    reservedTokenCount: input.reservedTokenCount,
  });
  const preferredPerformanceBudgetTriggerTokenCount = calculateReservedHeadroomTriggerTokenCount({
    tokenCapacity: input.preferredContextPerformanceBudgetTokenCount,
    reservedTokenCount: input.reservedTokenCount,
  });

  return minDefinedTokenCount([
    rawContextThresholdTokenCount,
    inputCapacityTriggerTokenCount,
    preferredPerformanceBudgetTriggerTokenCount,
  ]);
}

function calculateReservedTokenTriggerTokenCount(input: {
  contextWindowTokenCapacity: number;
  inputTokenCapacity?: number | undefined;
  preferredContextPerformanceBudgetTokenCount?: number | undefined;
  reservedTokenCount: number;
}): number {
  const rawContextTriggerTokenCount = Math.max(0, input.contextWindowTokenCapacity - input.reservedTokenCount);
  const inputCapacityTriggerTokenCount = calculateReservedHeadroomTriggerTokenCount({
    tokenCapacity: input.inputTokenCapacity,
    reservedTokenCount: input.reservedTokenCount,
  });
  const preferredPerformanceBudgetTriggerTokenCount = calculateReservedHeadroomTriggerTokenCount({
    tokenCapacity: input.preferredContextPerformanceBudgetTokenCount,
    reservedTokenCount: input.reservedTokenCount,
  });

  return minDefinedTokenCount([
    rawContextTriggerTokenCount,
    inputCapacityTriggerTokenCount,
    preferredPerformanceBudgetTriggerTokenCount,
  ]);
}

function calculateReservedHeadroomTriggerTokenCount(input: {
  tokenCapacity?: number | undefined;
  reservedTokenCount: number;
}): number | undefined {
  return input.tokenCapacity === undefined
    ? undefined
    : Math.max(0, input.tokenCapacity - input.reservedTokenCount);
}

function minDefinedTokenCount(tokenCounts: readonly (number | undefined)[]): number {
  const definedTokenCounts = tokenCounts.filter((tokenCount): tokenCount is number => tokenCount !== undefined);
  if (definedTokenCounts.length === 0) {
    throw new Error("Cannot calculate a token trigger without at least one token count.");
  }

  return Math.min(...definedTokenCounts);
}

export { calculateContextTokensUsedFromTokenUsage } from "@buli/contracts";

export function isGpt5ModelIdentifier(modelIdentifier: string): boolean {
  const normalizedModelIdentifier = modelIdentifier.toLowerCase();
  return normalizedModelIdentifier === "gpt-5" ||
    normalizedModelIdentifier.startsWith("gpt-5.") ||
    normalizedModelIdentifier.startsWith("gpt-5-");
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
