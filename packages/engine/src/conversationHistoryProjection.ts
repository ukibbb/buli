import type { ConversationSessionEntry, ModelContextItem, UserPromptConversationSessionEntry } from "@buli/contracts";

type ToolCallConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "tool_call" }>;
type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

type ConversationSessionTurn = {
  userPromptEntry: UserPromptConversationSessionEntry;
  entriesAfterUserPrompt: ConversationSessionEntry[];
};

export function projectConversationSessionEntryToModelContextItems(
  conversationSessionEntry: ConversationSessionEntry,
): ModelContextItem[] {
  if (conversationSessionEntry.entryKind === "user_prompt") {
    return [
      {
        itemKind: "user_message",
        messageText: conversationSessionEntry.modelFacingPromptText,
        ...(conversationSessionEntry.imageAttachments?.length
          ? { imageAttachments: [...conversationSessionEntry.imageAttachments] }
          : {}),
      },
    ];
  }

  if (conversationSessionEntry.entryKind === "assistant_message") {
    if (conversationSessionEntry.assistantMessageStatus === "failed" || conversationSessionEntry.assistantMessageStatus === "interrupted") {
      return [];
    }

    return [
      {
        itemKind: "assistant_message",
        messageText: conversationSessionEntry.assistantMessageText,
      },
    ];
  }

  if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
    return [
      {
        itemKind: "compaction_summary",
        summaryText: conversationSessionEntry.summaryText,
      },
    ];
  }

  return [];
}

export function projectConversationSessionEntriesToModelContextItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ModelContextItem[] {
  const effectiveConversationSessionEntries = sliceConversationSessionEntriesFromLatestCompactionSummary(
    conversationSessionEntries,
  );
  const modelContextItems: ModelContextItem[] = [];
  let pendingConversationSessionTurn: ConversationSessionTurn | undefined;

  for (const conversationSessionEntry of effectiveConversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      pendingConversationSessionTurn = undefined;
      modelContextItems.push(...projectConversationSessionEntryToModelContextItems(conversationSessionEntry));
      continue;
    }

    if (conversationSessionEntry.entryKind === "user_prompt") {
      pendingConversationSessionTurn = {
        userPromptEntry: conversationSessionEntry,
        entriesAfterUserPrompt: [],
      };
      continue;
    }

    if (!pendingConversationSessionTurn) {
      continue;
    }

    pendingConversationSessionTurn.entriesAfterUserPrompt.push(conversationSessionEntry);
    if (conversationSessionEntry.entryKind === "assistant_message") {
      modelContextItems.push(...projectConversationSessionTurnToModelContextItems(pendingConversationSessionTurn));
      pendingConversationSessionTurn = undefined;
    }
  }

  if (pendingConversationSessionTurn?.entriesAfterUserPrompt.length === 0) {
    modelContextItems.push(...projectConversationSessionEntryToModelContextItems(pendingConversationSessionTurn.userPromptEntry));
  }

  return modelContextItems;
}

function sliceConversationSessionEntriesFromLatestCompactionSummary(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): readonly ConversationSessionEntry[] {
  const latestCompactionSummaryEntryIndex = conversationSessionEntries.findLastIndex(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "conversation_compaction_summary",
  );

  return latestCompactionSummaryEntryIndex === -1
    ? conversationSessionEntries
    : conversationSessionEntries.slice(latestCompactionSummaryEntryIndex);
}

function projectConversationSessionTurnToModelContextItems(
  conversationSessionTurn: ConversationSessionTurn,
): ModelContextItem[] {
  const terminalAssistantMessageEntry = conversationSessionTurn.entriesAfterUserPrompt.at(-1);
  if (!terminalAssistantMessageEntry || terminalAssistantMessageEntry.entryKind !== "assistant_message") {
    return [];
  }

  if (
    terminalAssistantMessageEntry.assistantMessageStatus === "failed" ||
    terminalAssistantMessageEntry.assistantMessageStatus === "interrupted"
  ) {
    const pairedToolModelContextItems = projectPairedToolEntriesToModelContextItems(conversationSessionTurn.entriesAfterUserPrompt.slice(0, -1));
    return pairedToolModelContextItems.length > 0
      ? [
          ...projectConversationSessionEntryToModelContextItems(conversationSessionTurn.userPromptEntry),
          ...pairedToolModelContextItems,
        ]
      : [];
  }

  return [
    ...projectConversationSessionEntryToModelContextItems(conversationSessionTurn.userPromptEntry),
    ...projectPairedToolEntriesToModelContextItems(conversationSessionTurn.entriesAfterUserPrompt.slice(0, -1)),
    ...projectConversationSessionEntryToModelContextItems(terminalAssistantMessageEntry),
  ];
}

function projectPairedToolEntriesToModelContextItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ModelContextItem[] {
  const modelContextItems: ModelContextItem[] = [];
  const toolResultEntryByToolCallId = new Map<string, ToolResultConversationSessionEntry>();
  const projectedToolCallIds = new Set<string>();

  for (const conversationSessionEntry of conversationSessionEntries) {
    if (!isToolResultConversationSessionEntry(conversationSessionEntry) || toolResultEntryByToolCallId.has(conversationSessionEntry.toolCallId)) {
      continue;
    }

    toolResultEntryByToolCallId.set(conversationSessionEntry.toolCallId, conversationSessionEntry);
  }

  for (const conversationSessionEntry of conversationSessionEntries) {
    if (conversationSessionEntry.entryKind !== "tool_call" || projectedToolCallIds.has(conversationSessionEntry.toolCallId)) {
      continue;
    }

    const toolResultEntry = toolResultEntryByToolCallId.get(conversationSessionEntry.toolCallId);
    if (!toolResultEntry) {
      continue;
    }

    modelContextItems.push(
      projectToolCallConversationSessionEntryToModelContextItem(conversationSessionEntry),
      projectToolResultConversationSessionEntryToModelContextItem(toolResultEntry),
    );
    projectedToolCallIds.add(conversationSessionEntry.toolCallId);
  }

  return modelContextItems;
}

function projectToolCallConversationSessionEntryToModelContextItem(
  conversationSessionEntry: ToolCallConversationSessionEntry,
): ModelContextItem {
  return {
    itemKind: "tool_call",
    toolCallId: conversationSessionEntry.toolCallId,
    toolCallRequest: conversationSessionEntry.toolCallRequest,
  };
}

function projectToolResultConversationSessionEntryToModelContextItem(
  conversationSessionEntry: ToolResultConversationSessionEntry,
): ModelContextItem {
  return {
    itemKind: "tool_result",
    toolCallId: conversationSessionEntry.toolCallId,
    toolResultText: conversationSessionEntry.toolResultText,
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
