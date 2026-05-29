import {
  createStartedToolCallDetailFromRequest,
  findLatestConversationCompactionBoundary,
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

type HydratedConversationTranscript = {
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: string[];
  conversationMessagePartCount: number;
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
  const hydratedConversationTranscript = buildHydratedConversationTranscript(conversationSessionEntries);
  return {
    ...clearConversationTranscript(chatSessionState),
    conversationMessagesById: hydratedConversationTranscript.conversationMessagesById,
    conversationMessagePartsById: hydratedConversationTranscript.conversationMessagePartsById,
    orderedConversationMessageIds: hydratedConversationTranscript.orderedConversationMessageIds,
    conversationMessagePartCount: hydratedConversationTranscript.conversationMessagePartCount,
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

function buildHydratedConversationTranscript(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): HydratedConversationTranscript {
  const latestCompactionBoundary = findLatestConversationCompactionBoundary(conversationSessionEntries);
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const orderedConversationMessageIds: string[] = [];
  const toolCallPartIdByToolCallId = new Map<string, string>();
  let currentAssistantMessageId: string | undefined;
  let assistantMessageIndex = 0;

  const appendConversationMessage = (conversationMessage: ConversationMessage): void => {
    conversationMessagesById[conversationMessage.id] = conversationMessage;
    orderedConversationMessageIds.push(conversationMessage.id);
  };
  const createConversationMessageModelContextVisibilityFields = (
    entryIndex: number,
  ): { modelContextVisibility?: ConversationMessageModelContextVisibility } => {
    if (!latestCompactionBoundary) {
      return {};
    }

    return entryIndex < latestCompactionBoundary.compactionSummaryEntryIndex
      ? { modelContextVisibility: "compacted_out_of_model_context" }
      : {};
  };
  const appendConversationMessagePart = (messageId: string, conversationMessagePart: ConversationMessagePart): void => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return;
    }

    // This private builder owns draft messages, so local mutation avoids quadratic copies during large-session hydration.
    conversationMessage.partIds.push(conversationMessagePart.id);
    conversationMessagePartsById[conversationMessagePart.id] = conversationMessagePart;
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
  const ensureAssistantConversationMessage = (entryIndex: number): string => {
    if (currentAssistantMessageId) {
      return currentAssistantMessageId;
    }

    const assistantMessageId = `persisted-assistant-${assistantMessageIndex}`;
    assistantMessageIndex += 1;
    appendConversationMessage({
      id: assistantMessageId,
      role: "assistant",
      messageStatus: "completed",
      createdAtMs: entryIndex,
      partIds: [],
      ...createConversationMessageModelContextVisibilityFields(entryIndex),
    });
    currentAssistantMessageId = assistantMessageId;
    return assistantMessageId;
  };
  const markDanglingHydratedToolCallsAsInterrupted = (interruptedAtEntryIndex: number): void => {
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
      id: `persisted-entry-${interruptedAtEntryIndex}-assistant-interrupted-tool-call`,
      partKind: "assistant_interrupted_notice",
      interruptionReason: INTERRUPTED_TOOL_CALL_ERROR_TEXT,
    });
  };

  conversationSessionEntries.forEach((conversationSessionEntry, entryIndex) => {
    if (conversationSessionEntry.entryKind === "user_prompt") {
      markDanglingHydratedToolCallsAsInterrupted(entryIndex);
      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
      if (
        conversationSessionEntry.promptSource === "auto_compaction_continue" ||
        conversationSessionEntry.promptSource === "auto_compaction_retry"
      ) {
        return;
      }

      const userMessageId = `persisted-entry-${entryIndex}-user`;
      const userTextPartId = `persisted-entry-${entryIndex}-user-text`;
      appendConversationMessage({
        id: userMessageId,
        role: "user",
        messageStatus: "completed",
        createdAtMs: entryIndex,
        partIds: [],
        ...createConversationMessageModelContextVisibilityFields(entryIndex),
      });
      if (conversationSessionEntry.promptText.length > 0) {
        appendConversationMessagePart(userMessageId, {
          id: userTextPartId,
          partKind: "user_text",
          text: conversationSessionEntry.promptText,
        });
      }
      for (const [imageAttachmentIndex, imageAttachment] of (conversationSessionEntry.imageAttachments ?? []).entries()) {
        appendConversationMessagePart(userMessageId, {
          id: `persisted-entry-${entryIndex}-user-image-${imageAttachmentIndex}`,
          partKind: "user_image_attachment",
          attachment: imageAttachment,
        });
      }
      return;
    }

    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      markDanglingHydratedToolCallsAsInterrupted(entryIndex);
      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
      const compactionMessageId = `persisted-entry-${entryIndex}-compaction`;
      appendConversationMessage({
        id: compactionMessageId,
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: entryIndex,
          partIds: [],
      });
      appendConversationMessagePart(compactionMessageId, createCompactionSeparatorPart({
        id: `persisted-entry-${entryIndex}-compaction-separator`,
        source: conversationSessionEntry.compactionSource ?? "manual",
      }));
      appendConversationMessagePart(compactionMessageId, {
        id: `persisted-entry-${entryIndex}-compaction-summary`,
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: conversationSessionEntry.summaryText,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "buli_sticky_notes") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      appendConversationMessagePart(assistantMessageId, {
        id: `persisted-entry-${entryIndex}-buli-sticky-notes`,
        partKind: "assistant_buli_sticky_notes",
        buliStickyNotesContextText: conversationSessionEntry.buliStickyNotesContextText,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_text_segment") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      appendConversationMessagePart(assistantMessageId, {
        id: `persisted-entry-${entryIndex}-assistant-text-segment`,
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: conversationSessionEntry.assistantTextSegmentText,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "tool_call") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      const toolCallPartId = `persisted-entry-${entryIndex}-tool-call`;
      toolCallPartIdByToolCallId.set(conversationSessionEntry.toolCallId, toolCallPartId);
      appendConversationMessagePart(assistantMessageId, {
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: conversationSessionEntry.toolCallId,
        toolCallStatus: "running",
        toolCallStartedAtMs: entryIndex,
        toolCallDetail: createStartedToolCallDetailFromRequest(conversationSessionEntry.toolCallRequest),
      });
      return;
    }

    if (isToolResultConversationSessionEntry(conversationSessionEntry)) {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      upsertHydratedToolResultPart({
        conversationSessionEntry,
        entryIndex,
        assistantMessageId,
        toolCallPartIdByToolCallId,
        conversationMessagePartsById,
        appendConversationMessagePart,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "workspace_patch") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      appendConversationMessagePart(assistantMessageId, {
        id: `persisted-entry-${entryIndex}-workspace-patch`,
        partKind: "assistant_workspace_patch",
        workspacePatch: conversationSessionEntry.workspacePatch,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      const existingAssistantMessage = conversationMessagesById[assistantMessageId];
      if (existingAssistantMessage) {
        conversationMessagesById[assistantMessageId] = {
          ...existingAssistantMessage,
          messageStatus: conversationSessionEntry.assistantMessageStatus,
        };
      }

      if (conversationSessionEntry.assistantMessageText.length > 0 && !hasAssistantRenderedContentPart(assistantMessageId)) {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-text`,
          partKind: "assistant_text",
          partStatus: conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
          rawMarkdownText: conversationSessionEntry.assistantMessageText,
        });
      }
      updateAssistantTextPartStatuses(
        assistantMessageId,
        conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
      );

      if (conversationSessionEntry.assistantMessageStatus === "incomplete") {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-incomplete`,
          partKind: "assistant_incomplete_notice",
          incompleteReason: conversationSessionEntry.incompleteReason,
        });
      }

      if (conversationSessionEntry.assistantMessageStatus === "failed") {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-error`,
          partKind: "assistant_error_notice",
          errorText: conversationSessionEntry.failureExplanation,
        });
      }

      if (conversationSessionEntry.assistantMessageStatus === "interrupted") {
        markDanglingHydratedToolCallsAsInterrupted(entryIndex);
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-interrupted`,
          partKind: "assistant_interrupted_notice",
          interruptionReason: conversationSessionEntry.interruptionReason,
        });
      }

      const assistantTurnSummaryPart = createHydratedAssistantTurnSummaryPart({
        conversationSessionEntry,
        entryIndex,
      });
      if (assistantTurnSummaryPart) {
        appendConversationMessagePart(assistantMessageId, assistantTurnSummaryPart);
      }

      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
    }
  });

  markDanglingHydratedToolCallsAsInterrupted(conversationSessionEntries.length);

  return {
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
    conversationMessagePartCount: Object.keys(conversationMessagePartsById).length,
  };
}

function createHydratedAssistantTurnSummaryPart(input: {
  conversationSessionEntry: AssistantMessageConversationSessionEntry;
  entryIndex: number;
}): ConversationMessagePart | undefined {
  if (
    input.conversationSessionEntry.selectedModelId === undefined ||
    input.conversationSessionEntry.turnDurationMs === undefined
  ) {
    return undefined;
  }

  return {
    id: `persisted-entry-${input.entryIndex}-assistant-turn-summary`,
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
  assistantMessageId: string;
  toolCallPartIdByToolCallId: Map<string, string>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  appendConversationMessagePart: (messageId: string, conversationMessagePart: ConversationMessagePart) => void;
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
    return;
  }

  const toolCallPartId = `persisted-entry-${input.entryIndex}-tool-result`;
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

function isToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return (
    conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result"
  );
}
