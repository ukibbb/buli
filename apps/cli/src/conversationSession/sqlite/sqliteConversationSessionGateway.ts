import { Database } from "bun:sqlite";
import {
  ConversationSessionEntrySchema,
  ConversationSessionModelSelectionSchema,
  type ConversationSessionEntry,
  type ConversationSessionModelSelection,
  type ConversationSessionSummary,
} from "@buli/contracts";

export type PersistedConversationSessionMetadata = {
  sessionId: string;
  createdAtMs: number;
  updatedAtMs: number;
  title: string;
  conversationSessionEntryCount: number;
  modelSelection: ConversationSessionModelSelection | undefined;
};

export type RecordedConversationSessionEntry = {
  conversationSessionEntry: ConversationSessionEntry;
  entrySequence: number;
  sessionEntryId: string;
  recordedAtMs: number;
};

type ConversationSessionRow = {
  session_id: string;
  workspace_root_path: string;
  created_at_ms: number;
  updated_at_ms: number;
  title: string;
  conversation_session_entry_count: number;
  current_model_selection_json: string | null;
};

type ConversationSessionEntryRow = {
  entry_sequence: number;
  conversation_session_entry_json: string;
};

type ActiveConversationSessionRow = {
  session_id: string;
};

export class ConversationSessionSqliteGateway {
  private readonly database: Database;
  private readonly workspaceRootPath: string;

  constructor(input: { database: Database; workspaceRootPath: string }) {
    this.database = input.database;
    this.workspaceRootPath = input.workspaceRootPath;
  }

  insertConversationSessionMetadata(input: {
    sessionId: string;
    createdAtMs: number;
    title: string;
    modelSelection: ConversationSessionModelSelection | undefined;
  }): PersistedConversationSessionMetadata {
    this.database.run(
      `INSERT INTO conversation_session (
        session_id,
        workspace_root_path,
        created_at_ms,
        updated_at_ms,
        title,
        conversation_session_entry_count,
        current_model_selection_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.sessionId,
        this.workspaceRootPath,
        input.createdAtMs,
        input.createdAtMs,
        input.title,
        0,
        serializeOptionalConversationSessionModelSelection(input.modelSelection),
      ],
    );

    return {
      sessionId: input.sessionId,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
      title: input.title,
      conversationSessionEntryCount: 0,
      modelSelection: input.modelSelection,
    };
  }

  insertConversationSessionEntry(input: {
    sessionId: string;
    recordedConversationSessionEntry: RecordedConversationSessionEntry;
  }): void {
    this.database.run(
      `INSERT INTO conversation_session_entry (
        session_id,
        entry_sequence,
        session_entry_id,
        recorded_at_ms,
        entry_kind,
        conversation_session_entry_json
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.sessionId,
        input.recordedConversationSessionEntry.entrySequence,
        input.recordedConversationSessionEntry.sessionEntryId,
        input.recordedConversationSessionEntry.recordedAtMs,
        input.recordedConversationSessionEntry.conversationSessionEntry.entryKind,
        JSON.stringify(input.recordedConversationSessionEntry.conversationSessionEntry),
      ],
    );
  }

  replaceConversationSessionEntries(input: {
    sessionId: string;
    recordedConversationSessionEntries: readonly RecordedConversationSessionEntry[];
  }): void {
    this.database.run("DELETE FROM conversation_session_entry WHERE session_id = ?", [input.sessionId]);
    for (const recordedConversationSessionEntry of input.recordedConversationSessionEntries) {
      this.insertConversationSessionEntry({
        sessionId: input.sessionId,
        recordedConversationSessionEntry,
      });
    }
  }

  insertConversationSessionModelSelection(input: {
    sessionId: string;
    recordedAtMs: number;
    modelSelection: ConversationSessionModelSelection;
  }): void {
    this.database.run(
      `INSERT INTO conversation_session_model_selection (session_id, recorded_at_ms, model_selection_json)
       VALUES (?, ?, ?)`,
      [input.sessionId, input.recordedAtMs, JSON.stringify(input.modelSelection)],
    );
  }

  updateConversationSessionCurrentModelSelection(input: {
    sessionId: string;
    modelSelection: ConversationSessionModelSelection;
  }): void {
    this.database.run(
      `UPDATE conversation_session
       SET current_model_selection_json = ?
       WHERE session_id = ? AND workspace_root_path = ?`,
      [JSON.stringify(input.modelSelection), input.sessionId, this.workspaceRootPath],
    );
  }

  updateConversationSessionSummary(input: {
    sessionId: string;
    title: string;
    updatedAtMs: number;
    conversationSessionEntryCount: number;
  }): void {
    this.database.run(
      `UPDATE conversation_session
       SET title = ?, updated_at_ms = ?, conversation_session_entry_count = ?
       WHERE session_id = ? AND workspace_root_path = ?`,
      [
        input.title,
        input.updatedAtMs,
        input.conversationSessionEntryCount,
        input.sessionId,
        this.workspaceRootPath,
      ],
    );
  }

  writeActiveConversationSessionId(sessionId: string): void {
    this.database.run(
      `INSERT INTO active_conversation_session (workspace_root_path, session_id)
       VALUES (?, ?)
       ON CONFLICT(workspace_root_path) DO UPDATE SET session_id = excluded.session_id`,
      [this.workspaceRootPath, sessionId],
    );
  }

