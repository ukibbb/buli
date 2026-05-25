import {
  listModelVisibleConversationSessionEntries,
  type ConversationSessionEntry,
} from "@buli/contracts";

export type ConversationEntriesForCompactionSelection = {
  compactionSourceConversationSessionEntries: readonly ConversationSessionEntry[];
  retainedRecentConversationSessionEntryCount: number;
};

export function selectConversationEntriesForCompaction(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
}): ConversationEntriesForCompactionSelection {
  const modelVisibleConversationSessionEntries = listModelVisibleConversationSessionEntries(input.conversationSessionEntries);
  return {
    compactionSourceConversationSessionEntries: modelVisibleConversationSessionEntries,
    retainedRecentConversationSessionEntryCount: 0,
  };
}
