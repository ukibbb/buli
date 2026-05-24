import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

const privateConversationSessionDirectoryMode = 0o700;
const privateConversationSessionDatabaseFileMode = 0o600;

type ConversationSessionSqliteMigration = {
  version: number;
  migrateConversationSessionDatabase: (database: Database) => void;
};

type ConversationSessionSqliteUserVersionRow = {
  user_version: number;
};

type ConversationSessionSqliteSchemaObjectRow = {
  type: "table" | "index";
  name: string;
  sql: string | null;
};

type ExpectedConversationSessionSqliteSchemaObject = {
  type: "table" | "index";
  name: string;
  sql: string;
};

const conversationSessionSqliteMigrations: readonly ConversationSessionSqliteMigration[] = [
  {
    version: 1,
    migrateConversationSessionDatabase: createInitialConversationSessionSchema,
  },
];

const latestConversationSessionSqliteSchemaVersion = conversationSessionSqliteMigrations.at(-1)?.version ?? 0;

const expectedConversationSessionSqliteSchemaObjects = [
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
] satisfies readonly ExpectedConversationSessionSqliteSchemaObject[];

export function openConversationSessionSqliteDatabase(storagePath: string): Database {
  if (storagePath !== ":memory:") {
    ensurePrivateConversationSessionDirectory(dirname(storagePath));
  }

  const database = new Database(storagePath, { create: true });
  try {
    configureConversationSessionSqliteDatabase(database);
    migrateConversationSessionSqliteDatabase(database);
    validateConversationSessionSqliteSchema(database);

    if (storagePath !== ":memory:") {
      chmodSync(storagePath, privateConversationSessionDatabaseFileMode);
    }

    return database;
  } catch (error) {
    database.close();
    throw error;
  }
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

function migrateConversationSessionSqliteDatabase(database: Database): void {
  const currentSchemaVersion = readConversationSessionSqliteSchemaVersion(database);
  if (currentSchemaVersion > latestConversationSessionSqliteSchemaVersion) {
    throw new Error(
      `Conversation session database schema version ${currentSchemaVersion} is newer than supported version ${latestConversationSessionSqliteSchemaVersion}`,
    );
  }

  const pendingMigrations = conversationSessionSqliteMigrations.filter(
    (migration) => migration.version > currentSchemaVersion,
  );
  if (pendingMigrations.length === 0) {
    return;
  }

  runImmediateConversationSessionSqliteTransaction(database, () => {
    for (const migration of pendingMigrations) {
      migration.migrateConversationSessionDatabase(database);
      database.run(`PRAGMA user_version = ${migration.version}`);
    }
  });
}

function readConversationSessionSqliteSchemaVersion(database: Database): number {
  return database
    .query<ConversationSessionSqliteUserVersionRow, []>("PRAGMA user_version")
    .get()?.user_version ?? 0;
}

function validateConversationSessionSqliteSchema(database: Database): void {
  const currentSchemaVersion = readConversationSessionSqliteSchemaVersion(database);
  if (currentSchemaVersion !== latestConversationSessionSqliteSchemaVersion) {
    throw new Error(
      `Conversation session database schema version ${currentSchemaVersion} did not migrate to expected version ${latestConversationSessionSqliteSchemaVersion}`,
    );
  }

  const actualSchemaObjectsByName = new Map(
    database
      .query<ConversationSessionSqliteSchemaObjectRow, []>(
        `SELECT type, name, sql
         FROM sqlite_schema
         WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
         ORDER BY name ASC`,
      )
      .all()
      .map((schemaObject) => [schemaObject.name, schemaObject]),
  );
  const expectedSchemaObjectNames = new Set(
    expectedConversationSessionSqliteSchemaObjects.map((schemaObject) => schemaObject.name),
  );

  for (const expectedSchemaObject of expectedConversationSessionSqliteSchemaObjects) {
    const actualSchemaObject = actualSchemaObjectsByName.get(expectedSchemaObject.name);
    if (!actualSchemaObject) {
      throw new Error(
        `Conversation session database schema is missing ${expectedSchemaObject.type} ${expectedSchemaObject.name}.`,
      );
    }

    if (
      actualSchemaObject.type !== expectedSchemaObject.type ||
      normalizeConversationSessionSqliteSchemaSql(actualSchemaObject.sql ?? "") !==
        normalizeConversationSessionSqliteSchemaSql(expectedSchemaObject.sql)
    ) {
      throw new Error(
        `Conversation session database schema object ${expectedSchemaObject.name} does not match expected ${expectedSchemaObject.type} definition.`,
      );
    }
  }

  for (const actualSchemaObject of actualSchemaObjectsByName.values()) {
    if (!expectedSchemaObjectNames.has(actualSchemaObject.name)) {
      throw new Error(
        `Conversation session database schema contains unexpected ${actualSchemaObject.type} ${actualSchemaObject.name}.`,
      );
    }
  }
}

function normalizeConversationSessionSqliteSchemaSql(schemaSql: string): string {
  return schemaSql.replace(/\s+/g, " ").trim();
}

function createInitialConversationSessionSchema(database: Database): void {
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
}
