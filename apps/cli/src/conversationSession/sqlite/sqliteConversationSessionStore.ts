import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import type {
  BuliDiagnosticLogFields,
  BuliDiagnosticLogger,
  ConversationSessionEntry,
  ConversationSessionModelSelection,
  ConversationSessionSummary,
} from "@buli/contracts";
import {
  type ActiveConversationSessionMetadata,
  type ActiveConversationSession,
  type AppendConversationSessionEntryToSessionInput,
  type ConversationSessionEntryRecordSlice,
  type ConversationSessionEntryRecordSliceLoadRequest,
  type ConversationSessionStore,
  type DeleteConversationSessionInput,
  type ReplaceConversationSessionEntriesForSessionInput,
  type SaveConversationSessionModelSelectionForSessionInput,
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
import { logCliDiagnosticEvent } from "../../diagnostics/cliDiagnosticLog.ts";
import {
  ConversationSessionSqliteGateway,
  type PersistedConversationSessionMetadata,
  type RecordedConversationSessionEntry,
} from "./sqliteConversationSessionGateway.ts";

type ConversationSessionIdFactory = () => string;
type ConversationSessionEntryIdFactory = () => string;
type ClockMilliseconds = () => number;
type ConversationSessionStorageOperationName =
  | "load_active_metadata"
  | "load_active_session"
  | "load_entries"
  | "load_entry_records"
  | "append_entry"
  | "save_model_selection"
  | "replace_entries"
  | "start_new_session"
  | "list_sessions"
  | "switch_active_session"
  | "delete_session";

type ConversationSessionStorageTransactionKind = "read" | "write";

export class SqliteConversationSessionStore implements ConversationSessionStore {
  readonly storagePath: string;
  readonly promptCacheKey: string;
  readonly workspaceRootPath: string;
  readonly createSessionId: ConversationSessionIdFactory;
  readonly createSessionEntryId: ConversationSessionEntryIdFactory;
  readonly nowMs: ClockMilliseconds;
  private readonly diagnosticLogger: BuliDiagnosticLogger | undefined;
  private readonly database: Database;
  private readonly gateway: ConversationSessionSqliteGateway;

  constructor(input: {
    databasePath?: string;
    workspaceRootPath?: string;
    createSessionId?: ConversationSessionIdFactory;
    createSessionEntryId?: ConversationSessionEntryIdFactory;
    nowMs?: ClockMilliseconds;
    diagnosticLogger?: BuliDiagnosticLogger | undefined;
  } = {}) {
    this.workspaceRootPath = resolve(input.workspaceRootPath ?? process.cwd());
    this.storagePath = input.databasePath ?? defaultConversationSessionDatabasePath({ workspaceRootPath: this.workspaceRootPath });
    this.promptCacheKey = createConversationSessionPromptCacheKey({ workspaceRootPath: this.workspaceRootPath });
    this.createSessionId = input.createSessionId ?? randomUUID;
    this.createSessionEntryId = input.createSessionEntryId ?? (() => randomUUID().slice(0, 12));
    this.nowMs = input.nowMs ?? (() => Date.now());
    this.diagnosticLogger = input.diagnosticLogger;
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
    return this.runMeasuredStorageOperation({
      operationName: "load_active_metadata",
      transactionKind: "read",
      createCompletedFields: (activeConversationSessionMetadata) => ({
        conversationSessionId: activeConversationSessionMetadata.sessionId,
        conversationSessionEntryCount: activeConversationSessionMetadata.conversationSessionEntryCount,
      }),
    }, () =>
      mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(
        this.runImmediateTransaction(() => this.loadActiveConversationSessionMetadataInTransaction()),
      )
    );
  }

  loadActiveConversationSession(): ActiveConversationSession {
    return this.runMeasuredStorageOperation({
      operationName: "load_active_session",
      transactionKind: "read",
      createCompletedFields: (activeConversationSession) => ({
        conversationSessionId: activeConversationSession.sessionId,
        conversationSessionEntryCount: activeConversationSession.conversationSessionEntries.length,
      }),
    }, () => this.runImmediateTransaction(() => this.loadActiveConversationSessionInTransaction()));
  }

  loadConversationSessionEntries(conversationSessionId?: string | undefined): readonly ConversationSessionEntry[] {
    let loadedConversationSessionId = conversationSessionId;
    return this.runMeasuredStorageOperation({
      operationName: "load_entries",
      transactionKind: "read",
      fields: {
        requestedConversationSessionId: conversationSessionId ?? null,
      },
      createCompletedFields: (conversationSessionEntries) => ({
        conversationSessionId: loadedConversationSessionId ?? null,
        conversationSessionEntryCount: conversationSessionEntries.length,
      }),
    }, () => this.runImmediateTransaction(() => {
      const sessionId = conversationSessionId ?? this.loadActiveConversationSessionMetadataInTransaction().sessionId;
      loadedConversationSessionId = sessionId;
      this.loadConversationSessionMetadataOrThrow(sessionId);
      return this.gateway.loadConversationSessionEntries(sessionId);
    }));
  }

  loadConversationSessionEntryRecords(
    request: ConversationSessionEntryRecordSliceLoadRequest,
  ): ConversationSessionEntryRecordSlice {
    let loadedConversationSessionId = request.conversationSessionId;
    const normalizedLimit = normalizeConversationSessionEntryRecordLimit(request.limit);
    return this.runMeasuredStorageOperation({
      operationName: "load_entry_records",
      transactionKind: "read",
      fields: {
        requestedConversationSessionId: request.conversationSessionId ?? null,
        loadKind: request.loadKind,
        requestedEntryRecordLimit: request.limit,
        entryRecordLimit: normalizedLimit,
      },
      createCompletedFields: (conversationSessionEntryRecordSlice) => ({
        conversationSessionId: conversationSessionEntryRecordSlice.conversationSessionId,
        conversationSessionEntryRecordCount: conversationSessionEntryRecordSlice.entryRecords.length,
        hasOlderEntries: conversationSessionEntryRecordSlice.hasOlderEntries,
        hasNewerEntries: conversationSessionEntryRecordSlice.hasNewerEntries,
        latestCompactionSummaryEntrySequence: conversationSessionEntryRecordSlice.latestCompactionSummaryEntrySequence ?? null,
      }),
    }, () => this.runImmediateTransaction(() => {
      const sessionId = request.conversationSessionId ?? this.loadActiveConversationSessionMetadataInTransaction().sessionId;
      loadedConversationSessionId = sessionId;
      this.loadConversationSessionMetadataOrThrow(sessionId);
      const persistedEntryRecordSlice = request.loadKind === "latest"
        ? this.gateway.loadLatestConversationSessionEntryRecords({ sessionId, limit: normalizedLimit })
        : request.loadKind === "before"
        ? this.gateway.loadConversationSessionEntryRecordsBefore({
          sessionId,
          beforeEntrySequence: request.beforeEntrySequence,
          limit: normalizedLimit,
        })
        : this.gateway.loadConversationSessionEntryRecordsAfter({
          sessionId,
          afterEntrySequence: request.afterEntrySequence,
          limit: normalizedLimit,
        });

      return {
        conversationSessionId: loadedConversationSessionId,
        entryRecords: persistedEntryRecordSlice.entryRecords,
        hasOlderEntries: persistedEntryRecordSlice.hasOlderEntries,
        hasNewerEntries: persistedEntryRecordSlice.hasNewerEntries,
        latestCompactionSummaryEntrySequence: this.gateway.loadLatestCompactionSummaryEntrySequence(sessionId),
      };
    }));
  }

  appendConversationSessionEntryToSession(input: AppendConversationSessionEntryToSessionInput): void {
    this.runMeasuredStorageOperation({
      operationName: "append_entry",
      transactionKind: "write",
      fields: {
        conversationSessionId: input.conversationSessionId,
        conversationSessionEntryKind: input.conversationSessionEntry.entryKind,
        serializedConversationSessionEntryTextLength: this.measureSerializedConversationSessionEntryTextLength(
          input.conversationSessionEntry,
        ),
      },
    }, () => this.runImmediateTransaction(() => {
      const conversationSession = this.loadConversationSessionMetadataOrThrow(input.conversationSessionId);
      const recordedConversationSessionEntry = this.recordConversationSessionEntry({
        conversationSessionEntry: input.conversationSessionEntry,
        entrySequence: conversationSession.conversationSessionEntryCount,
      });

      this.gateway.insertConversationSessionEntry({
        sessionId: conversationSession.sessionId,
        recordedConversationSessionEntry,
      });
      this.updateConversationSessionSummaryAfterAppendingEntry({
        conversationSession,
        conversationSessionEntry: input.conversationSessionEntry,
        entryRecordedAtMs: recordedConversationSessionEntry.recordedAtMs,
      });
    }));
  }

  saveConversationSessionModelSelectionForSession(input: SaveConversationSessionModelSelectionForSessionInput): void {
    this.runMeasuredStorageOperation({
      operationName: "save_model_selection",
      transactionKind: "write",
      fields: {
        conversationSessionId: input.conversationSessionId,
        selectedModelId: input.modelSelection.selectedModelId,
        selectedModelDefaultReasoningEffort: input.modelSelection.selectedModelDefaultReasoningEffort ?? null,
        selectedReasoningEffort: input.modelSelection.selectedReasoningEffort ?? null,
      },
    }, () => this.runImmediateTransaction(() => {
      const conversationSession = this.loadConversationSessionMetadataOrThrow(input.conversationSessionId);
      if (areConversationSessionModelSelectionsEqual(conversationSession.modelSelection, input.modelSelection)) {
        return;
      }

      this.gateway.insertConversationSessionModelSelection({
        sessionId: conversationSession.sessionId,
        recordedAtMs: this.nowMs(),
        modelSelection: input.modelSelection,
      });
      this.gateway.updateConversationSessionCurrentModelSelection({
        sessionId: conversationSession.sessionId,
        modelSelection: input.modelSelection,
      });
    }));
  }

  replaceConversationSessionEntriesForSession(input: ReplaceConversationSessionEntriesForSessionInput): void {
    this.runMeasuredStorageOperation({
      operationName: "replace_entries",
      transactionKind: "write",
      fields: {
        conversationSessionId: input.conversationSessionId,
        conversationSessionEntryCount: input.conversationSessionEntries.length,
        serializedConversationSessionEntriesTextLength: this.measureSerializedConversationSessionEntriesTextLength(
          input.conversationSessionEntries,
        ),
      },
    }, () => this.runImmediateTransaction(() => {
      const conversationSession = this.loadConversationSessionMetadataOrThrow(input.conversationSessionId);
      const recordedConversationSessionEntries = input.conversationSessionEntries.map((conversationSessionEntry, entrySequence) =>
        this.recordConversationSessionEntry({ conversationSessionEntry, entrySequence })
      );
      const latestRecordedConversationSessionEntry = recordedConversationSessionEntries.at(-1);

      this.gateway.replaceConversationSessionEntries({
        sessionId: conversationSession.sessionId,
        recordedConversationSessionEntries,
      });
      this.gateway.updateConversationSessionSummary({
        sessionId: conversationSession.sessionId,
        title: summarizeConversationSessionTitle(input.conversationSessionEntries),
        updatedAtMs: latestRecordedConversationSessionEntry?.recordedAtMs ?? conversationSession.createdAtMs,
        conversationSessionEntryCount: input.conversationSessionEntries.length,
      });
    }));
  }

  startNewConversationSession(input: StartNewConversationSessionInput = {}): ActiveConversationSession {
    return this.runMeasuredStorageOperation({
      operationName: "start_new_session",
      transactionKind: "write",
      createCompletedFields: (activeConversationSession) => ({
        conversationSessionId: activeConversationSession.sessionId,
        conversationSessionEntryCount: activeConversationSession.conversationSessionEntries.length,
        selectedModelId: activeConversationSession.modelSelection?.selectedModelId ?? null,
      }),
    }, () => this.runImmediateTransaction(() => this.startNewConversationSessionInTransaction(input)));
  }

  listConversationSessions(): readonly ConversationSessionSummary[] {
    return this.runMeasuredStorageOperation({
      operationName: "list_sessions",
      transactionKind: "read",
      createCompletedFields: (conversationSessions) => ({
        conversationSessionCount: conversationSessions.length,
      }),
    }, () => this.gateway.listConversationSessionSummaries());
  }

  switchActiveConversationSession(sessionId: string): ActiveConversationSession {
    return this.runMeasuredStorageOperation({
      operationName: "switch_active_session",
      transactionKind: "write",
      fields: {
        requestedConversationSessionId: sessionId,
      },
      createCompletedFields: (activeConversationSession) => ({
        conversationSessionId: activeConversationSession.sessionId,
        conversationSessionEntryCount: activeConversationSession.conversationSessionEntries.length,
      }),
    }, () => this.runImmediateTransaction(() => {
      const conversationSession = this.loadConversationSessionMetadataOrThrow(sessionId);
      this.gateway.writeActiveConversationSessionId(sessionId);
      return this.loadActiveConversationSessionFromMetadata(conversationSession);
    }));
  }

  switchActiveConversationSessionMetadata(sessionId: string): ActiveConversationSessionMetadata {
    return this.runMeasuredStorageOperation({
      operationName: "switch_active_session",
      transactionKind: "write",
      fields: {
        requestedConversationSessionId: sessionId,
      },
      createCompletedFields: (activeConversationSessionMetadata) => ({
        conversationSessionId: activeConversationSessionMetadata.sessionId,
        conversationSessionEntryCount: activeConversationSessionMetadata.conversationSessionEntryCount,
      }),
    }, () => this.runImmediateTransaction(() => {
      const conversationSession = this.loadConversationSessionMetadataOrThrow(sessionId);
      this.gateway.writeActiveConversationSessionId(sessionId);
      return mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(conversationSession);
    }));
  }

  deleteConversationSession(sessionId: string, input: DeleteConversationSessionInput = {}): ActiveConversationSession {
    return this.runMeasuredStorageOperation({
      operationName: "delete_session",
      transactionKind: "write",
      fields: {
        deletedConversationSessionId: sessionId,
      },
      createCompletedFields: (activeConversationSession) => ({
        activeConversationSessionId: activeConversationSession.sessionId,
        activeConversationSessionEntryCount: activeConversationSession.conversationSessionEntries.length,
      }),
    }, () => this.runImmediateTransaction(() => {
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
    }));
  }

  deleteConversationSessionAndLoadActiveMetadata(
    sessionId: string,
    input: DeleteConversationSessionInput = {},
  ): ActiveConversationSessionMetadata {
    return this.runMeasuredStorageOperation({
      operationName: "delete_session",
      transactionKind: "write",
      fields: {
        deletedConversationSessionId: sessionId,
      },
      createCompletedFields: (activeConversationSessionMetadata) => ({
        activeConversationSessionId: activeConversationSessionMetadata.sessionId,
        activeConversationSessionEntryCount: activeConversationSessionMetadata.conversationSessionEntryCount,
      }),
    }, () => this.runImmediateTransaction(() => {
      this.loadConversationSessionMetadataOrThrow(sessionId);
      this.gateway.deleteConversationSession(sessionId);

      const activeConversationSession = this.gateway.loadActiveConversationSessionMetadataIfPresent();
      if (activeConversationSession) {
        return mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(activeConversationSession);
      }

      const mostRecentlyUpdatedSession = this.gateway.loadMostRecentlyUpdatedConversationSessionMetadata();
      if (mostRecentlyUpdatedSession) {
        this.gateway.writeActiveConversationSessionId(mostRecentlyUpdatedSession.sessionId);
        return mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(mostRecentlyUpdatedSession);
      }

      const newConversationSession = this.createNewConversationSessionMetadata({ modelSelection: input.replacementModelSelection });
      this.gateway.writeActiveConversationSessionId(newConversationSession.sessionId);
      return mapPersistedConversationSessionMetadataToActiveConversationSessionMetadata(newConversationSession);
    }));
  }

  private runMeasuredStorageOperation<T>(input: {
    operationName: ConversationSessionStorageOperationName;
    transactionKind: ConversationSessionStorageTransactionKind;
    fields?: BuliDiagnosticLogFields | undefined;
    createCompletedFields?: ((result: T) => BuliDiagnosticLogFields) | undefined;
  }, runStorageOperation: () => T): T {
    const operationStartedAtMs = Date.now();
    try {
      const result = runStorageOperation();
      this.logStorageOperationSummary({
        operationName: input.operationName,
        transactionKind: input.transactionKind,
        operationStatus: "completed",
        durationMs: Date.now() - operationStartedAtMs,
        fields: {
          ...(input.fields ?? {}),
          ...(input.createCompletedFields?.(result) ?? {}),
        },
      });
      return result;
    } catch (error) {
      this.logStorageOperationSummary({
        operationName: input.operationName,
        transactionKind: input.transactionKind,
        operationStatus: "failed",
        durationMs: Date.now() - operationStartedAtMs,
        fields: {
          ...(input.fields ?? {}),
          errorMessage: formatUnknownErrorMessage(error),
        },
      });
      throw error;
    }
  }

  private logStorageOperationSummary(input: {
    operationName: ConversationSessionStorageOperationName;
    transactionKind: ConversationSessionStorageTransactionKind;
    operationStatus: "completed" | "failed";
    durationMs: number;
    fields: BuliDiagnosticLogFields;
  }): void {
    logCliDiagnosticEvent(this.diagnosticLogger, "conversation_session_storage.operation_summary", {
      conversationSessionStoragePath: this.storagePath,
      operationName: input.operationName,
      transactionKind: input.transactionKind,
      usesImmediateTransaction: input.operationName !== "list_sessions",
      operationStatus: input.operationStatus,
      durationMs: input.durationMs,
      ...input.fields,
    });
  }

  private measureSerializedConversationSessionEntryTextLength(conversationSessionEntry: ConversationSessionEntry): number {
    return this.diagnosticLogger ? JSON.stringify(conversationSessionEntry).length : 0;
  }

  private measureSerializedConversationSessionEntriesTextLength(
    conversationSessionEntries: readonly ConversationSessionEntry[],
  ): number {
    return this.diagnosticLogger ? conversationSessionEntries.reduce(
      (serializedTextLength, conversationSessionEntry) =>
        serializedTextLength + JSON.stringify(conversationSessionEntry).length,
      0,
    ) : 0;
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
    conversationSession: PersistedConversationSessionMetadata;
    conversationSessionEntry: ConversationSessionEntry;
    entryRecordedAtMs: number;
  }): void {
    const nextEntryCount = input.conversationSession.conversationSessionEntryCount + 1;
    const nextTitle = input.conversationSession.conversationSessionEntryCount === 0
      ? summarizeConversationSessionTitle([input.conversationSessionEntry])
      : input.conversationSession.title;
    this.gateway.updateConversationSessionSummary({
      sessionId: input.conversationSession.sessionId,
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

function formatUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeConversationSessionEntryRecordLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0 ? limit : 1;
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
