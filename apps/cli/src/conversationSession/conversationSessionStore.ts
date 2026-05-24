import type {
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
} from "@buli/contracts";

export type ActiveConversationSession = {
  sessionId: string;
  modelSelection: ConversationSessionModelSelection | undefined;
  conversationSessionEntries: readonly ConversationSessionEntry[];
};

export type ActiveConversationSessionMetadata = {
  sessionId: string;
  modelSelection: ConversationSessionModelSelection | undefined;
  conversationSessionEntryCount: number;
};

export type StartNewConversationSessionInput = {
  modelSelection?: ConversationSessionModelSelection | undefined;
};

export type DeleteConversationSessionInput = {
  replacementModelSelection?: ConversationSessionModelSelection | undefined;
};

export type ConversationSessionStore = {
  readonly storagePath?: string;
  readonly promptCacheKey?: string;
  loadActiveConversationSessionMetadata(): ActiveConversationSessionMetadata;
  loadActiveConversationSession(): ActiveConversationSession;
  loadConversationSessionEntries(conversationSessionId?: string | undefined): readonly ConversationSessionEntry[];
  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void;
  saveActiveConversationSessionModelSelection(modelSelection: ConversationSessionModelSelection): void;
  saveConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void;
  startNewConversationSession(input?: StartNewConversationSessionInput): ActiveConversationSession;
  listConversationSessions(): readonly ConversationSessionSummary[];
  switchActiveConversationSession(sessionId: string): ActiveConversationSession;
  deleteConversationSession(sessionId: string, input?: DeleteConversationSessionInput): ActiveConversationSession;
};
