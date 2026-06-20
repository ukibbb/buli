import {
  createStartedToolCallDetailFromRequest,
  removeInternalModeScopeTagsFromAssistantTranscriptText,
  type AssistantMessageConversationSessionEntry,
  type AssistantToolCallConversationMessagePart,
  type AssistantTextPartStatus,
  type ConversationMessage,
  type ConversationMessageModelContextVisibility,
  type ConversationMessagePart,
  type ConversationSessionEntry,
  type ToolCallDetail,
} from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

type HostedWebSearchCallConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "hosted_web_search_call" }
>;

type HydratedConversationTranscript = {
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: string[];
  conversationMessagePartCount: number;
  conversationMessageSourceEntryRangesById: Record<string, ConversationMessageSourceEntryRange>;
};

export type ConversationTranscriptEntryRecord = {
  entrySequence: number;
  conversationSessionEntry: ConversationSessionEntry;
};

export type ConversationMessageSourceEntryRange = {
  firstSourceEntrySequence: number;
  lastSourceEntrySequence: number;
};

export type ConversationTranscriptPageRow = ConversationMessageSourceEntryRange & {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
};

export type HydratedConversationTranscriptRows = {
  visibleConversationMessageRows: readonly ConversationTranscriptPageRow[];
  conversationMessageCount: number;
  conversationMessagePartCount: number;
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: readonly string[];
  firstSourceEntrySequence: number | undefined;
  lastSourceEntrySequence: number | undefined;
};

type HydratedToolResultPartBase = {
  id: string;
  toolCallId: string;
  toolCallStartedAtMs: number;
  toolCallDetail: ToolCallDetail;
};

export type ConversationCompactionProgressSource = "manual" | "auto";

const INTERRUPTED_TOOL_CALL_ERROR_TEXT = "Tool call was interrupted before a result was recorded.";
const ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID = "active-conversation-compaction";
const ACTIVE_CONVERSATION_COMPACTION_SEPARATOR_PART_ID = "active-conversation-compaction-separator";
const ACTIVE_CONVERSATION_COMPACTION_SUMMARY_PART_ID = "active-conversation-compaction-summary";

export function clearConversationTranscript(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    conversationTurnStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    pendingPromptImageAttachments: [],
    pendingPromptTextPastes: [],
    latestTokenUsage: undefined,
    latestContextWindowUsage: undefined,
    conversationMessagesById: {},
    conversationMessagePartsById: {},
    orderedConversationMessageIds: [],
    conversationMessagePartCount: 0,
    pendingToolApprovalRequest: undefined,
    promptContextSelectionState: { step: "hidden" },
    slashCommandSelectionState: { step: "hidden" },
    conversationSessionSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
    modelAndReasoningSelectionState: { step: "hidden" },
    isCommandHelpModalVisible: false,
  };
}

