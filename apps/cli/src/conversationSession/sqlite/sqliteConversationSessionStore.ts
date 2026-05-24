import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import type {
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
} from "@buli/contracts";
import {
  type ActiveConversationSessionMetadata,
  type ActiveConversationSession,
  type ConversationSessionStore,
  type DeleteConversationSessionInput,
  type StartNewConversationSessionInput,
} from "../conversationSessionStore.ts";
import {
  createConversationSessionPromptCacheKey,
  defaultConversationSessionDatabasePath,
} from "../conversationSessionStoragePaths.ts";
import {
  emptyConversationSessionTitle,
  summarizeConversationSessionTitle,
} from "../conversationSessionTitle.ts";
import {
  openConversationSessionSqliteDatabase,
  runImmediateConversationSessionSqliteTransaction,
} from "./sqliteConversationSessionDatabase.ts";
import {
  ConversationSessionSqliteGateway,
  type PersistedConversationSessionMetadata,
  type RecordedConversationSessionEntry,
} from "./sqliteConversationSessionGateway.ts";

type ConversationSessionIdFactory = () => string;
type ConversationSessionEntryIdFactory = () => string;
type ClockMilliseconds = () => number;

export class SqliteConversationSessionStore implements ConversationSessionStore {
  readonly storagePath: string;
  readonly promptCacheKey: string;
  readonly workspaceRootPath: string;
  readonly createSessionId: ConversationSessionIdFactory;
  readonly createSessionEntryId: ConversationSessionEntryIdFactory;
  readonly nowMs: ClockMilliseconds;
  private readonly database: Database;
  private readonly gateway: ConversationSessionSqliteGateway;

  constructor(input: {
    databasePath?: string;
    workspaceRootPath?: string;
    createSessionId?: ConversationSessionIdFactory;
    createSessionEntryId?: ConversationSessionEntryIdFactory;
    nowMs?: ClockMilliseconds;
  } = {}) {
    this.workspaceRootPath = resolve(input.workspaceRootPath ?? process.cwd());
    this.storagePath = input.databasePath ?? defaultConversationSessionDatabasePath({ workspaceRootPath: this.workspaceRootPath });
    this.promptCacheKey = createConversationSessionPromptCacheKey({ workspaceRootPath: this.workspaceRootPath });
    this.createSessionId = input.createSessionId ?? randomUUID;
    this.createSessionEntryId = input.createSessionEntryId ?? (() => randomUUID().slice(0, 12));
    this.nowMs = input.nowMs ?? (() => Date.now());
    this.database = openConversationSessionSqliteDatabase(this.storagePath);
    this.gateway = new ConversationSessionSqliteGateway({
      database: this.database,
      workspaceRootPath: this.workspaceRootPath,
    });
  }

  close(): void {
    this.database.close();
  }

  loadActiveConversationSessionMetadata(): ActiveConversationSessionMetadata {
    return mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(
      this.runImmediateTransaction(() => this.loadActiveConversationSessionMetadataInTransaction()),
    );
  }

  loadActiveConversationSession(): ActiveConversationSession {
    return this.runImmediateTransaction(() => this.loadActiveConversationSessionInTransaction());
  }

  loadConversationSessionEntries(conversationSessionId?: string | undefined): readonly ConversationSessionEntry[] {
    return this.runImmediateTransaction(() => {
      const sessionId = conversationSessionId ?? this.loadActiveConversationSessionMetadataInTransaction().sessionId;
      this.loadConversationSessionMetadataOrThrow(sessionId);
      return this.gateway.loadConversationSessionEntries(sessionId);
    });
  }

  appendConversationSessionEntry(conversationSessionEntry: ConversationSessionEntry): void {
    this.runImmediateTransaction(() => {
      const activeConversationSession = this.loadActiveConversationSessionMetadataInTransaction();
      const recordedConversationSessionEntry = this.recordConversationSessionEntry({
        conversationSessionEntry,
        entrySequence: activeConversationSession.conversationSessionEntryCount,
      });

      this.gateway.insertConversationSessionEntry({
        sessionId: activeConversationSession.sessionId,
        recordedConversationSessionEntry,
      });
      this.updateConversationSessionSummaryAfterAppendingEntry({
        activeConversationSession,
        conversationSessionEntry,
        entryRecordedAtMs: recordedConversationSessionEntry.recordedAtMs,
      });
      this.gateway.writeActiveConversationSessionId(activeConversationSession.sessionId);
    });
  }

