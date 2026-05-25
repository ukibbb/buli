import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { serializeConversationSessionSqliteSchema } from "../src/conversationSession/sqlite/conversationSessionSqliteSchema.ts";
import { openConversationSessionSqliteDatabase } from "../src/conversationSession/sqlite/sqliteConversationSessionDatabase.ts";
import { conversationSessionSqliteSchemaArtifactUrl } from "../scripts/writeConversationSessionSqliteSchema.ts";

type ConversationSessionSqliteUserVersionRow = {
  user_version: number;
};

type ConversationSessionSqliteSchemaRow = {
  type: string;
  name: string;
};

test("openConversationSessionSqliteDatabase migrates a new database to the current schema", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-migration-"));
  const database = openConversationSessionSqliteDatabase(join(directoryPath, "session-store.sqlite"));

  try {
    expect(readConversationSessionSqliteSchemaVersion(database)).toBe(1);
    expect(readConversationSessionSqliteSchemaObjects(database)).toEqual([
      { type: "table", name: "active_conversation_session" },
      { type: "table", name: "conversation_session" },
      { type: "table", name: "conversation_session_entry" },
      { type: "index", name: "conversation_session_entry_session_kind_idx" },
      { type: "table", name: "conversation_session_model_selection" },
      { type: "index", name: "conversation_session_model_selection_session_idx" },
      { type: "index", name: "conversation_session_workspace_updated_idx" },
    ]);
  } finally {
    database.close();
  }
});

test("committed conversation session SQLite schema artifact matches runtime schema", async () => {
  const committedSqliteSchemaArtifactText = await readFile(conversationSessionSqliteSchemaArtifactUrl, "utf8");

  expect(committedSqliteSchemaArtifactText).toBe(serializeConversationSessionSqliteSchema());
});

test("openConversationSessionSqliteDatabase rejects newer schema versions", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-future-migration-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const futureDatabase = new Database(databasePath, { create: true });
  futureDatabase.run("PRAGMA user_version = 2");
  futureDatabase.close();

  expect(() => openConversationSessionSqliteDatabase(databasePath)).toThrow(
    "Conversation session database schema version 2 is newer than supported version 1",
  );
});

test("openConversationSessionSqliteDatabase rejects a current-version database with missing schema objects", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-partial-schema-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const partialDatabase = new Database(databasePath, { create: true });
  partialDatabase.run("PRAGMA user_version = 1");
  partialDatabase.close();

  expect(() => openConversationSessionSqliteDatabase(databasePath)).toThrow(
    "Conversation session database schema is missing table active_conversation_session.",
  );
});

test("openConversationSessionSqliteDatabase rejects a pre-existing table with the wrong schema", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "buli-session-store-wrong-table-schema-"));
  const databasePath = join(directoryPath, "session-store.sqlite");
  const wrongSchemaDatabase = new Database(databasePath, { create: true });
  wrongSchemaDatabase.run(`CREATE TABLE conversation_session (
    session_id TEXT PRIMARY KEY,
    workspace_root_path TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    title TEXT NOT NULL,
    conversation_session_entry_count INTEGER NOT NULL DEFAULT 0
  )`);
  wrongSchemaDatabase.close();

  expect(() => openConversationSessionSqliteDatabase(databasePath)).toThrow(
    "Conversation session database schema object conversation_session does not match expected table definition.",
  );
});

function readConversationSessionSqliteSchemaVersion(database: Database): number {
  return database
    .query<ConversationSessionSqliteUserVersionRow, []>("PRAGMA user_version")
    .get()?.user_version ?? 0;
}

function readConversationSessionSqliteSchemaObjects(database: Database): readonly ConversationSessionSqliteSchemaRow[] {
  return database
    .query<ConversationSessionSqliteSchemaRow, []>(
      `SELECT type, name
       FROM sqlite_schema
       WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
       ORDER BY name ASC`,
    )
    .all();
}