export function hydrateConversationTranscriptFromSessionEntries(
  chatSessionState: ChatSessionState,
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ChatSessionState {
  const hydratedConversationTranscript = buildHydratedConversationTranscript(
    conversationSessionEntries.map((conversationSessionEntry, entrySequence) => ({
      entrySequence,
      conversationSessionEntry,
    })),
  );
  return {
    ...clearConversationTranscript(chatSessionState),
    conversationMessagesById: hydratedConversationTranscript.conversationMessagesById,
    conversationMessagePartsById: hydratedConversationTranscript.conversationMessagePartsById,
    orderedConversationMessageIds: hydratedConversationTranscript.orderedConversationMessageIds,
    conversationMessagePartCount: hydratedConversationTranscript.conversationMessagePartCount,
  };
}

export function hydrateConversationTranscriptFromPageRows(
  chatSessionState: ChatSessionState,
  visibleConversationMessageRows: readonly ConversationTranscriptPageRow[],
): ChatSessionState {
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const orderedConversationMessageIds: string[] = [];

  for (const visibleConversationMessageRow of visibleConversationMessageRows) {
    conversationMessagesById[visibleConversationMessageRow.conversationMessage.id] =
      visibleConversationMessageRow.conversationMessage;
    orderedConversationMessageIds.push(visibleConversationMessageRow.conversationMessage.id);
    for (const conversationMessagePart of visibleConversationMessageRow.conversationMessageParts) {
      conversationMessagePartsById[conversationMessagePart.id] = conversationMessagePart;
    }
  }

  return {
    ...clearConversationTranscript(chatSessionState),
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
    conversationMessagePartCount: Object.keys(conversationMessagePartsById).length,
  };
}

export function hydrateConversationTranscriptRowsFromEntryRecords(input: {
  conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[];
  latestCompactionSummaryEntrySequence?: number | undefined;
}): HydratedConversationTranscriptRows {
  const hydratedConversationTranscript = buildHydratedConversationTranscript(
    input.conversationTranscriptEntryRecords,
    input.latestCompactionSummaryEntrySequence,
  );
  const visibleConversationMessageRows = hydratedConversationTranscript.orderedConversationMessageIds.flatMap(
    (conversationMessageId): ConversationTranscriptPageRow[] => {
      const conversationMessage = hydratedConversationTranscript.conversationMessagesById[conversationMessageId];
      const conversationMessageSourceEntryRange = hydratedConversationTranscript.conversationMessageSourceEntryRangesById[
        conversationMessageId
      ];
      if (!conversationMessage || !conversationMessageSourceEntryRange) {
        return [];
      }

      return [{
        conversationMessage,
        conversationMessageParts: conversationMessage.partIds.flatMap((conversationMessagePartId) => {
          const conversationMessagePart = hydratedConversationTranscript.conversationMessagePartsById[conversationMessagePartId];
          return conversationMessagePart ? [conversationMessagePart] : [];
        }),
        ...conversationMessageSourceEntryRange,
      }];
    },
  );

  return {
    visibleConversationMessageRows,
    conversationMessageCount: visibleConversationMessageRows.length,
    conversationMessagePartCount: hydratedConversationTranscript.conversationMessagePartCount,
    conversationMessagesById: hydratedConversationTranscript.conversationMessagesById,
    conversationMessagePartsById: hydratedConversationTranscript.conversationMessagePartsById,
    orderedConversationMessageIds: hydratedConversationTranscript.orderedConversationMessageIds,
    firstSourceEntrySequence: visibleConversationMessageRows[0]?.firstSourceEntrySequence,
    lastSourceEntrySequence: visibleConversationMessageRows.at(-1)?.lastSourceEntrySequence,
  };
}

export function upsertConversationCompactionProgressInTranscript(input: {
  chatSessionState: ChatSessionState;
  source: ConversationCompactionProgressSource;
  summaryText: string;
  compactionStartedAtMs?: number | undefined;
}): ChatSessionState {
  const existingCompactionMessage = input.chatSessionState.conversationMessagesById[ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID];
  const nextCompactionMessage: ConversationMessage = {
    id: ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID,
    role: "assistant",
    messageStatus: "streaming",
    createdAtMs: existingCompactionMessage?.createdAtMs ?? input.compactionStartedAtMs ?? Date.now(),
    partIds: [ACTIVE_CONVERSATION_COMPACTION_SEPARATOR_PART_ID, ACTIVE_CONVERSATION_COMPACTION_SUMMARY_PART_ID],
  };
  const nextSeparatorPart = createCompactionSeparatorPart({
    id: ACTIVE_CONVERSATION_COMPACTION_SEPARATOR_PART_ID,
    source: input.source,
  });
  const nextSummaryTextPart = createCompactionSummaryTextPart({
    id: ACTIVE_CONVERSATION_COMPACTION_SUMMARY_PART_ID,
    partStatus: "streaming",
    summaryText: input.summaryText,
  });
  const existingSeparatorPart = input.chatSessionState.conversationMessagePartsById[
    ACTIVE_CONVERSATION_COMPACTION_SEPARATOR_PART_ID
  ];
  const existingSummaryTextPart = input.chatSessionState.conversationMessagePartsById[
    ACTIVE_CONVERSATION_COMPACTION_SUMMARY_PART_ID
  ];
  if (
    existingCompactionMessage?.messageStatus === nextCompactionMessage.messageStatus &&
    existingSeparatorPart?.partKind === "assistant_compaction_separator" &&
    existingSeparatorPart.source === input.source &&
    existingSummaryTextPart?.partKind === "assistant_text" &&
    existingSummaryTextPart.partStatus === "streaming" &&
    existingSummaryTextPart.rawMarkdownText === input.summaryText
  ) {
    return input.chatSessionState;
  }

  const conversationMessagePartsById = {
    ...input.chatSessionState.conversationMessagePartsById,
    [ACTIVE_CONVERSATION_COMPACTION_SEPARATOR_PART_ID]: nextSeparatorPart,
    [ACTIVE_CONVERSATION_COMPACTION_SUMMARY_PART_ID]: nextSummaryTextPart,
  };
  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID]: nextCompactionMessage,
    },
    orderedConversationMessageIds: existingCompactionMessage
      ? input.chatSessionState.orderedConversationMessageIds
      : [...input.chatSessionState.orderedConversationMessageIds, ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID],
    conversationMessagePartsById,
    conversationMessagePartCount: Object.keys(conversationMessagePartsById).length,
  };
}

