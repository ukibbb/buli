import type { ConversationSessionEntry } from "@buli/contracts";

export const emptyConversationSessionTitle = "New session";
export const maximumConversationSessionTitleLength = 80;

export function summarizeConversationSessionTitle(conversationSessionEntries: readonly ConversationSessionEntry[]): string {
  const firstUserPromptEntry = conversationSessionEntries.find(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "user_prompt",
  );
  const normalizedTitle = firstUserPromptEntry?.promptText.replace(/\s+/g, " ").trim() ?? "";
  if (normalizedTitle.length === 0) {
    return emptyConversationSessionTitle;
  }

  return normalizedTitle.length > maximumConversationSessionTitleLength
    ? `${normalizedTitle.slice(0, maximumConversationSessionTitleLength - 3)}...`
    : normalizedTitle;
}
