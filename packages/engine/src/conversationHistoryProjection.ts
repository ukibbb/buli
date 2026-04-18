import type { ConversationSessionEntry, ModelContextItem } from "@buli/contracts";

export function projectConversationSessionEntriesToModelContextItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ModelContextItem[] {
  const modelContextItems: ModelContextItem[] = [];

  for (const conversationSessionEntry of conversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "user_prompt") {
      modelContextItems.push({
        itemKind: "user_message",
        messageText: conversationSessionEntry.modelFacingPromptText,
      });
      continue;
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      modelContextItems.push({
        itemKind: "assistant_message",
        messageText: conversationSessionEntry.assistantMessageText,
      });
      continue;
    }

    if (conversationSessionEntry.entryKind === "tool_call") {
      modelContextItems.push({
        itemKind: "tool_call",
        toolCallId: conversationSessionEntry.toolCallId,
        toolCallRequest: conversationSessionEntry.toolCallRequest,
      });
      continue;
    }

    modelContextItems.push({
      itemKind: "tool_result",
      toolCallId: conversationSessionEntry.toolCallId,
      toolResultText: conversationSessionEntry.toolResultText,
    });
  }

  return modelContextItems;
}
