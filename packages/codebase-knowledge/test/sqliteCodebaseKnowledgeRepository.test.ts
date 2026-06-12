import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonFileCodebaseKnowledgeRepository,
  SqliteCodebaseKnowledgeRepository,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent,
} from "../src/index.ts";
import { createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

async function createTestIndexPaths(): Promise<{ databaseFilePath: string; legacyIndexFilePath: string; indexDirectoryPath: string }> {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-sqlite-codebase-knowledge-"));
  const indexDirectoryPath = join(workspaceRootPath, ".buli", "index");
  return {
    indexDirectoryPath,
    databaseFilePath: join(indexDirectoryPath, "codebase-knowledge.sqlite"),
    legacyIndexFilePath: join(indexDirectoryPath, "codebase-knowledge.json"),
  };
}

test("SqliteCodebaseKnowledgeRepository persists and reloads records", async () => {
  const { databaseFilePath } = await createTestIndexPaths();
  const repository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    title: "Runtime dispatch",
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
  });

  await repository.upsertRecords([runtimeRecord]);

  const reloadedRepository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  const locatorResult = await reloadedRepository.locateSymbolDefinitions({
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
  });
  expect(locatorResult.symbolLookups[0]?.lookupStatus).toBe("resolved");
  expect(locatorResult.symbolLookups[0]?.locations[0]).toMatchObject({
    filePath: runtimeRecord.filePath,
    symbolName: runtimeRecord.symbolName,
  });
});

test("SqliteCodebaseKnowledgeRepository replaces records for a re-indexed file with row deltas only", async () => {
  const { databaseFilePath } = await createTestIndexPaths();
  const repository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  const staleRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:stale",
    title: "Stale symbol",
    filePath: "src/feature.ts",
    symbolName: "staleSymbol",
  });
  const unrelatedRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:unrelated",
    title: "Unrelated symbol",
    filePath: "src/other.ts",
    symbolName: "unrelatedSymbol",
  });
  await repository.upsertRecords([staleRecord, unrelatedRecord]);

  const freshRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:fresh",
    title: "Fresh symbol",
    filePath: "src/feature.ts",
    symbolName: "freshSymbol",
  });
  await repository.replaceFileRecords({
    filePath: "src/feature.ts",
    records: [freshRecord],
    indexedFileMetadata: {
      filePath: "src/feature.ts",
      languageId: "typescript",
      sourceFileSizeBytes: 64,
      sourceFileModifiedAtMs: 100,
      contentHash: "hash-fresh",
      indexedAtMs: 200,
      recordIds: ["symbol:fresh"],
    },
  });

  const reloadedRepository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  const snapshot = await reloadedRepository.readSnapshot();
  expect(snapshot.records.map((record) => record.recordId).sort()).toEqual(["symbol:fresh", "symbol:unrelated"]);
  expect(snapshot.indexedFiles.map((indexedFile) => indexedFile.filePath)).toEqual(["src/feature.ts"]);
});

test("SqliteCodebaseKnowledgeRepository migrates a legacy JSON index once and removes the legacy files", async () => {
  const { databaseFilePath, legacyIndexFilePath, indexDirectoryPath } = await createTestIndexPaths();
  const legacyRepository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath: legacyIndexFilePath });
  const legacyRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:legacy",
    title: "Legacy symbol",
    filePath: "src/legacy.ts",
    symbolName: "legacySymbol",
  });
  await legacyRepository.replaceSnapshot({
    records: [legacyRecord],
    indexedFiles: [{
      filePath: "src/legacy.ts",
      languageId: "typescript",
      sourceFileSizeBytes: 10,
      sourceFileModifiedAtMs: 1,
      contentHash: "hash-legacy",
      indexedAtMs: 2,
      recordIds: ["symbol:legacy"],
    }],
  });
  expect(existsSync(legacyIndexFilePath)).toBe(true);
  expect(existsSync(join(indexDirectoryPath, "codebase-knowledge.records.json"))).toBe(true);

  const repository = new SqliteCodebaseKnowledgeRepository({
    databaseFilePath,
    legacyJsonIndexFilePath: legacyIndexFilePath,
  });
  const startupMetadata = await repository.readStartupMetadata();
  expect(startupMetadata.indexedFiles.map((indexedFile) => indexedFile.filePath)).toEqual(["src/legacy.ts"]);
  expect((await repository.listRecords()).map((record) => record.recordId)).toEqual(["symbol:legacy"]);
  expect(existsSync(legacyIndexFilePath)).toBe(false);
  expect(existsSync(join(indexDirectoryPath, "codebase-knowledge.records.json"))).toBe(false);
});