export function removeConversationCompactionProgressFromTranscript(chatSessionState: ChatSessionState): ChatSessionState {
  const activeCompactionMessage = chatSessionState.conversationMessagesById[ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID];
  if (!activeCompactionMessage) {
    return chatSessionState;
  }

  const removedPartIds = new Set(activeCompactionMessage.partIds);
  const conversationMessagesById = omitRecordKey(
    chatSessionState.conversationMessagesById,
    ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID,
  );
  const conversationMessagePartsById = omitRecordKeys(chatSessionState.conversationMessagePartsById, removedPartIds);
  return {
    ...chatSessionState,
    conversationMessagesById,
    orderedConversationMessageIds: chatSessionState.orderedConversationMessageIds.filter(
      (conversationMessageId) => conversationMessageId !== ACTIVE_CONVERSATION_COMPACTION_MESSAGE_ID,
    ),
    conversationMessagePartsById,
    conversationMessagePartCount: Object.keys(conversationMessagePartsById).length,
  };
}

function createCompactionSeparatorPart(input: {
  id: string;
  source: ConversationCompactionProgressSource;
}): ConversationMessagePart {
  return {
    id: input.id,
    partKind: "assistant_compaction_separator",
    source: input.source,
  };
}

function createCompactionSummaryTextPart(input: {
  id: string;
  partStatus: AssistantTextPartStatus;
  summaryText: string;
}): ConversationMessagePart {
  return {
    id: input.id,
    partKind: "assistant_text",
    partStatus: input.partStatus,
    rawMarkdownText: input.summaryText,
  };
}

function omitRecordKey<T>(record: Record<string, T>, omittedKey: string): Record<string, T> {
  const nextRecord: Record<string, T> = {};
  for (const [recordKey, recordValue] of Object.entries(record)) {
    if (recordKey !== omittedKey) {
      nextRecord[recordKey] = recordValue;
    }
  }
  return nextRecord;
}

function omitRecordKeys<T>(record: Record<string, T>, omittedKeys: ReadonlySet<string>): Record<string, T> {
  const nextRecord: Record<string, T> = {};
  for (const [recordKey, recordValue] of Object.entries(record)) {
    if (!omittedKeys.has(recordKey)) {
      nextRecord[recordKey] = recordValue;
    }
  }
  return nextRecord;
}

// Each hydration pass gets a fresh id scope so replacing a transcript (session switch,
// session deletion fallback, compaction) remounts message rows instead of mutating rows
// that happen to share ids with the previous transcript — reused rows keep showing the
// old content until OpenTUI's asynchronous re-highlight completes.
let conversationTranscriptHydrationGeneration = 0;

