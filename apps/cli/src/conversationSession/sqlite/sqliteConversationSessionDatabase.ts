import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import {
  CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS,
  CONVERSATION_SESSION_SQLITE_SCHEMA_VERSION,
  createIdempotentConversationSessionSqliteSchemaObjectSql,
  type ConversationSessionSqliteSchemaObject,
} from "./conversationSessionSqliteSchema.ts";

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

const conversationSessionSqliteMigrations: readonly ConversationSessionSqliteMigration[] = [
  {
    version: CONVERSATION_SESSION_SQLITE_SCHEMA_VERSION,
    migrateConversationSessionDatabase: createInitialConversationSessionSchema,
  },
];

const latestConversationSessionSqliteSchemaVersion = conversationSessionSqliteMigrations.at(-1)?.version ?? 0;

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
    CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS.map((schemaObject) => schemaObject.name),
  );

  for (const expectedSchemaObject of CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS) {
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
  for (const schemaObject of listConversationSessionSchemaObjectsInCreationOrder()) {
    database.run(createIdempotentConversationSessionSqliteSchemaObjectSql(schemaObject));
  }
}

function listConversationSessionSchemaObjectsInCreationOrder(): readonly ConversationSessionSqliteSchemaObject[] {
  return [
    ...CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS.filter((schemaObject) => schemaObject.type === "table"),
    ...CONVERSATION_SESSION_SQLITE_SCHEMA_OBJECTS.filter((schemaObject) => schemaObject.type === "index"),
  ];
}
