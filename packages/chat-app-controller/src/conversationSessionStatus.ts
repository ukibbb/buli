export type ConversationSessionExportStatus =
  | { step: "idle" }
  | { step: "failed"; errorMessage: string };

export type ConversationSessionCompactionStatus =
  | { step: "idle" }
  | { step: "compacting"; source: "manual" | "auto" }
  | { step: "failed"; errorMessage: string };

export function isConversationSessionCompactionBlockingPromptInput(
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus,
): boolean {
  return conversationSessionCompactionStatus.step === "compacting" && conversationSessionCompactionStatus.source === "manual";
}

export function isAutoConversationSessionCompactionRunning(
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus,
): boolean {
  return conversationSessionCompactionStatus.step === "compacting" && conversationSessionCompactionStatus.source === "auto";
}