function buildHydratedConversationTranscript(
  conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[],
  latestCompactionSummaryEntrySequence = findLatestCompactionSummaryEntrySequence(conversationTranscriptEntryRecords),
): HydratedConversationTranscript {
  conversationTranscriptHydrationGeneration += 1;
  const hydratedIdScope = `persisted-${conversationTranscriptHydrationGeneration}`;
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const conversationMessageSourceEntryRangesById: Record<string, ConversationMessageSourceEntryRange> = {};
  const orderedConversationMessageIds: string[] = [];
  const toolCallPartIdByToolCallId = new Map<string, string>();
  let currentAssistantMessageId: string | undefined;
  let assistantMessageIndex = 0;

  const appendConversationMessage = (conversationMessage: ConversationMessage, sourceEntrySequence: number): void => {
    conversationMessagesById[conversationMessage.id] = conversationMessage;
    conversationMessageSourceEntryRangesById[conversationMessage.id] = {
      firstSourceEntrySequence: sourceEntrySequence,
      lastSourceEntrySequence: sourceEntrySequence,
    };
    orderedConversationMessageIds.push(conversationMessage.id);
  };
  const createConversationMessageModelContextVisibilityFields = (
    sourceEntrySequence: number,
  ): { modelContextVisibility?: ConversationMessageModelContextVisibility } => {
    if (latestCompactionSummaryEntrySequence === undefined) {
      return {};
    }

    return sourceEntrySequence < latestCompactionSummaryEntrySequence
      ? { modelContextVisibility: "compacted_out_of_model_context" }
      : {};
  };
  const extendConversationMessageSourceEntryRange = (messageId: string, sourceEntrySequence: number): void => {
    const conversationMessageSourceEntryRange = conversationMessageSourceEntryRangesById[messageId];
    if (!conversationMessageSourceEntryRange) {
      return;
    }

    conversationMessageSourceEntryRangesById[messageId] = {
      firstSourceEntrySequence: Math.min(conversationMessageSourceEntryRange.firstSourceEntrySequence, sourceEntrySequence),
      lastSourceEntrySequence: Math.max(conversationMessageSourceEntryRange.lastSourceEntrySequence, sourceEntrySequence),
    };
  };
  const appendConversationMessagePart = (
    messageId: string,
    conversationMessagePart: ConversationMessagePart,
    sourceEntrySequence: number,
  ): void => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return;
    }

    // This private builder owns draft messages, so local mutation avoids quadratic copies during large-session hydration.
    conversationMessage.partIds.push(conversationMessagePart.id);
    conversationMessagePartsById[conversationMessagePart.id] = conversationMessagePart;
    extendConversationMessageSourceEntryRange(messageId, sourceEntrySequence);
  };
  const updateAssistantTextPartStatuses = (messageId: string, partStatus: AssistantTextPartStatus): void => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return;
    }

    for (const partId of conversationMessage.partIds) {
      const conversationMessagePart = conversationMessagePartsById[partId];
      if (!conversationMessagePart || conversationMessagePart.partKind !== "assistant_text") {
        continue;
      }

      conversationMessagePartsById[partId] = {
        ...conversationMessagePart,
        partStatus,
      };
    }
  };
  const hasAssistantRenderedContentPart = (messageId: string): boolean => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return false;
    }

    return conversationMessage.partIds.some((partId) => {
      const conversationMessagePart = conversationMessagePartsById[partId];
      return conversationMessagePart?.partKind === "assistant_text";
    });
  };
  const ensureAssistantConversationMessage = (sourceEntrySequence: number): string => {
    if (currentAssistantMessageId) {
      return currentAssistantMessageId;
    }

    const assistantMessageId = `${hydratedIdScope}-assistant-${assistantMessageIndex}`;
    assistantMessageIndex += 1;
    appendConversationMessage({
      id: assistantMessageId,
      role: "assistant",
      messageStatus: "completed",
      createdAtMs: sourceEntrySequence,
      partIds: [],
      ...createConversationMessageModelContextVisibilityFields(sourceEntrySequence),
    }, sourceEntrySequence);
    currentAssistantMessageId = assistantMessageId;
    return assistantMessageId;
  };
  const markDanglingHydratedToolCallsAsInterrupted = (interruptedAtEntrySequence: number): void => {
    if (!currentAssistantMessageId) {
      return;
    }

    const currentAssistantConversationMessage = conversationMessagesById[currentAssistantMessageId];
    if (!currentAssistantConversationMessage) {
      return;
    }

    const interruptedToolCallPartIds = currentAssistantConversationMessage.partIds.filter((partId) => {
      const conversationMessagePart = conversationMessagePartsById[partId];
      return conversationMessagePart?.partKind === "assistant_tool_call" &&
        (conversationMessagePart.toolCallStatus === "running" || conversationMessagePart.toolCallStatus === "pending_approval");
    });

    if (interruptedToolCallPartIds.length === 0) {
      return;
    }

    conversationMessagesById[currentAssistantMessageId] = {
      ...currentAssistantConversationMessage,
      messageStatus: "interrupted",
    };

    for (const interruptedToolCallPartId of interruptedToolCallPartIds) {
      const interruptedToolCallPart = conversationMessagePartsById[interruptedToolCallPartId];
      if (!interruptedToolCallPart || interruptedToolCallPart.partKind !== "assistant_tool_call") {
        continue;
      }

      conversationMessagePartsById[interruptedToolCallPartId] = {
        id: interruptedToolCallPart.id,
        partKind: "assistant_tool_call",
        toolCallId: interruptedToolCallPart.toolCallId,
        toolCallStatus: "interrupted",
        toolCallStartedAtMs: interruptedToolCallPart.toolCallStartedAtMs,
        toolCallDetail: interruptedToolCallPart.toolCallDetail,
        errorText: INTERRUPTED_TOOL_CALL_ERROR_TEXT,
      };
    }

    const hasInterruptedToolCallNoticePart = currentAssistantConversationMessage.partIds.some((partId) => {
      const conversationMessagePart = conversationMessagePartsById[partId];
      return conversationMessagePart?.partKind === "assistant_interrupted_notice" &&
        conversationMessagePart.interruptionReason === INTERRUPTED_TOOL_CALL_ERROR_TEXT;
    });
    if (hasInterruptedToolCallNoticePart) {
      return;
    }

    appendConversationMessagePart(currentAssistantMessageId, {
      id: `${hydratedIdScope}-entry-${interruptedAtEntrySequence}-assistant-interrupted-tool-call`,
      partKind: "assistant_interrupted_notice",
      interruptionReason: INTERRUPTED_TOOL_CALL_ERROR_TEXT,
    }, interruptedAtEntrySequence);
  };

  conversationTranscriptEntryRecords.forEach((conversationTranscriptEntryRecord) => {
    const conversationSessionEntry = conversationTranscriptEntryRecord.conversationSessionEntry;
    const entrySequence = conversationTranscriptEntryRecord.entrySequence;
    if (conversationSessionEntry.entryKind === "user_prompt") {
      markDanglingHydratedToolCallsAsInterrupted(entrySequence);
      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
      if (
        conversationSessionEntry.promptSource === "auto_compaction_continue" ||
        conversationSessionEntry.promptSource === "auto_compaction_retry"
      ) {
        return;
      }

      const userMessageId = `${hydratedIdScope}-entry-${entrySequence}-user`;
      const userTextPartId = `${hydratedIdScope}-entry-${entrySequence}-user-text`;
      appendConversationMessage({
        id: userMessageId,
        role: "user",
        messageStatus: "completed",
        createdAtMs: entrySequence,
        partIds: [],
        ...createConversationMessageModelContextVisibilityFields(entrySequence),
      }, entrySequence);
      if (conversationSessionEntry.promptText.length > 0) {
        appendConversationMessagePart(userMessageId, {
          id: userTextPartId,
          partKind: "user_text",
          text: conversationSessionEntry.promptText,
        }, entrySequence);
      }
      for (const [imageAttachmentIndex, imageAttachment] of (conversationSessionEntry.imageAttachments ?? []).entries()) {
        appendConversationMessagePart(userMessageId, {
          id: `${hydratedIdScope}-entry-${entrySequence}-user-image-${imageAttachmentIndex}`,
          partKind: "user_image_attachment",
          attachment: imageAttachment,
        }, entrySequence);
      }
      return;
    }

    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      markDanglingHydratedToolCallsAsInterrupted(entrySequence);
      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
      const compactionMessageId = `${hydratedIdScope}-entry-${entrySequence}-compaction`;
      appendConversationMessage({
        id: compactionMessageId,
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: entrySequence,
        partIds: [],
      }, entrySequence);
      appendConversationMessagePart(compactionMessageId, createCompactionSeparatorPart({
        id: `${hydratedIdScope}-entry-${entrySequence}-compaction-separator`,
        source: conversationSessionEntry.compactionSource ?? "manual",
      }), entrySequence);
      appendConversationMessagePart(compactionMessageId, {
        id: `${hydratedIdScope}-entry-${entrySequence}-compaction-summary`,
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: conversationSessionEntry.summaryText,
      }, entrySequence);
      return;
    }

    if (conversationSessionEntry.entryKind === "buli_sticky_notes") {
      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      appendConversationMessagePart(assistantMessageId, {
        id: `${hydratedIdScope}-entry-${entrySequence}-buli-sticky-notes`,
        partKind: "assistant_buli_sticky_notes",
        buliStickyNotesContextText: conversationSessionEntry.buliStickyNotesContextText,
      }, entrySequence);
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_text_segment") {
      const visibleAssistantTextSegmentText = removeInternalModeScopeTagsFromAssistantTranscriptText(
        conversationSessionEntry.assistantTextSegmentText,
      );
      if (visibleAssistantTextSegmentText.length === 0) {
        return;
      }

      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      appendConversationMessagePart(assistantMessageId, {
        id: `${hydratedIdScope}-entry-${entrySequence}-assistant-text-segment`,
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: visibleAssistantTextSegmentText,
      }, entrySequence);
      return;
    }

    if (conversationSessionEntry.entryKind === "tool_call") {
      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      const toolCallPartId = `${hydratedIdScope}-entry-${entrySequence}-tool-call`;
      toolCallPartIdByToolCallId.set(conversationSessionEntry.toolCallId, toolCallPartId);
      appendConversationMessagePart(assistantMessageId, {
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: conversationSessionEntry.toolCallId,
        toolCallStatus: "running",
        toolCallStartedAtMs: entrySequence,
        toolCallDetail: createStartedToolCallDetailFromRequest(conversationSessionEntry.toolCallRequest),
      }, entrySequence);
      return;
    }

    if (conversationSessionEntry.entryKind === "hosted_web_search_call") {
      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      appendConversationMessagePart(
        assistantMessageId,
        buildHydratedHostedWebSearchCallConversationMessagePart({
          conversationSessionEntry,
          entryIndex: entrySequence,
          hydratedIdScope,
        }),
        entrySequence,
      );
      return;
    }

    if (isToolResultConversationSessionEntry(conversationSessionEntry)) {
      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      upsertHydratedToolResultPart({
        conversationSessionEntry,
        entryIndex: entrySequence,
        hydratedIdScope,
        assistantMessageId,
        sourceEntrySequence: entrySequence,
        toolCallPartIdByToolCallId,
        conversationMessagePartsById,
        extendConversationMessageSourceEntryRange,
        appendConversationMessagePart,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "workspace_patch") {
      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      appendConversationMessagePart(assistantMessageId, {
        id: `${hydratedIdScope}-entry-${entrySequence}-workspace-patch`,
        partKind: "assistant_workspace_patch",
        workspacePatch: conversationSessionEntry.workspacePatch,
      }, entrySequence);
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      const assistantMessageId = ensureAssistantConversationMessage(entrySequence);
      extendConversationMessageSourceEntryRange(assistantMessageId, entrySequence);
      const existingAssistantMessage = conversationMessagesById[assistantMessageId];
      if (existingAssistantMessage) {
        conversationMessagesById[assistantMessageId] = {
          ...existingAssistantMessage,
          messageStatus: conversationSessionEntry.assistantMessageStatus,
        };
      }

      const visibleAssistantMessageText = removeInternalModeScopeTagsFromAssistantTranscriptText(
        conversationSessionEntry.assistantMessageText,
      );
      if (visibleAssistantMessageText.length > 0 && !hasAssistantRenderedContentPart(assistantMessageId)) {
        appendConversationMessagePart(assistantMessageId, {
          id: `${hydratedIdScope}-entry-${entrySequence}-assistant-text`,
          partKind: "assistant_text",
          partStatus: conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
          rawMarkdownText: visibleAssistantMessageText,
        }, entrySequence);
      }
      updateAssistantTextPartStatuses(
        assistantMessageId,
        conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
      );

      if (conversationSessionEntry.assistantMessageStatus === "incomplete") {
        appendConversationMessagePart(assistantMessageId, {
          id: `${hydratedIdScope}-entry-${entrySequence}-assistant-incomplete`,
          partKind: "assistant_incomplete_notice",
          incompleteReason: conversationSessionEntry.incompleteReason,
        }, entrySequence);
      }

      if (conversationSessionEntry.assistantMessageStatus === "failed") {
        appendConversationMessagePart(assistantMessageId, {
          id: `${hydratedIdScope}-entry-${entrySequence}-assistant-error`,
          partKind: "assistant_error_notice",
          errorText: conversationSessionEntry.failureExplanation,
        }, entrySequence);
      }

      if (conversationSessionEntry.assistantMessageStatus === "interrupted") {
        markDanglingHydratedToolCallsAsInterrupted(entrySequence);
        appendConversationMessagePart(assistantMessageId, {
          id: `${hydratedIdScope}-entry-${entrySequence}-assistant-interrupted`,
          partKind: "assistant_interrupted_notice",
          interruptionReason: conversationSessionEntry.interruptionReason,
        }, entrySequence);
      }

      const assistantTurnSummaryPart = createHydratedAssistantTurnSummaryPart({
        conversationSessionEntry,
        entryIndex: entrySequence,
        hydratedIdScope,
      });
      if (assistantTurnSummaryPart) {
        appendConversationMessagePart(assistantMessageId, assistantTurnSummaryPart, entrySequence);
      }

      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
    }
  });

  markDanglingHydratedToolCallsAsInterrupted((conversationTranscriptEntryRecords.at(-1)?.entrySequence ?? -1) + 1);

  return {
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
    conversationMessagePartCount: Object.keys(conversationMessagePartsById).length,
    conversationMessageSourceEntryRangesById,
  };
}