test("SqliteCodebaseKnowledgeRepository starts fresh when stored rows use an unrecognized schema", async () => {
  const { databaseFilePath } = await createTestIndexPaths();
  await mkdir(join(databaseFilePath, ".."), { recursive: true });
  const database = new Database(databaseFilePath, { create: true });
  database.run("CREATE TABLE IF NOT EXISTS codebase_knowledge_meta (meta_key TEXT PRIMARY KEY, meta_value TEXT NOT NULL)");
  database.run("CREATE TABLE IF NOT EXISTS indexed_file_metadata (file_path_key TEXT PRIMARY KEY, metadata_json TEXT NOT NULL)");
  database.run("CREATE TABLE IF NOT EXISTS knowledge_record (record_id TEXT PRIMARY KEY, record_json TEXT NOT NULL)");
  database.query("INSERT INTO codebase_knowledge_meta (meta_key, meta_value) VALUES (?, ?)").run("schemaVersion", "4");
  database.query("INSERT INTO knowledge_record (record_id, record_json) VALUES (?, ?)").run("symbol:bad", "{\"recordKind\":\"mystery\"}");
  database.close();

  const repository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  await expect(repository.listRecords()).resolves.toEqual([]);
});

test("SqliteCodebaseKnowledgeRepository starts fresh when the stored schema version is unrecognized", async () => {
  const { databaseFilePath } = await createTestIndexPaths();
  const repository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  await repository.upsertRecords([
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:before",
      title: "Before version bump",
      filePath: "src/before.ts",
      symbolName: "beforeSymbol",
    }),
  ]);

  const database = new Database(databaseFilePath);
  database.query("UPDATE codebase_knowledge_meta SET meta_value = ? WHERE meta_key = ?").run("999", "schemaVersion");
  database.close();

  const reopenedRepository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  await expect(reopenedRepository.listRecords()).resolves.toEqual([]);
});

test("SqliteCodebaseKnowledgeRepository persists and reloads snapshot metadata", async () => {
  const { databaseFilePath } = await createTestIndexPaths();
  const repository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  const indexedFileMetadata = {
    filePath: "src/runtime.ts",
    languageId: "typescript",
    sourceFileSizeBytes: 42,
    sourceFileModifiedAtMs: 123.5,
    contentHash: "hash-runtime",
    indexedAtMs: 200,
    recordIds: ["symbol:runtime"],
  };
  await repository.replaceSnapshot({
    records: [createTestSymbolKnowledgeRecord({
      recordId: "symbol:runtime",
      title: "Runtime",
      filePath: "src/runtime.ts",
      symbolName: "runtimeSymbol",
    })],
    indexedFiles: [indexedFileMetadata],
  });

  const reloadedRepository = new SqliteCodebaseKnowledgeRepository({ databaseFilePath });
  await expect(reloadedRepository.readStartupMetadata()).resolves.toEqual({ indexedFiles: [indexedFileMetadata] });
});

test("SqliteCodebaseKnowledgeRepository emits delta-sized write diagnostics on file replacement", async () => {
  const { databaseFilePath } = await createTestIndexPaths();
  const diagnosticEvents: JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent[] = [];
  const repository = new SqliteCodebaseKnowledgeRepository({
    databaseFilePath,
    diagnosticReporter: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
  });
  const manyRecords = Array.from({ length: 50 }, (_, recordIndex) =>
    createTestSymbolKnowledgeRecord({
      recordId: `symbol:bulk-${recordIndex}`,
      title: `Bulk symbol ${recordIndex}`,
      filePath: `src/bulk-${recordIndex}.ts`,
      symbolName: `bulkSymbol${recordIndex}`,
    }));
  await repository.upsertRecords(manyRecords);

  diagnosticEvents.length = 0;
  await repository.replaceFileRecords({
    filePath: "src/bulk-0.ts",
    records: [createTestSymbolKnowledgeRecord({
      recordId: "symbol:bulk-0-replaced",
      title: "Replaced bulk symbol",
      filePath: "src/bulk-0.ts",
      symbolName: "bulkSymbol0Replaced",
    })],
  });

  const stringifyEvent = diagnosticEvents.find((diagnosticEvent) =>
    diagnosticEvent.operationName === "write_records" && diagnosticEvent.stepName === "json_stringify"
  );
  expect(stringifyEvent).toBeDefined();
  // Delta persistence: only the replaced record serializes, not all 50 stored records.
  expect(stringifyEvent?.recordCount).toBe(1);
});
