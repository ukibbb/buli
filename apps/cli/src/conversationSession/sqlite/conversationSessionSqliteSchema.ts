export type ConversationSessionSqliteSchemaObject = Readonly<{
  type: "table" | "index";
  name: string;
  sql: string;
}>;

export const CONVERSATION_SESSION_SQLITE_SCHEMA_VERSION = 1;

export const CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS = [
  {
    type: "table",
    name: "active_conversation_session",
    sql: `CREATE TABLE active_conversation_session (
    workspace_root_path TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE
  )`,
  },
  {
    type: "table",
    name: "conversation_session",
    sql: `CREATE TABLE conversation_session (
    session_id TEXT PRIMARY KEY,
    workspace_root_path TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    title TEXT NOT NULL,
    conversation_session_entry_count INTEGER NOT NULL DEFAULT 0,
    current_model_selection_json TEXT
  )`,
  },
  {
    type: "table",
    name: "conversation_session_entry",
    sql: `CREATE TABLE conversation_session_entry (
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE,
    entry_sequence INTEGER NOT NULL,
    session_entry_id TEXT NOT NULL UNIQUE,
    recorded_at_ms INTEGER NOT NULL,
    entry_kind TEXT NOT NULL,
    conversation_session_entry_json TEXT NOT NULL,
    PRIMARY KEY (session_id, entry_sequence)
  )`,
  },
  {
    type: "index",
    name: "conversation_session_entry_session_kind_idx",
    sql: `CREATE INDEX conversation_session_entry_session_kind_idx
     ON conversation_session_entry (session_id, entry_kind, entry_sequence)`,
  },
  {
    type: "table",
    name: "conversation_session_model_selection",
    sql: `CREATE TABLE conversation_session_model_selection (
    model_selection_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE,
    recorded_at_ms INTEGER NOT NULL,
    model_selection_json TEXT NOT NULL
  )`,
  },
  {
    type: "index",
    name: "conversation_session_model_selection_session_idx",
    sql: `CREATE INDEX conversation_session_model_selection_session_idx
     ON conversation_session_model_selection (session_id, recorded_at_ms, model_selection_id)`,
  },
  {
    type: "index",
    name: "conversation_session_workspace_updated_idx",
    sql: `CREATE INDEX conversation_session_workspace_updated_idx
     ON conversation_session (workspace_root_path, updated_at_ms DESC, created_at_ms DESC, session_id)`,
  },
] satisfies readonly ConversationSessionSqliteSchemaObject[];

export function serializeConversationSessionSqliteSchema(): string {
  return [
    "-- Buli conversation session SQLite schema v1",
    `PRAGMA user_version = ${CONVERSATION_SESSION_SQLITE_SCHEMA_VERSION};`,
    ...CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS.map((schemaObject) => `${schemaObject.sql};`),
  ].join("\n\n") + "\n";
}

export function createIdempotentConversationSessionSqliteSchemaObjectSql(
  schemaObject: ConversationSessionSqliteSchemaObject,
): string {
  if (schemaObject.type === "table") {
    return schemaObject.sql.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ");
  }

  return schemaObject.sql.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
}