function findLatestCompactionSummaryEntrySequence(
  conversationTranscriptEntryRecords: readonly ConversationTranscriptEntryRecord[],
): number | undefined {
  return conversationTranscriptEntryRecords.findLast(
    (conversationTranscriptEntryRecord) =>
      conversationTranscriptEntryRecord.conversationSessionEntry.entryKind === "conversation_compaction_summary",
  )?.entrySequence;
}

function createHydratedAssistantTurnSummaryPart(input: {
  conversationSessionEntry: AssistantMessageConversationSessionEntry;
  entryIndex: number;
  hydratedIdScope: string;
}): ConversationMessagePart | undefined {
  if (
    input.conversationSessionEntry.selectedModelId === undefined ||
    input.conversationSessionEntry.turnDurationMs === undefined
  ) {
    return undefined;
  }

  return {
    id: `${input.hydratedIdScope}-entry-${input.entryIndex}-assistant-turn-summary`,
    partKind: "assistant_turn_summary",
    turnDurationMs: input.conversationSessionEntry.turnDurationMs,
    modelDisplayName: input.conversationSessionEntry.selectedModelId,
    ...(input.conversationSessionEntry.assistantOperatingMode !== undefined
      ? { assistantOperatingMode: input.conversationSessionEntry.assistantOperatingMode }
      : {}),
    ...(input.conversationSessionEntry.usage !== undefined ? { usage: input.conversationSessionEntry.usage } : {}),
  };
}

