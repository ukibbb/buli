import { expect, test } from "bun:test";
import type { ConversationSessionEntry } from "@buli/contracts";
import { selectConversationEntriesForCompaction } from "../src/index.ts";

function createCompletedConversationTurn(input: {
  promptText: string;
  assistantMessageText: string;
}): readonly ConversationSessionEntry[] {
  return [
    {
      entryKind: "user_prompt",
      promptText: input.promptText,
      modelFacingPromptText: input.promptText,
    },
    {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: input.assistantMessageText,
    },
  ];
}

test("selectConversationEntriesForCompaction summarizes old head and keeps recent complete turns", () => {
  const firstTurn = createCompletedConversationTurn({ promptText: "First prompt", assistantMessageText: "First answer" });
  const secondTurn = createCompletedConversationTurn({ promptText: "Second prompt", assistantMessageText: "Second answer" });
  const thirdTurn = createCompletedConversationTurn({ promptText: "Third prompt", assistantMessageText: "Third answer" });

  expect(
    selectConversationEntriesForCompaction({
      conversationSessionEntries: [...firstTurn, ...secondTurn, ...thirdTurn],
      retainedRecentConversationTurnCount: 2,
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: firstTurn,
    retainedRecentConversationSessionEntries: [...secondTurn, ...thirdTurn],
    retainedRecentConversationSessionEntryCount: 4,
  });
});

test("selectConversationEntriesForCompaction keeps new entries after an existing compaction as the new tail", () => {
  const oldRetainedTurn = createCompletedConversationTurn({ promptText: "Old retained prompt", assistantMessageText: "Old retained answer" });
  const newTurn = createCompletedConversationTurn({ promptText: "New prompt", assistantMessageText: "New answer" });
  const previousCompactionSummary: ConversationSessionEntry = {
    entryKind: "conversation_compaction_summary",
    summaryText: "Goal: continue from the previous summary.",
    compactedEntryCount: 2,
    retainedRecentConversationSessionEntryCount: oldRetainedTurn.length,
  };

  expect(
    selectConversationEntriesForCompaction({
      conversationSessionEntries: [...oldRetainedTurn, previousCompactionSummary, ...newTurn],
      retainedRecentConversationTurnCount: 2,
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: [previousCompactionSummary, ...oldRetainedTurn],
    retainedRecentConversationSessionEntries: newTurn,
    retainedRecentConversationSessionEntryCount: 2,
  });
});

test("selectConversationEntriesForCompaction summarizes everything when the retained tail would be the whole context", () => {
  const onlyTurn = createCompletedConversationTurn({ promptText: "Only prompt", assistantMessageText: "Only answer" });

  expect(
    selectConversationEntriesForCompaction({
      conversationSessionEntries: onlyTurn,
      retainedRecentConversationTurnCount: 2,
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: onlyTurn,
    retainedRecentConversationSessionEntries: [],
    retainedRecentConversationSessionEntryCount: 0,
  });
});
