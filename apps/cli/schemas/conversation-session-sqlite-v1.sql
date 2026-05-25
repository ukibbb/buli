-- Buli conversation session SQLite schema v1

PRAGMA user_version = 1;

CREATE TABLE active_conversation_session (
    workspace_root_path TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE
  );

CREATE TABLE conversation_session (
    session_id TEXT PRIMARY KEY,
    workspace_root_path TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    title TEXT NOT NULL,
    conversation_session_entry_count INTEGER NOT NULL DEFAULT 0,
    current_model_selection_json TEXT
  );

CREATE TABLE conversation_session_entry (
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE,
    entry_sequence INTEGER NOT NULL,
    session_entry_id TEXT NOT NULL UNIQUE,
    recorded_at_ms INTEGER NOT NULL,
    entry_kind TEXT NOT NULL,
    conversation_session_entry_json TEXT NOT NULL,
    PRIMARY KEY (session_id, entry_sequence)
  );

CREATE INDEX conversation_session_entry_session_kind_idx
     ON conversation_session_entry (session_id, entry_kind, entry_sequence);

CREATE TABLE conversation_session_model_selection (
    model_selection_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES conversation_session(session_id) ON DELETE CASCADE,
    recorded_at_ms INTEGER NOT NULL,
    model_selection_json TEXT NOT NULL
  );

CREATE INDEX conversation_session_model_selection_session_idx
     ON conversation_session_model_selection (session_id, recorded_at_ms, model_selection_id);

CREATE INDEX conversation_session_workspace_updated_idx
     ON conversation_session (workspace_root_path, updated_at_ms DESC, created_at_ms DESC, session_id);