function upsertHydratedToolResultPart(input: {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  entryIndex: number;
  hydratedIdScope: string;
  assistantMessageId: string;
  sourceEntrySequence: number;
  toolCallPartIdByToolCallId: Map<string, string>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  extendConversationMessageSourceEntryRange: (messageId: string, sourceEntrySequence: number) => void;
  appendConversationMessagePart: (
    messageId: string,
    conversationMessagePart: ConversationMessagePart,
    sourceEntrySequence: number,
  ) => void;
}): void {
  const existingToolCallPartId = input.toolCallPartIdByToolCallId.get(input.conversationSessionEntry.toolCallId);
  const existingToolCallPart = existingToolCallPartId
    ? input.conversationMessagePartsById[existingToolCallPartId]
    : undefined;

  if (existingToolCallPart?.partKind === "assistant_tool_call") {
    input.conversationMessagePartsById[existingToolCallPart.id] = buildHydratedToolResultConversationMessagePart({
      conversationSessionEntry: input.conversationSessionEntry,
      hydratedToolResultPartBase: {
        id: existingToolCallPart.id,
        toolCallId: existingToolCallPart.toolCallId,
        toolCallStartedAtMs: existingToolCallPart.toolCallStartedAtMs,
        toolCallDetail: input.conversationSessionEntry.toolCallDetail,
      },
      durationMs: input.entryIndex - existingToolCallPart.toolCallStartedAtMs,
    });
    input.extendConversationMessageSourceEntryRange(input.assistantMessageId, input.sourceEntrySequence);
    return;
  }

  const toolCallPartId = `${input.hydratedIdScope}-entry-${input.entryIndex}-tool-result`;
  input.toolCallPartIdByToolCallId.set(input.conversationSessionEntry.toolCallId, toolCallPartId);
  input.appendConversationMessagePart(
    input.assistantMessageId,
    buildHydratedToolResultConversationMessagePart({
      conversationSessionEntry: input.conversationSessionEntry,
      hydratedToolResultPartBase: {
        id: toolCallPartId,
        toolCallId: input.conversationSessionEntry.toolCallId,
        toolCallStartedAtMs: input.entryIndex,
        toolCallDetail: input.conversationSessionEntry.toolCallDetail,
      },
      durationMs: 0,
    }),
    input.sourceEntrySequence,
  );
}

