import { expect, test } from "bun:test";
import {
  loadConversationTranscriptPage,
  type LoadConversationTranscriptEntryRecords,
} from "@buli/chat-app-controller";
import type { ConversationTranscriptEntryRecord } from "@buli/chat-session-state";

test("loadConversationTranscriptPage reads multiple entry chunks to fill one visible page", async () => {
  const conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[] = [
    createHiddenAssistantMessageEntryRecord(0),
    createHiddenAssistantMessageEntryRecord(1),
    createUserPromptEntryRecord(2),
    createHiddenAssistantMessageEntryRecord(3),
    createUserPromptEntryRecord(4),
    createHiddenAssistantMessageEntryRecord(5),
    createUserPromptEntryRecord(6),
  ];
  const entryRecordLoadRequests: Parameters<LoadConversationTranscriptEntryRecords>[0][] = [];
  const loadConversationTranscriptEntryRecords = createConversationTranscriptEntryRecordLoader(
    conversationTranscriptEntryRecords,
    entryRecordLoadRequests,
  );

  const conversationTranscriptPage = await loadConversationTranscriptPage({
    conversationSessionId: "session-a",
    loadEntryRecords: loadConversationTranscriptEntryRecords,
    pageNavigationRequest: { pageNavigationKind: "latest" },
    pageMessageCount: 3,
    entryRecordChunkCount: 2,
  });

  expect(entryRecordLoadRequests.map((request) => request.loadKind)).toEqual(["latest", "before", "before", "before"]);
  expect(entryRecordLoadRequests[1]).toMatchObject({ loadKind: "before", beforeEntrySequence: 5 });
  expect(entryRecordLoadRequests[2]).toMatchObject({ loadKind: "before", beforeEntrySequence: 3 });
  expect(entryRecordLoadRequests[3]).toMatchObject({ loadKind: "before", beforeEntrySequence: 1 });
  expect(conversationTranscriptPage.visibleConversationMessageRows.map((row) => row.firstSourceEntrySequence)).toEqual([2, 4, 6]);
  expect(
    conversationTranscriptPage.conversationTranscriptEntryRecords.map(
      (conversationTranscriptEntryRecord) => conversationTranscriptEntryRecord.entrySequence,
    ),
  ).toEqual([2, 3, 4, 5, 6]);
  expect(conversationTranscriptPage.hasOlderPage).toBe(false);
  expect(conversationTranscriptPage.hasNewerPage).toBe(false);
  expect(conversationTranscriptPage.isLatestPage).toBe(true);
});

test("loadConversationTranscriptPage reports older and newer page boundaries", async () => {
  const conversationTranscriptEntryRecords = Array.from(
    { length: 5 },
    (_, entrySequence) => createUserPromptEntryRecord(entrySequence),
  );
  const loadConversationTranscriptEntryRecords = createConversationTranscriptEntryRecordLoader(
    conversationTranscriptEntryRecords,
  );

  const olderConversationTranscriptPage = await loadConversationTranscriptPage({
    conversationSessionId: "session-a",
    loadEntryRecords: loadConversationTranscriptEntryRecords,
    pageNavigationRequest: { pageNavigationKind: "older", beforeEntrySequence: 4 },
    pageMessageCount: 2,
    entryRecordChunkCount: 2,
  });
  const newerConversationTranscriptPage = await loadConversationTranscriptPage({
    conversationSessionId: "session-a",
    loadEntryRecords: loadConversationTranscriptEntryRecords,
    pageNavigationRequest: { pageNavigationKind: "newer", afterEntrySequence: 1 },
    pageMessageCount: 2,
    entryRecordChunkCount: 2,
  });

  expect(olderConversationTranscriptPage.visibleConversationMessageRows.map((row) => row.firstSourceEntrySequence)).toEqual([2, 3]);
  expect(olderConversationTranscriptPage.hasOlderPage).toBe(true);
  expect(olderConversationTranscriptPage.hasNewerPage).toBe(true);
  expect(olderConversationTranscriptPage.isLatestPage).toBe(false);
  expect(newerConversationTranscriptPage.visibleConversationMessageRows.map((row) => row.firstSourceEntrySequence)).toEqual([2, 3]);
  expect(newerConversationTranscriptPage.hasOlderPage).toBe(true);
  expect(newerConversationTranscriptPage.hasNewerPage).toBe(true);
  expect(newerConversationTranscriptPage.isLatestPage).toBe(false);
});

test("loadConversationTranscriptPage normalizes invalid page and chunk counts", async () => {
  const conversationTranscriptEntryRecords = Array.from(
    { length: 3 },
    (_, entrySequence) => createUserPromptEntryRecord(entrySequence),
  );
  const loadConversationTranscriptEntryRecords = createConversationTranscriptEntryRecordLoader(
    conversationTranscriptEntryRecords,
  );

  const conversationTranscriptPage = await loadConversationTranscriptPage({
    conversationSessionId: "session-a",
    loadEntryRecords: loadConversationTranscriptEntryRecords,
    pageNavigationRequest: { pageNavigationKind: "latest" },
    pageMessageCount: 0,
    entryRecordChunkCount: 0,
  });

  expect(conversationTranscriptPage.pageMessageCount).toBe(100);
  expect(conversationTranscriptPage.visibleConversationMessageRows.map((row) => row.firstSourceEntrySequence)).toEqual([0, 1, 2]);
  expect(conversationTranscriptPage.hasOlderPage).toBe(false);
  expect(conversationTranscriptPage.isLatestPage).toBe(true);
});

