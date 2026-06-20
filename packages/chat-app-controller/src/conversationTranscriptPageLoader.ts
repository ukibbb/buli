import {
  hydrateConversationTranscriptRowsFromEntryRecords,
  isConversationTranscriptPageRowVisibleInTranscript,
  type ConversationTranscriptEntryRecord,
  type ConversationTranscriptPageRow,
} from "@buli/chat-session-state";

export const DEFAULT_CONVERSATION_TRANSCRIPT_PAGE_MESSAGE_COUNT = 100;
export const DEFAULT_CONVERSATION_TRANSCRIPT_ENTRY_RECORD_CHUNK_COUNT = 400;

export type ConversationTranscriptEntryRecordLoadRequest = {
  conversationSessionId: string;
  limit: number;
} & (
  | { loadKind: "latest" }
  | { loadKind: "before"; beforeEntrySequence: number }
  | { loadKind: "after"; afterEntrySequence: number }
);

export type ConversationTranscriptEntryRecordLoadResult = {
  conversationSessionId: string;
  entryRecords: readonly ConversationTranscriptEntryRecord[];
  hasOlderEntries: boolean;
  hasNewerEntries: boolean;
  latestCompactionSummaryEntrySequence: number | undefined;
};

export type LoadConversationTranscriptEntryRecords = (
  request: ConversationTranscriptEntryRecordLoadRequest,
) => Promise<ConversationTranscriptEntryRecordLoadResult> | ConversationTranscriptEntryRecordLoadResult;

export type ConversationTranscriptPageNavigationRequest =
  | { pageNavigationKind: "latest" }
  | { pageNavigationKind: "older"; beforeEntrySequence: number }
  | { pageNavigationKind: "newer"; afterEntrySequence: number };

export type ConversationTranscriptPage = {
  conversationSessionId: string;
  conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[];
  visibleConversationMessageRows: readonly ConversationTranscriptPageRow[];
  pageMessageCount: number;
  hasOlderPage: boolean;
  hasNewerPage: boolean;
  isLatestPage: boolean;
  firstSourceEntrySequence: number | undefined;
  lastSourceEntrySequence: number | undefined;
  latestCompactionSummaryEntrySequence: number | undefined;
  loadedEntryRecordCount: number;
};

export async function loadConversationTranscriptPage(input: {
  conversationSessionId: string;
  loadEntryRecords: LoadConversationTranscriptEntryRecords;
  pageNavigationRequest: ConversationTranscriptPageNavigationRequest;
  pageMessageCount?: number | undefined;
  entryRecordChunkCount?: number | undefined;
}): Promise<ConversationTranscriptPage> {
  const pageMessageCount = normalizePositiveInteger(
    input.pageMessageCount,
    DEFAULT_CONVERSATION_TRANSCRIPT_PAGE_MESSAGE_COUNT,
  );
  const entryRecordChunkCount = normalizePositiveInteger(
    input.entryRecordChunkCount,
    DEFAULT_CONVERSATION_TRANSCRIPT_ENTRY_RECORD_CHUNK_COUNT,
  );
  const accumulatedEntryRecordLoad = await loadEnoughEntryRecordsForTranscriptPage({
    conversationSessionId: input.conversationSessionId,
    loadEntryRecords: input.loadEntryRecords,
    pageNavigationRequest: input.pageNavigationRequest,
    pageMessageCount,
    entryRecordChunkCount,
  });
  const hydratedConversationTranscriptRows = hydrateConversationTranscriptRowsFromEntryRecords({
    conversationTranscriptEntryRecords: accumulatedEntryRecordLoad.entryRecords,
    latestCompactionSummaryEntrySequence: accumulatedEntryRecordLoad.latestCompactionSummaryEntrySequence,
  }).visibleConversationMessageRows.filter(isConversationTranscriptPageRowVisibleInTranscript);
  const visibleConversationMessageRows = input.pageNavigationRequest.pageNavigationKind === "newer"
    ? hydratedConversationTranscriptRows.slice(0, pageMessageCount)
    : hydratedConversationTranscriptRows.slice(-pageMessageCount);
  const conversationTranscriptEntryRecords = selectConversationTranscriptPageEntryRecords({
    accumulatedEntryRecords: accumulatedEntryRecordLoad.entryRecords,
    visibleConversationMessageRows,
  });
  const didDiscardHydratedOlderRows = input.pageNavigationRequest.pageNavigationKind !== "newer" &&
    hydratedConversationTranscriptRows.length > visibleConversationMessageRows.length;
  const didDiscardHydratedNewerRows = input.pageNavigationRequest.pageNavigationKind === "newer" &&
    hydratedConversationTranscriptRows.length > visibleConversationMessageRows.length;
  const hasOlderPage = input.pageNavigationRequest.pageNavigationKind === "newer" ||
    didDiscardHydratedOlderRows ||
    accumulatedEntryRecordLoad.hasOlderEntries;
  const hasNewerPage = input.pageNavigationRequest.pageNavigationKind === "older" ||
    didDiscardHydratedNewerRows ||
    accumulatedEntryRecordLoad.hasNewerEntries;

  return {
    conversationSessionId: input.conversationSessionId,
    conversationTranscriptEntryRecords,
    visibleConversationMessageRows,
    pageMessageCount,
    hasOlderPage,
    hasNewerPage,
    isLatestPage: !hasNewerPage,
    firstSourceEntrySequence: visibleConversationMessageRows[0]?.firstSourceEntrySequence,
    lastSourceEntrySequence: visibleConversationMessageRows.at(-1)?.lastSourceEntrySequence,
    latestCompactionSummaryEntrySequence: accumulatedEntryRecordLoad.latestCompactionSummaryEntrySequence,
    loadedEntryRecordCount: accumulatedEntryRecordLoad.entryRecords.length,
  };
}

