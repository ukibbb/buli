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

test("selectConversationEntriesForCompaction compacts all model-visible entries for clean context", () => {
  const firstTurn = createCompletedConversationTurn({ promptText: "First prompt", assistantMessageText: "First answer" });
  const secondTurn = createCompletedConversationTurn({ promptText: "Second prompt", assistantMessageText: "Second answer" });
  const thirdTurn = createCompletedConversationTurn({ promptText: "Third prompt", assistantMessageText: "Third answer" });

  expect(
    selectConversationEntriesForCompaction({
      conversationSessionEntries: [...firstTurn, ...secondTurn, ...thirdTurn],
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: [...firstTurn, ...secondTurn, ...thirdTurn],
    retainedRecentConversationSessionEntryCount: 0,
  });
});

test("selectConversationEntriesForCompaction defaults to clean context without retained turns", () => {
  const firstTurn = createCompletedConversationTurn({ promptText: "First prompt", assistantMessageText: "First answer" });
  const secondTurn = createCompletedConversationTurn({ promptText: "Second prompt", assistantMessageText: "Second answer" });

  expect(
    selectConversationEntriesForCompaction({
      conversationSessionEntries: [...firstTurn, ...secondTurn],
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: [...firstTurn, ...secondTurn],
    retainedRecentConversationSessionEntryCount: 0,
  });
});

test("selectConversationEntriesForCompaction summarizes only latest summary and new entries after an existing compaction", () => {
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
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: [previousCompactionSummary, ...newTurn],
    retainedRecentConversationSessionEntryCount: 0,
  });
});

test("selectConversationEntriesForCompaction summarizes the only visible turn", () => {
  const onlyTurn = createCompletedConversationTurn({ promptText: "Only prompt", assistantMessageText: "Only answer" });

  expect(
    selectConversationEntriesForCompaction({
      conversationSessionEntries: onlyTurn,
    }),
  ).toEqual({
    compactionSourceConversationSessionEntries: onlyTurn,
    retainedRecentConversationSessionEntryCount: 0,
  });
});
