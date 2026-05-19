import {
  findLatestConversationCompactionBoundary,
  listModelVisibleConversationSessionEntries,
  type ConversationSessionEntry,
} from "@buli/contracts";

export const DEFAULT_RETAINED_RECENT_CONVERSATION_TURN_COUNT = 2;

type CompleteConversationTurn = {
  startEntryIndex: number;
  endEntryIndexExclusive: number;
};

export type ConversationEntriesForCompactionSelection = {
  compactionSourceConversationSessionEntries: readonly ConversationSessionEntry[];
  retainedRecentConversationSessionEntries: readonly ConversationSessionEntry[];
  retainedRecentConversationSessionEntryCount: number;
};

export function selectConversationEntriesForCompaction(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  retainedRecentConversationTurnCount?: number | undefined;
}): ConversationEntriesForCompactionSelection {
  const retainedRecentConversationTurnCount = input.retainedRecentConversationTurnCount ??
    DEFAULT_RETAINED_RECENT_CONVERSATION_TURN_COUNT;
  const modelVisibleConversationSessionEntries = listModelVisibleConversationSessionEntries(input.conversationSessionEntries);
  const retainedRecentConversationSessionEntries = selectRetainedRecentConversationSessionEntries({
    conversationSessionEntries: input.conversationSessionEntries,
    retainedRecentConversationTurnCount,
  });
  const retainedRecentConversationSessionEntrySet = new Set(retainedRecentConversationSessionEntries);
  const compactionSourceConversationSessionEntries = modelVisibleConversationSessionEntries.filter(
    (conversationSessionEntry) => !retainedRecentConversationSessionEntrySet.has(conversationSessionEntry),
  );

  if (compactionSourceConversationSessionEntries.length === 0) {
    return {
      compactionSourceConversationSessionEntries: modelVisibleConversationSessionEntries,
      retainedRecentConversationSessionEntries: [],
      retainedRecentConversationSessionEntryCount: 0,
    };
  }

  return {
    compactionSourceConversationSessionEntries,
    retainedRecentConversationSessionEntries,
    retainedRecentConversationSessionEntryCount: retainedRecentConversationSessionEntries.length,
  };
}

function selectRetainedRecentConversationSessionEntries(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  retainedRecentConversationTurnCount: number;
}): readonly ConversationSessionEntry[] {
  if (input.retainedRecentConversationTurnCount <= 0) {
    return [];
  }

  const latestCompactionBoundary = findLatestConversationCompactionBoundary(input.conversationSessionEntries);
  const entriesAfterLatestCompactionSummary = latestCompactionBoundary
    ? input.conversationSessionEntries.slice(latestCompactionBoundary.compactionSummaryEntryIndex + 1)
    : input.conversationSessionEntries;
  const completeConversationTurns = listCompleteConversationTurns(entriesAfterLatestCompactionSummary);
  if (completeConversationTurns.length === 0) {
    return [];
  }

  const retainedCompleteConversationTurns = completeConversationTurns.slice(-input.retainedRecentConversationTurnCount);
  const firstRetainedTurn = retainedCompleteConversationTurns[0];
  if (!firstRetainedTurn) {
    return [];
  }

  return entriesAfterLatestCompactionSummary.slice(firstRetainedTurn.startEntryIndex);
}

function listCompleteConversationTurns(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): readonly CompleteConversationTurn[] {
  const completeConversationTurns: CompleteConversationTurn[] = [];
  let currentUserPromptEntryIndex: number | undefined;

  for (const [conversationSessionEntryIndex, conversationSessionEntry] of conversationSessionEntries.entries()) {
    if (conversationSessionEntry.entryKind === "user_prompt") {
      currentUserPromptEntryIndex = conversationSessionEntryIndex;
      continue;
    }

    if (
      currentUserPromptEntryIndex !== undefined &&
      conversationSessionEntry.entryKind === "assistant_message" &&
      conversationSessionEntry.assistantMessageStatus !== "failed" &&
      conversationSessionEntry.assistantMessageStatus !== "interrupted"
    ) {
      completeConversationTurns.push({
        startEntryIndex: currentUserPromptEntryIndex,
        endEntryIndexExclusive: conversationSessionEntryIndex + 1,
      });
      currentUserPromptEntryIndex = undefined;
    }
  }

  return completeConversationTurns;
}