type AccumulatedEntryRecordLoad = {
  entryRecords: readonly ConversationTranscriptEntryRecord[];
  hasOlderEntries: boolean;
  hasNewerEntries: boolean;
  latestCompactionSummaryEntrySequence: number | undefined;
};

async function loadEnoughEntryRecordsForTranscriptPage(input: {
  conversationSessionId: string;
  loadEntryRecords: LoadConversationTranscriptEntryRecords;
  pageNavigationRequest: ConversationTranscriptPageNavigationRequest;
  pageMessageCount: number;
  entryRecordChunkCount: number;
}): Promise<AccumulatedEntryRecordLoad> {
  const initialLoadRequest = buildInitialEntryRecordLoadRequest(input);
  return input.pageNavigationRequest.pageNavigationKind === "newer"
    ? loadEnoughNewerEntryRecordsForTranscriptPage({ ...input, initialLoadRequest })
    : loadEnoughOlderEntryRecordsForTranscriptPage({ ...input, initialLoadRequest });
}

async function loadEnoughOlderEntryRecordsForTranscriptPage(input: {
  conversationSessionId: string;
  loadEntryRecords: LoadConversationTranscriptEntryRecords;
  pageNavigationRequest: ConversationTranscriptPageNavigationRequest;
  pageMessageCount: number;
  entryRecordChunkCount: number;
  initialLoadRequest: ConversationTranscriptEntryRecordLoadRequest;
}): Promise<AccumulatedEntryRecordLoad> {
  let accumulatedEntryRecords: readonly ConversationTranscriptEntryRecord[] = [];
  let nextLoadRequest: ConversationTranscriptEntryRecordLoadRequest | undefined = input.initialLoadRequest;
  let hasOlderEntries = false;
  let hasNewerEntries = input.pageNavigationRequest.pageNavigationKind === "older";
  let latestCompactionSummaryEntrySequence: number | undefined;

  while (nextLoadRequest) {
    const loadedEntryRecordSlice = await input.loadEntryRecords(nextLoadRequest);
    accumulatedEntryRecords = [...loadedEntryRecordSlice.entryRecords, ...accumulatedEntryRecords];
    hasOlderEntries = loadedEntryRecordSlice.hasOlderEntries;
    hasNewerEntries = input.pageNavigationRequest.pageNavigationKind === "older" &&
      (hasNewerEntries || loadedEntryRecordSlice.hasNewerEntries);
    latestCompactionSummaryEntrySequence = loadedEntryRecordSlice.latestCompactionSummaryEntrySequence;

    if (hasHydratedMoreThanOneTranscriptPage({
      entryRecords: accumulatedEntryRecords,
      latestCompactionSummaryEntrySequence,
      pageMessageCount: input.pageMessageCount,
    }) || !hasOlderEntries || loadedEntryRecordSlice.entryRecords.length === 0) {
      break;
    }

    const firstLoadedEntryRecord = accumulatedEntryRecords[0];
    nextLoadRequest = firstLoadedEntryRecord
      ? {
        conversationSessionId: input.conversationSessionId,
        loadKind: "before",
        beforeEntrySequence: firstLoadedEntryRecord.entrySequence,
        limit: input.entryRecordChunkCount,
      }
      : undefined;
  }

  return {
    entryRecords: accumulatedEntryRecords,
    hasOlderEntries,
    hasNewerEntries,
    latestCompactionSummaryEntrySequence,
  };
}

