export type ConversationSessionExportStatus =
  | { step: "idle" }
  | { step: "failed"; errorMessage: string };

export type ConversationSessionCompactionStatus =
  | { step: "idle" }
  | { step: "compacting"; source: "manual" | "auto" }
  | { step: "failed"; errorMessage: string };