function buildHydratedToolResultConversationMessagePart(input: {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  hydratedToolResultPartBase: HydratedToolResultPartBase;
  durationMs: number;
}): AssistantToolCallConversationMessagePart {
  const commonHydratedToolCallPartFields = {
    id: input.hydratedToolResultPartBase.id,
    partKind: "assistant_tool_call" as const,
    toolCallId: input.hydratedToolResultPartBase.toolCallId,
    toolCallStartedAtMs: input.hydratedToolResultPartBase.toolCallStartedAtMs,
    toolCallDetail: input.hydratedToolResultPartBase.toolCallDetail,
  };

  if (input.conversationSessionEntry.entryKind === "completed_tool_result") {
    return {
      ...commonHydratedToolCallPartFields,
      toolCallStatus: "completed",
      durationMs: Math.max(0, input.durationMs),
    };
  }

  if (input.conversationSessionEntry.entryKind === "failed_tool_result") {
    return {
      ...commonHydratedToolCallPartFields,
      toolCallStatus: "failed",
      errorText: input.conversationSessionEntry.failureExplanation,
      durationMs: Math.max(0, input.durationMs),
    };
  }

  return {
    ...commonHydratedToolCallPartFields,
    toolCallStatus: "denied",
    denialText: input.conversationSessionEntry.denialExplanation,
    durationMs: Math.max(0, input.durationMs),
  };
}