  saveActiveConversationSessionModelSelection(modelSelection: ConversationSessionModelSelection): void {
    this.runImmediateTransaction(() => {
      const activeConversationSession = this.loadActiveConversationSessionMetadataInTransaction();
      if (areConversationSessionModelSelectionsEqual(activeConversationSession.modelSelection, modelSelection)) {
        return;
      }

      this.gateway.insertConversationSessionModelSelection({
        sessionId: activeConversationSession.sessionId,
        recordedAtMs: this.nowMs(),
        modelSelection,
      });
      this.gateway.updateConversationSessionCurrentModelSelection({
        sessionId: activeConversationSession.sessionId,
        modelSelection,
      });
    });
  }

  saveConversationSessionEntries(conversationSessionEntries: readonly ConversationSessionEntry[]): void {
    this.runImmediateTransaction(() => {
      const activeConversationSession = this.loadActiveConversationSessionMetadataInTransaction();
      const recordedConversationSessionEntries = conversationSessionEntries.map((conversationSessionEntry, entrySequence) =>
        this.recordConversationSessionEntry({ conversationSessionEntry, entrySequence })
      );
      const latestRecordedConversationSessionEntry = recordedConversationSessionEntries.at(-1);

      this.gateway.replaceConversationSessionEntries({
        sessionId: activeConversationSession.sessionId,
        recordedConversationSessionEntries,
      });
      this.gateway.updateConversationSessionSummary({
        sessionId: activeConversationSession.sessionId,
        title: summarizeConversationSessionTitle(conversationSessionEntries),
        updatedAtMs: latestRecordedConversationSessionEntry?.recordedAtMs ?? activeConversationSession.createdAtMs,
        conversationSessionEntryCount: conversationSessionEntries.length,
      });
      this.gateway.writeActiveConversationSessionId(activeConversationSession.sessionId);
    });
  }

  startNewConversationSession(input: StartNewConversationSessionInput = {}): ActiveConversationSession {
    return this.runImmediateTransaction(() => this.startNewConversationSessionInTransaction(input));
  }

  listConversationSessions(): readonly ConversationSessionSummary[] {
    return this.gateway.listConversationSessionSummaries();
  }

  switchActiveConversationSession(sessionId: string): ActiveConversationSession {
    return this.runImmediateTransaction(() => {
      const conversationSession = this.loadConversationSessionMetadataOrThrow(sessionId);
      this.gateway.writeActiveConversationSessionId(sessionId);
      return this.loadActiveConversationSessionFromMetadata(conversationSession);
    });
  }

  deleteConversationSession(sessionId: string, input: DeleteConversationSessionInput = {}): ActiveConversationSession {
    return this.runImmediateTransaction(() => {
      this.loadConversationSessionMetadataOrThrow(sessionId);
      this.gateway.deleteConversationSession(sessionId);

      const activeConversationSession = this.gateway.loadActiveConversationSessionMetadataIfPresent();
      if (activeConversationSession) {
        return this.loadActiveConversationSessionFromMetadata(activeConversationSession);
      }

      const mostRecentlyUpdatedSession = this.gateway.loadMostRecentlyUpdatedConversationSessionMetadata();
      if (mostRecentlyUpdatedSession) {
        this.gateway.writeActiveConversationSessionId(mostRecentlyUpdatedSession.sessionId);
        return this.loadActiveConversationSessionFromMetadata(mostRecentlyUpdatedSession);
      }

      return this.startNewConversationSessionInTransaction({ modelSelection: input.replacementModelSelection });
    });
  }

  private runImmediateTransaction<T>(writeConversationSession: () => T): T {
    return runImmediateConversationSessionSqliteTransaction(this.database, writeConversationSession);
  }

  private loadActiveConversationSessionInTransaction(): ActiveConversationSession {
    return this.loadActiveConversationSessionFromMetadata(this.loadActiveConversationSessionMetadataInTransaction());
  }