test("loadConversationTranscriptPage skips hidden-only records when navigating newer", async () => {
  const conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[] = [
    {
      entrySequence: 0,
      conversationSessionEntry: {
        entryKind: "user_prompt",
        promptText: "Older visible prompt",
        modelFacingPromptText: "Older visible prompt",
      },
    },
    {
      entrySequence: 1,
      conversationSessionEntry: {
        entryKind: "assistant_message",
        assistantMessageStatus: "completed",
        assistantMessageText: "",
      },
    },
    {
      entrySequence: 2,
      conversationSessionEntry: {
        entryKind: "user_prompt",
        promptText: "Newer visible prompt",
        modelFacingPromptText: "Newer visible prompt",
      },
    },
  ];
  const loadConversationTranscriptEntryRecords = createConversationTranscriptEntryRecordLoader(
    conversationTranscriptEntryRecords,
  );

  const olderConversationTranscriptPage = await loadConversationTranscriptPage({
    conversationSessionId: "session-a",
    loadEntryRecords: loadConversationTranscriptEntryRecords,
    pageNavigationRequest: { pageNavigationKind: "older", beforeEntrySequence: 2 },
    pageMessageCount: 1,
    entryRecordChunkCount: 1,
  });
  const newerConversationTranscriptPage = await loadConversationTranscriptPage({
    conversationSessionId: "session-a",
    loadEntryRecords: loadConversationTranscriptEntryRecords,
    pageNavigationRequest: {
      pageNavigationKind: "newer",
      afterEntrySequence: olderConversationTranscriptPage.lastSourceEntrySequence ?? -1,
    },
    pageMessageCount: 1,
    entryRecordChunkCount: 1,
  });

  expect(olderConversationTranscriptPage.visibleConversationMessageRows).toHaveLength(1);
  expect(olderConversationTranscriptPage.visibleConversationMessageRows[0]?.firstSourceEntrySequence).toBe(0);
  expect(newerConversationTranscriptPage.visibleConversationMessageRows).toHaveLength(1);
  expect(newerConversationTranscriptPage.visibleConversationMessageRows[0]?.firstSourceEntrySequence).toBe(2);
});

function createConversationTranscriptEntryRecordLoader(
  conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[],
  entryRecordLoadRequests: Parameters<LoadConversationTranscriptEntryRecords>[0][] = [],
): LoadConversationTranscriptEntryRecords {
  return (request) => {
    entryRecordLoadRequests.push(request);
    if (request.loadKind === "latest") {
      const entryRecords = conversationTranscriptEntryRecords.slice(-request.limit);
      return {
        conversationSessionId: request.conversationSessionId,
        entryRecords,
        hasOlderEntries: conversationTranscriptEntryRecords.length > request.limit,
        hasNewerEntries: false,
        latestCompactionSummaryEntrySequence: undefined,
      };
    }

    if (request.loadKind === "before") {
      const olderConversationTranscriptEntryRecords = conversationTranscriptEntryRecords.filter(
        (conversationTranscriptEntryRecord) => conversationTranscriptEntryRecord.entrySequence < request.beforeEntrySequence,
      );
      return {
        conversationSessionId: request.conversationSessionId,
        entryRecords: olderConversationTranscriptEntryRecords.slice(-request.limit),
        hasOlderEntries: olderConversationTranscriptEntryRecords.length > request.limit,
        hasNewerEntries: true,
        latestCompactionSummaryEntrySequence: undefined,
      };
    }

    const newerConversationTranscriptEntryRecords = conversationTranscriptEntryRecords.filter(
      (conversationTranscriptEntryRecord) => conversationTranscriptEntryRecord.entrySequence > request.afterEntrySequence,
    );
    return {
      conversationSessionId: request.conversationSessionId,
      entryRecords: newerConversationTranscriptEntryRecords.slice(0, request.limit),
      hasOlderEntries: true,
      hasNewerEntries: newerConversationTranscriptEntryRecords.length > request.limit,
      latestCompactionSummaryEntrySequence: undefined,
    };
  };
}

function createUserPromptEntryRecord(entrySequence: number): ConversationTranscriptEntryRecord {
  return {
    entrySequence,
    conversationSessionEntry: {
      entryKind: "user_prompt",
      promptText: `Prompt ${entrySequence}`,
      modelFacingPromptText: `Prompt ${entrySequence}`,
    },
  };
}

function createHiddenAssistantMessageEntryRecord(entrySequence: number): ConversationTranscriptEntryRecord {
  return {
    entrySequence,
    conversationSessionEntry: {
      entryKind: "assistant_message",
      assistantMessageStatus: "completed",
      assistantMessageText: "",
    },
  };
}
