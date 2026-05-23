import type { ConversationSessionEntry } from "@buli/contracts";

export const emptyConversationSessionTitle = "New session";

export function summarizeConversationSessionTitle(conversationSessionEntries: readonly ConversationSessionEntry[]): string {
  const firstUserPromptEntry = conversationSessionEntries.find(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "user_prompt",
  );
  return firstUserPromptEntry?.promptText.trim() || emptyConversationSessionTitle;
}