function buildHydratedHostedWebSearchCallConversationMessagePart(input: {
  conversationSessionEntry: HostedWebSearchCallConversationSessionEntry;
  entryIndex: number;
  hydratedIdScope: string;
}): AssistantToolCallConversationMessagePart {
  const commonHydratedHostedWebSearchCallPartFields = {
    id: `${input.hydratedIdScope}-entry-${input.entryIndex}-hosted-web-search-call`,
    partKind: "assistant_tool_call" as const,
    toolCallId: input.conversationSessionEntry.hostedWebSearchCallId,
    toolCallStartedAtMs: input.conversationSessionEntry.hostedWebSearchCallStartedAtMs,
    toolCallDetail: input.conversationSessionEntry.hostedWebSearchCallDetail,
  };

  if (input.conversationSessionEntry.hostedWebSearchCallStatus === "completed") {
    return {
      ...commonHydratedHostedWebSearchCallPartFields,
      toolCallStatus: "completed",
      durationMs: input.conversationSessionEntry.hostedWebSearchCallDurationMs ?? 0,
    };
  }

  return {
    ...commonHydratedHostedWebSearchCallPartFields,
    toolCallStatus: input.conversationSessionEntry.hostedWebSearchCallStatus,
    errorText: input.conversationSessionEntry.hostedWebSearchCallErrorText ??
      `Hosted web search was ${input.conversationSessionEntry.hostedWebSearchCallStatus}.`,
    ...(input.conversationSessionEntry.hostedWebSearchCallDurationMs !== undefined
      ? { durationMs: input.conversationSessionEntry.hostedWebSearchCallDurationMs }
      : {}),
  };
}

function isToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return (
    conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result"
  );
}
