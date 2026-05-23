import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

const privateConversationSessionDirectoryMode = 0o700;
const privateConversationSessionDatabaseFileMode = 0o600;

export function openConversationSessionSqliteDatabase(storagePath: string): Database {
  if (storagePath !== ":memory:") {
    ensurePrivateConversationSessionDirectory(dirname(storagePath));
  }

  const database = new Database(storagePath, { create: true });
  configureConversationSessionSqliteDatabase(database);
  createConversationSessionSchema(database);

  if (storagePath !== ":memory:") {
    chmodSync(storagePath, privateConversationSessionDatabaseFileMode);
  }

  return database;
}

export function runImmediateConversationSessionSqliteTransaction<T>(
  database: Database,
  writeConversationSession: () => T,
): T {
  database.run("BEGIN IMMEDIATE");
  try {
    const result = writeConversationSession();
    database.run("COMMIT");
    return result;
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

function ensurePrivateConversationSessionDirectory(directoryPath: string): void {
  mkdirSync(directoryPath, { recursive: true, mode: privateConversationSessionDirectoryMode });
  chmodSync(directoryPath, privateConversationSessionDirectoryMode);
}

function configureConversationSessionSqliteDatabase(database: Database): void {
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA synchronous = FULL");
  database.run("PRAGMA busy_timeout = 5000");
  database.run("PRAGMA foreign_keys = ON");
}

function createConversationSessionSchema(database: Database): void {
  database.run(`CREATE TABLE IF NOT EXISTS conversation_session (
    session_id TEXT PRIMARY KEY,
    workspace_root_path TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    title TEXT NOT NULL,
    conversation_session_entry_count INTEGER NOT NULL DEFAULT 0,
    current_model_selection_json TEXT
  )`);
  database.run(
    `CREATE INDEX IF NOT EXISTS conversation_session_workspace_updated_idx
     ON conversation_session (workspace_root_path, updated_at_ms DESC, created_at_ms DESC, session_id)`,
  );
  database.run(`CREATE TABLE IF NOT EXISTS conversation_session_entry (
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE,
    entry_sequence INTEGER NOT NULL,
    session_entry_id TEXT NOT NULL UNIQUE,
    recorded_at_ms INTEGER NOT NULL,
    entry_kind TEXT NOT NULL,
    conversation_session_entry_json TEXT NOT NULL,
    PRIMARY KEY (session_id, entry_sequence)
  )`);
  database.run(
    `CREATE INDEX IF NOT EXISTS conversation_session_entry_session_kind_idx
     ON conversation_session_entry (session_id, entry_kind, entry_sequence)`,
  );
  database.run(`CREATE TABLE IF NOT EXISTS conversation_session_model_selection (
    model_selection_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE,
    recorded_at_ms INTEGER NOT NULL,
    model_selection_json TEXT NOT NULL
  )`);
  database.run(
    `CREATE INDEX IF NOT EXISTS conversation_session_model_selection_session_idx
     ON conversation_session_model_selection (session_id, recorded_at_ms, model_selection_id)`,
  );
  database.run(`CREATE TABLE IF NOT EXISTS active_conversation_session (
    workspace_root_path TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE
  )`);
  database.run("PRAGMA user_version = 1");
}