  deleteConversationSession(sessionId: string): void {
    this.database.run("DELETE FROM conversation_session WHERE session_id = ? AND workspace_root_path = ?", [
      sessionId,
      this.workspaceRootPath,
    ]);
  }

  loadActiveConversationSessionMetadataIfPresent(): PersistedConversationSessionMetadata | undefined {
    const activeConversationSessionId = this.database
      .query<ActiveConversationSessionRow, [string]>(
        "SELECT session_id FROM active_conversation_session WHERE workspace_root_path = ?",
      )
      .get(this.workspaceRootPath)?.session_id;
    return activeConversationSessionId
      ? this.loadConversationSessionMetadataById(activeConversationSessionId)
      : undefined;
  }

  loadMostRecentlyUpdatedConversationSessionMetadata(): PersistedConversationSessionMetadata | undefined {
    const conversationSessionRow = this.database
      .query<ConversationSessionRow, [string]>(
        `SELECT
          session_id,
          workspace_root_path,
          created_at_ms,
          updated_at_ms,
          title,
          conversation_session_entry_count,
          current_model_selection_json
         FROM conversation_session
         WHERE workspace_root_path = ?
         ORDER BY updated_at_ms DESC, created_at_ms DESC, session_id ASC
         LIMIT 1`,
      )
      .get(this.workspaceRootPath);
    return conversationSessionRow ? mapConversationSessionRowToMetadata(conversationSessionRow) : undefined;
  }

  loadConversationSessionMetadataById(sessionId: string): PersistedConversationSessionMetadata | undefined {
    const conversationSessionRow = this.database
      .query<ConversationSessionRow, [string, string]>(
        `SELECT
          session_id,
          workspace_root_path,
          created_at_ms,
          updated_at_ms,
          title,
          conversation_session_entry_count,
          current_model_selection_json
         FROM conversation_session
         WHERE session_id = ? AND workspace_root_path = ?`,
      )
      .get(sessionId, this.workspaceRootPath);
    return conversationSessionRow ? mapConversationSessionRowToMetadata(conversationSessionRow) : undefined;
  }

  listConversationSessionSummaries(): readonly ConversationSessionSummary[] {
    return this.database
      .query<ConversationSessionRow, [string]>(
        `SELECT
          session_id,
          workspace_root_path,
          created_at_ms,
          updated_at_ms,
          title,
          conversation_session_entry_count,
          current_model_selection_json
         FROM conversation_session
         WHERE workspace_root_path = ?
         ORDER BY updated_at_ms DESC, created_at_ms DESC, session_id ASC`,
      )
      .all(this.workspaceRootPath)
      .map(mapConversationSessionRowToSummary);
  }

  loadConversationSessionEntries(sessionId: string): readonly ConversationSessionEntry[] {
    return this.database
      .query<ConversationSessionEntryRow, [string]>(
        `SELECT entry_sequence, conversation_session_entry_json
         FROM conversation_session_entry
         WHERE session_id = ?
         ORDER BY entry_sequence ASC`,
      )
      .all(sessionId)
      .map((row) => parseConversationSessionEntryJson(row));
  }
}

function mapConversationSessionRowToMetadata(
  conversationSessionRow: ConversationSessionRow,
): PersistedConversationSessionMetadata {
  return {
    sessionId: conversationSessionRow.session_id,
    createdAtMs: conversationSessionRow.created_at_ms,
    updatedAtMs: conversationSessionRow.updated_at_ms,
    title: conversationSessionRow.title,
    conversationSessionEntryCount: conversationSessionRow.conversation_session_entry_count,
    modelSelection: parseOptionalConversationSessionModelSelectionJson(
      conversationSessionRow.current_model_selection_json,
    ),
  };
}

function mapConversationSessionRowToSummary(conversationSessionRow: ConversationSessionRow): ConversationSessionSummary {
  const modelSelection = parseOptionalConversationSessionModelSelectionJson(conversationSessionRow.current_model_selection_json);
  return {
    sessionId: conversationSessionRow.session_id,
    title: conversationSessionRow.title,
    createdAtMs: conversationSessionRow.created_at_ms,
    updatedAtMs: conversationSessionRow.updated_at_ms,
    conversationSessionEntryCount: conversationSessionRow.conversation_session_entry_count,
    ...(modelSelection ? { modelSelection } : {}),
  };
}

function parseConversationSessionEntryJson(conversationSessionEntryRow: ConversationSessionEntryRow): ConversationSessionEntry {
  try {
    return ConversationSessionEntrySchema.parse(JSON.parse(conversationSessionEntryRow.conversation_session_entry_json) as unknown);
  } catch (error) {
    const failureExplanation = error instanceof Error ? error.message : String(error);
    return {
      entryKind: "assistant_message",
      assistantMessageStatus: "failed",
      assistantMessageText: "",
      failureExplanation: `Could not load persisted conversation session entry ${conversationSessionEntryRow.entry_sequence + 1}: ${failureExplanation}`,
    };
  }
}

function parseOptionalConversationSessionModelSelectionJson(
  modelSelectionJson: string | null,
): ConversationSessionModelSelection | undefined {
  if (!modelSelectionJson) {
    return undefined;
  }

  try {
    return ConversationSessionModelSelectionSchema.parse(JSON.parse(modelSelectionJson) as unknown);
  } catch {
    return undefined;
  }
}

function serializeOptionalConversationSessionModelSelection(
  modelSelection: ConversationSessionModelSelection | undefined,
): string | null {
  return modelSelection ? JSON.stringify(modelSelection) : null;
}
