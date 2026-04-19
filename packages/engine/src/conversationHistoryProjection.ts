import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";

export function projectConversationSessionEntryToModelContextItems(
  conversationSessionEntry: ConversationSessionEntry,
): ModelContextItem[] {
  if (conversationSessionEntry.entryKind === "user_prompt") {
    return [
      {
        itemKind: "user_message",
        messageText: conversationSessionEntry.modelFacingPromptText,
      },
    ];
  }

  if (conversationSessionEntry.entryKind === "assistant_message") {
    return [
      {
        itemKind: "assistant_message",
        messageText: conversationSessionEntry.assistantMessageText,
      },
    ];
  }

  if (conversationSessionEntry.entryKind === "tool_call") {
    return [
      {
        itemKind: "tool_call",
        toolCallId: conversationSessionEntry.toolCallId,
        toolCallRequest: conversationSessionEntry.toolCallRequest,
      },
    ];
  }

  return [
    {
      itemKind: "tool_result",
      toolCallId: conversationSessionEntry.toolCallId,
      toolResultText: conversationSessionEntry.toolResultText,
    },
  ];
}

export function projectConversationSessionEntriesToModelContextItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ModelContextItem[] {
  const modelContextItems: ModelContextItem[] = [];

  for (const conversationSessionEntry of conversationSessionEntries) {
    modelContextItems.push(...projectConversationSessionEntryToModelContextItems(conversationSessionEntry));
  }

  return modelContextItems;
}