async function loadEnoughNewerEntryRecordsForTranscriptPage(input: {
  conversationSessionId: string;
  loadEntryRecords: LoadConversationTranscriptEntryRecords;
  pageNavigationRequest: ConversationTranscriptPageNavigationRequest;
  pageMessageCount: number;
  entryRecordChunkCount: number;
  initialLoadRequest: ConversationTranscriptEntryRecordLoadRequest;
}): Promise<AccumulatedEntryRecordLoad> {
  let accumulatedEntryRecords: readonly ConversationTranscriptEntryRecord[] = [];
  let nextLoadRequest: ConversationTranscriptEntryRecordLoadRequest | undefined = input.initialLoadRequest;
  let hasOlderEntries = true;
  let hasNewerEntries = false;
  let latestCompactionSummaryEntrySequence: number | undefined;

  while (nextLoadRequest) {
    const loadedEntryRecordSlice = await input.loadEntryRecords(nextLoadRequest);
    accumulatedEntryRecords = [...accumulatedEntryRecords, ...loadedEntryRecordSlice.entryRecords];
    hasOlderEntries = hasOlderEntries || loadedEntryRecordSlice.hasOlderEntries;
    hasNewerEntries = loadedEntryRecordSlice.hasNewerEntries;
    latestCompactionSummaryEntrySequence = loadedEntryRecordSlice.latestCompactionSummaryEntrySequence;

    if (hasHydratedMoreThanOneTranscriptPage({
      entryRecords: accumulatedEntryRecords,
      latestCompactionSummaryEntrySequence,
      pageMessageCount: input.pageMessageCount,
    }) || !hasNewerEntries || loadedEntryRecordSlice.entryRecords.length === 0) {
      break;
    }

    const lastLoadedEntryRecord = accumulatedEntryRecords.at(-1);
    nextLoadRequest = lastLoadedEntryRecord
      ? {
        conversationSessionId: input.conversationSessionId,
        loadKind: "after",
        afterEntrySequence: lastLoadedEntryRecord.entrySequence,
        limit: input.entryRecordChunkCount,
      }
      : undefined;
  }

  return {
    entryRecords: accumulatedEntryRecords,
    hasOlderEntries,
    hasNewerEntries,
    latestCompactionSummaryEntrySequence,
  };
}

function buildInitialEntryRecordLoadRequest(input: {
  conversationSessionId: string;
  pageNavigationRequest: ConversationTranscriptPageNavigationRequest;
  entryRecordChunkCount: number;
}): ConversationTranscriptEntryRecordLoadRequest {
  if (input.pageNavigationRequest.pageNavigationKind === "latest") {
    return {
      conversationSessionId: input.conversationSessionId,
      loadKind: "latest",
      limit: input.entryRecordChunkCount,
    };
  }

  if (input.pageNavigationRequest.pageNavigationKind === "older") {
    return {
      conversationSessionId: input.conversationSessionId,
      loadKind: "before",
      beforeEntrySequence: input.pageNavigationRequest.beforeEntrySequence,
      limit: input.entryRecordChunkCount,
    };
  }

  return {
    conversationSessionId: input.conversationSessionId,
    loadKind: "after",
    afterEntrySequence: input.pageNavigationRequest.afterEntrySequence,
    limit: input.entryRecordChunkCount,
  };
}

function hasHydratedMoreThanOneTranscriptPage(input: {
  entryRecords: readonly ConversationTranscriptEntryRecord[];
  latestCompactionSummaryEntrySequence: number | undefined;
  pageMessageCount: number;
}): boolean {
  return hydrateConversationTranscriptRowsFromEntryRecords({
    conversationTranscriptEntryRecords: input.entryRecords,
    latestCompactionSummaryEntrySequence: input.latestCompactionSummaryEntrySequence,
  }).visibleConversationMessageRows.filter(isConversationTranscriptPageRowVisibleInTranscript).length > input.pageMessageCount;
}

function normalizePositiveInteger(value: number | undefined, fallbackValue: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallbackValue;
}

function selectConversationTranscriptPageEntryRecords(input: {
  accumulatedEntryRecords: readonly ConversationTranscriptEntryRecord[];
  visibleConversationMessageRows: readonly ConversationTranscriptPageRow[];
}): readonly ConversationTranscriptEntryRecord[] {
  const firstVisibleSourceEntrySequence = input.visibleConversationMessageRows[0]?.firstSourceEntrySequence;
  const lastVisibleSourceEntrySequence = input.visibleConversationMessageRows.at(-1)?.lastSourceEntrySequence;
  if (firstVisibleSourceEntrySequence === undefined || lastVisibleSourceEntrySequence === undefined) {
    return [];
  }

  return input.accumulatedEntryRecords.filter(
    (conversationTranscriptEntryRecord) =>
      conversationTranscriptEntryRecord.entrySequence >= firstVisibleSourceEntrySequence &&
      conversationTranscriptEntryRecord.entrySequence <= lastVisibleSourceEntrySequence,
  );
}
