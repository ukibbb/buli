import type { ConversationCompactionSummaryConversationSessionEntry, ConversationSessionEntry } from "./conversationSessionEntry.ts";

export type LatestConversationCompactionBoundary = {
  compactionSummaryEntry: ConversationCompactionSummaryConversationSessionEntry;
  compactionSummaryEntryIndex: number;
  retainedRecentConversationSessionEntries: readonly ConversationSessionEntry[];
};

export function findLatestConversationCompactionBoundary(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): LatestConversationCompactionBoundary | undefined {
  const compactionSummaryEntryIndex = conversationSessionEntries.findLastIndex(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "conversation_compaction_summary",
  );
  if (compactionSummaryEntryIndex === -1) {
    return undefined;
  }

  const compactionSummaryEntry = conversationSessionEntries[compactionSummaryEntryIndex];
  if (!compactionSummaryEntry || compactionSummaryEntry.entryKind !== "conversation_compaction_summary") {
    return undefined;
  }

  const retainedRecentConversationSessionEntries = conversationSessionEntries.slice(
    Math.max(0, compactionSummaryEntryIndex - compactionSummaryEntry.retainedRecentConversationSessionEntryCount),
    compactionSummaryEntryIndex,
  );

  return {
    compactionSummaryEntry,
    compactionSummaryEntryIndex,
    retainedRecentConversationSessionEntries,
  };
}

export function listModelVisibleConversationSessionEntries(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): readonly ConversationSessionEntry[] {
  const latestCompactionBoundary = findLatestConversationCompactionBoundary(conversationSessionEntries);
  if (!latestCompactionBoundary) {
    return conversationSessionEntries;
  }

  return [
    latestCompactionBoundary.compactionSummaryEntry,
    ...latestCompactionBoundary.retainedRecentConversationSessionEntries,
    ...conversationSessionEntries.slice(latestCompactionBoundary.compactionSummaryEntryIndex + 1),
  ];
}