  private loadActiveConversationSessionMetadataInTransaction(): PersistedConversationSessionMetadata {
    const activeConversationSession = this.gateway.loadActiveConversationSessionMetadataIfPresent();
    if (activeConversationSession) {
      return activeConversationSession;
    }

    const mostRecentlyUpdatedSession = this.gateway.loadMostRecentlyUpdatedConversationSessionMetadata();
    if (mostRecentlyUpdatedSession) {
      this.gateway.writeActiveConversationSessionId(mostRecentlyUpdatedSession.sessionId);
      return mostRecentlyUpdatedSession;
    }

    return this.createNewConversationSessionMetadata({});
  }

  private loadConversationSessionMetadataOrThrow(sessionId: string): PersistedConversationSessionMetadata {
    const conversationSession = this.gateway.loadConversationSessionMetadataById(sessionId);
    if (!conversationSession) {
      throw new Error(`Conversation session not found: ${sessionId}`);
    }

    return conversationSession;
  }

  private loadActiveConversationSessionFromMetadata(
    conversationSession: PersistedConversationSessionMetadata,
  ): ActiveConversationSession {
    return {
      sessionId: conversationSession.sessionId,
      modelSelection: conversationSession.modelSelection,
      conversationSessionEntries: this.gateway.loadConversationSessionEntries(conversationSession.sessionId),
    };
  }

  private startNewConversationSessionInTransaction(input: StartNewConversationSessionInput): ActiveConversationSession {
    const conversationSession = this.createNewConversationSessionMetadata(input);
    return {
      sessionId: conversationSession.sessionId,
      modelSelection: conversationSession.modelSelection,
      conversationSessionEntries: [],
    };
  }

  private createNewConversationSessionMetadata(
    input: StartNewConversationSessionInput,
  ): PersistedConversationSessionMetadata {
    const sessionId = this.createSessionId();
    const createdAtMs = this.nowMs();
    const conversationSession = this.gateway.insertConversationSessionMetadata({
      sessionId,
      createdAtMs,
      title: emptyConversationSessionTitle,
      modelSelection: input.modelSelection,
    });

    if (input.modelSelection) {
      this.gateway.insertConversationSessionModelSelection({
        sessionId,
        recordedAtMs: createdAtMs,
        modelSelection: input.modelSelection,
      });
    }
    this.gateway.writeActiveConversationSessionId(sessionId);

    return conversationSession;
  }

  private recordConversationSessionEntry(input: {
    conversationSessionEntry: ConversationSessionEntry;
    entrySequence: number;
  }): RecordedConversationSessionEntry {
    return {
      conversationSessionEntry: input.conversationSessionEntry,
      entrySequence: input.entrySequence,
      sessionEntryId: this.createSessionEntryId(),
      recordedAtMs: this.nowMs(),
    };
  }

  private updateConversationSessionSummaryAfterAppendingEntry(input: {
    activeConversationSession: PersistedConversationSessionMetadata;
    conversationSessionEntry: ConversationSessionEntry;
    entryRecordedAtMs: number;
  }): void {
    const nextEntryCount = input.activeConversationSession.conversationSessionEntryCount + 1;
    const nextTitle = input.activeConversationSession.conversationSessionEntryCount === 0
      ? summarizeConversationSessionTitle([input.conversationSessionEntry])
      : input.activeConversationSession.title;
    this.gateway.updateConversationSessionSummary({
      sessionId: input.activeConversationSession.sessionId,
      title: nextTitle,
      updatedAtMs: input.entryRecordedAtMs,
      conversationSessionEntryCount: nextEntryCount,
    });
  }
}

function areConversationSessionModelSelectionsEqual(
  left: ConversationSessionModelSelection | undefined,
  right: ConversationSessionModelSelection,
): boolean {
  if (!left) {
    return false;
  }

  return left.selectedModelId === right.selectedModelId &&
    left.selectedModelDefaultReasoningEffort === right.selectedModelDefaultReasoningEffort &&
    left.selectedReasoningEffort === right.selectedReasoningEffort;
}

function mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(
  conversationSession: PersistedConversationSessionMetadata,
): ActiveConversationSessionMetadata {
  return {
    sessionId: conversationSession.sessionId,
    modelSelection: conversationSession.modelSelection,
    conversationSessionEntryCount: conversationSession.conversationSessionEntryCount,
  };
}
