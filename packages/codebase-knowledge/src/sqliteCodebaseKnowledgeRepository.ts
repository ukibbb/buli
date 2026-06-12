import { Database } from "bun:sqlite";
import { Buffer } from "node:buffer";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  CodebaseIndexedFileMetadata,
  CodebaseKnowledgeRecord,
  CodebaseKnowledgeRepository,
  CodebaseKnowledgeRepositorySnapshot,
  CodebaseKnowledgeRepositoryStartupMetadata,
  CodebaseSymbolDefinitionLocatorQuery,
  CodebaseSymbolDefinitionLocatorResult,
} from "./codebaseKnowledgeTypes.ts";
import {
  CODEBASE_KNOWLEDGE_INDEX_SCHEMA_VERSION,
  CodebaseIndexedFileMetadataSchema,
  CodebaseKnowledgeRecordSchema,
} from "./codebaseKnowledgeRecordSchemas.ts";
import {
  JsonFileCodebaseKnowledgeRepository,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationStatus,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticReporter,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole,
  type JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot,
} from "./jsonFileCodebaseKnowledgeRepository.ts";
import { locateCodebaseSymbolDefinitions } from "./locateCodebaseSymbolDefinitions.ts";

const SQLITE_SCHEMA_VERSION_META_KEY = "schemaVersion";

type SqliteDiagnosticStepMeasurement = Readonly<{
  operationName: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName;
  stepName: JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName;
  storedFileRole: JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole;
  startedAtMs: number;
  memoryBefore: JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot;
}>;

/**
 * SQLite-backed codebase knowledge store. The in-memory model matches
 * JsonFileCodebaseKnowledgeRepository, but persistence writes only the rows a
 * mutation changed instead of rewriting one monolithic records JSON file, so a
 * changed-file refresh after an edit no longer re-serializes the whole index.
 */
export class SqliteCodebaseKnowledgeRepository implements CodebaseKnowledgeRepository {
  readonly #databaseFilePath: string;
  readonly #legacyJsonIndexFilePath: string | undefined;
  readonly #diagnosticReporter: JsonFileCodebaseKnowledgeRepositoryDiagnosticReporter | undefined;
  readonly #now: () => number;
  readonly #readMemoryUsage: () => JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot;
  readonly #recordById = new Map<string, CodebaseKnowledgeRecord>();
  readonly #indexedFileMetadataByPath = new Map<string, CodebaseIndexedFileMetadata>();
  #database: Database | undefined;
  #hasLoadedStartupMetadata = false;
  #hasLoadedRecords = false;

  constructor(input: {
    databaseFilePath: string;
    /** When set and the database is empty, records are migrated once from the legacy JSON index files and those files are removed. */
    legacyJsonIndexFilePath?: string | undefined;
    diagnosticReporter?: JsonFileCodebaseKnowledgeRepositoryDiagnosticReporter | undefined;
    now?: (() => number) | undefined;
    readMemoryUsage?: (() => JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot) | undefined;
  }) {
    this.#databaseFilePath = input.databaseFilePath;
    this.#legacyJsonIndexFilePath = input.legacyJsonIndexFilePath;
    this.#diagnosticReporter = input.diagnosticReporter;
    this.#now = input.now ?? (() => performance.now());
    this.#readMemoryUsage = input.readMemoryUsage ?? readCurrentMemoryUsageSnapshot;
  }

  async upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    await this.#loadRecordsIfNeeded();
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
    this.#persistRecordRowDelta({ deletedRecordIds: [], upsertedRecords: records });
  }

  async replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
    this.#hasLoadedRecords = true;
    this.#persistFullSnapshot();
  }

  async replaceFileRecords(input: {
    filePath: string;
    records: readonly CodebaseKnowledgeRecord[];
    indexedFileMetadata?: CodebaseIndexedFileMetadata | undefined;
  }): Promise<void> {
    await this.#loadRecordsIfNeeded();
    const deletedRecordIds: string[] = [];
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath: input.filePath })) {
        this.#recordById.delete(record.recordId);
        deletedRecordIds.push(record.recordId);
      }
    }
    this.#indexedFileMetadataByPath.delete(createFilePathKey(input.filePath));

    for (const record of input.records) {
      this.#recordById.set(record.recordId, record);
    }
    if (input.indexedFileMetadata) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(input.indexedFileMetadata.filePath), input.indexedFileMetadata);
    }
    this.#persistRecordRowDelta({
      deletedRecordIds,
      upsertedRecords: input.records,
      metadataDelta: {
        deletedFilePathKeys: [createFilePathKey(input.filePath)],
        upsertedIndexedFiles: input.indexedFileMetadata ? [input.indexedFileMetadata] : [],
      },
    });
  }

  async removeFileRecords(filePath: string): Promise<void> {
    await this.#loadRecordsIfNeeded();
    const deletedRecordIds: string[] = [];
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath })) {
        this.#recordById.delete(record.recordId);
        deletedRecordIds.push(record.recordId);
      }
    }
    const didRemoveMetadata = this.#indexedFileMetadataByPath.delete(createFilePathKey(filePath));
    if (deletedRecordIds.length === 0 && !didRemoveMetadata) {
      return;
    }
    this.#persistRecordRowDelta({
      deletedRecordIds,
      upsertedRecords: [],
      metadataDelta: {
        deletedFilePathKeys: didRemoveMetadata ? [createFilePathKey(filePath)] : [],
        upsertedIndexedFiles: [],
      },
    });
  }

  async readStartupMetadata(): Promise<CodebaseKnowledgeRepositoryStartupMetadata> {
    await this.#loadStartupMetadataIfNeeded();
    return {
      indexedFiles: this.#listIndexedFilesFromMemory(),
    };
  }

  async replaceStartupMetadata(startupMetadata: CodebaseKnowledgeRepositoryStartupMetadata): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    this.#indexedFileMetadataByPath.clear();
    for (const indexedFileMetadata of startupMetadata.indexedFiles) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }
    this.#persistAllMetadataRows();
  }

  async readSnapshot(): Promise<CodebaseKnowledgeRepositorySnapshot> {
    await this.#loadRecordsIfNeeded();
    return {
      records: this.#listRecordsFromMemory(),
      indexedFiles: this.#listIndexedFilesFromMemory(),
    };
  }

  async replaceSnapshot(snapshot: CodebaseKnowledgeRepositorySnapshot): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    for (const record of snapshot.records) {
      this.#recordById.set(record.recordId, record);
    }
    for (const indexedFileMetadata of snapshot.indexedFiles) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }
    this.#hasLoadedRecords = true;
    this.#persistFullSnapshot();
  }

  async locateSymbolDefinitions(query: CodebaseSymbolDefinitionLocatorQuery): Promise<CodebaseSymbolDefinitionLocatorResult> {
    return locateCodebaseSymbolDefinitions({ query, records: await this.listRecords() });
  }

  async listRecords(): Promise<readonly CodebaseKnowledgeRecord[]> {
    await this.#loadRecordsIfNeeded();
    return this.#listRecordsFromMemory();
  }

  async #loadStartupMetadataIfNeeded(): Promise<void> {
    if (this.#hasLoadedStartupMetadata) {
      return;
    }
    const database = await this.#ensureDatabaseReady();
    await this.#migrateLegacyJsonIndexIfNeeded(database);

    const selectMeasurement = this.#startDiagnosticStep({
      operationName: "read_startup_metadata",
      stepName: "read_file",
      storedFileRole: "metadata_index",
    });
    let metadataRows: Array<{ metadata_json: string }>;
    try {
      metadataRows = database
        .query("SELECT metadata_json FROM indexed_file_metadata")
        .all() as Array<{ metadata_json: string }>;
      this.#finishDiagnosticStep(selectMeasurement, {
        operationStatus: "completed",
        fileTextByteLength: sumRowTextBytes(metadataRows.map((metadataRow) => metadataRow.metadata_json)),
        indexedFileCount: metadataRows.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(selectMeasurement, { operationStatus: "failed" });
      throw error;
    }

    this.#indexedFileMetadataByPath.clear();
    const parseMeasurement = this.#startDiagnosticStep({
      operationName: "read_startup_metadata",
      stepName: "schema_parse",
      storedFileRole: "metadata_index",
    });
    const parsedIndexedFiles: CodebaseIndexedFileMetadata[] = [];
    let hasUnparsableRow = false;
    for (const metadataRow of metadataRows) {
      const parsedIndexedFile = parseJsonRowWithSchema(metadataRow.metadata_json, CodebaseIndexedFileMetadataSchema);
      if (!parsedIndexedFile) {
        hasUnparsableRow = true;
        break;
      }
      parsedIndexedFiles.push(parsedIndexedFile);
    }
    this.#finishDiagnosticStep(parseMeasurement, {
      operationStatus: hasUnparsableRow ? "failed" : "completed",
      indexedFileCount: parsedIndexedFiles.length,
    });
    if (hasUnparsableRow) {
      // Unrecognized or stale stored rows: start fresh and let the workspace re-index.
      this.#resetDatabaseTables(database);
      this.#hasLoadedStartupMetadata = true;
      this.#hasLoadedRecords = true;
      return;
    }

    for (const indexedFileMetadata of parsedIndexedFiles) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }
    this.#hasLoadedStartupMetadata = true;
  }

  async #loadRecordsIfNeeded(): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    if (this.#hasLoadedRecords) {
      return;
    }
    const database = await this.#ensureDatabaseReady();

    const selectMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "read_file",
      storedFileRole: "records",
    });
    let recordRows: Array<{ record_json: string }>;
    try {
      recordRows = database.query("SELECT record_json FROM knowledge_record").all() as Array<{ record_json: string }>;
      this.#finishDiagnosticStep(selectMeasurement, {
        operationStatus: "completed",
        fileTextByteLength: sumRowTextBytes(recordRows.map((recordRow) => recordRow.record_json)),
        recordCount: recordRows.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(selectMeasurement, { operationStatus: "failed" });
      throw error;
    }

    const parseMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "schema_parse",
      storedFileRole: "records",
    });
    const parsedRecords: CodebaseKnowledgeRecord[] = [];
    let hasUnparsableRow = false;
    for (const recordRow of recordRows) {
      const parsedRecord = parseJsonRowWithSchema(recordRow.record_json, CodebaseKnowledgeRecordSchema);
      if (!parsedRecord) {
        hasUnparsableRow = true;
        break;
      }
      parsedRecords.push(parsedRecord);
    }
    this.#finishDiagnosticStep(parseMeasurement, {
      operationStatus: hasUnparsableRow ? "failed" : "completed",
      recordCount: parsedRecords.length,
    });
    if (hasUnparsableRow) {
      // Unrecognized or stale stored rows: start fresh and let the workspace re-index.
      this.#resetDatabaseTables(database);
      this.#recordById.clear();
      this.#indexedFileMetadataByPath.clear();
      this.#hasLoadedRecords = true;
      return;
    }

    this.#recordById.clear();
    const mapMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "map_disk_records_to_memory",
      storedFileRole: "records",
    });
    for (const record of parsedRecords) {
      this.#recordById.set(record.recordId, record);
    }
    this.#finishDiagnosticStep(mapMeasurement, { operationStatus: "completed", recordCount: parsedRecords.length });
    this.#hasLoadedRecords = true;
  }

  async #ensureDatabaseReady(): Promise<Database> {
    if (this.#database) {
      return this.#database;
    }
    await mkdir(dirname(this.#databaseFilePath), { recursive: true, mode: 0o700 });
    const database = new Database(this.#databaseFilePath, { create: true });
    database.run("PRAGMA journal_mode = WAL;");
    database.run("PRAGMA busy_timeout = 5000;");
    database.run("CREATE TABLE IF NOT EXISTS codebase_knowledge_meta (meta_key TEXT PRIMARY KEY, meta_value TEXT NOT NULL)");
    database.run("CREATE TABLE IF NOT EXISTS indexed_file_metadata (file_path_key TEXT PRIMARY KEY, metadata_json TEXT NOT NULL)");
    database.run("CREATE TABLE IF NOT EXISTS knowledge_record (record_id TEXT PRIMARY KEY, record_json TEXT NOT NULL)");
    const storedSchemaVersionRow = database
      .query("SELECT meta_value FROM codebase_knowledge_meta WHERE meta_key = ?")
      .get(SQLITE_SCHEMA_VERSION_META_KEY) as { meta_value: string } | null;
    if (storedSchemaVersionRow === null) {
      database
        .query("INSERT OR REPLACE INTO codebase_knowledge_meta (meta_key, meta_value) VALUES (?, ?)")
        .run(SQLITE_SCHEMA_VERSION_META_KEY, String(CODEBASE_KNOWLEDGE_INDEX_SCHEMA_VERSION));
    } else if (storedSchemaVersionRow.meta_value !== String(CODEBASE_KNOWLEDGE_INDEX_SCHEMA_VERSION)) {
      // Unrecognized or stale stored schema: start fresh and let the workspace re-index.
      this.#resetDatabaseTables(database);
    }
    this.#database = database;
    return database;
  }

  #resetDatabaseTables(database: Database): void {
    const resetTables = database.transaction(() => {
      database.run("DELETE FROM indexed_file_metadata");
      database.run("DELETE FROM knowledge_record");
      database
        .query("INSERT OR REPLACE INTO codebase_knowledge_meta (meta_key, meta_value) VALUES (?, ?)")
        .run(SQLITE_SCHEMA_VERSION_META_KEY, String(CODEBASE_KNOWLEDGE_INDEX_SCHEMA_VERSION));
    });
    resetTables();
  }

  async #migrateLegacyJsonIndexIfNeeded(database: Database): Promise<void> {
    if (!this.#legacyJsonIndexFilePath || !existsSync(this.#legacyJsonIndexFilePath)) {
      return;
    }
    const storedRowCountRow = database
      .query("SELECT (SELECT COUNT(*) FROM indexed_file_metadata) + (SELECT COUNT(*) FROM knowledge_record) AS row_count")
      .get() as { row_count: number };
    if (storedRowCountRow.row_count > 0) {
      // The database already holds an index; the leftover legacy files are stale duplicates.
      await this.#removeLegacyJsonIndexFiles();
      return;
    }

    const migrateMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "migrate_legacy_json_index",
      storedFileRole: "records",
    });
    try {
      const legacySnapshot = await new JsonFileCodebaseKnowledgeRepository({
        indexFilePath: this.#legacyJsonIndexFilePath,
      }).readSnapshot();
      this.#writeFullSnapshotRows(database, legacySnapshot);
      await this.#removeLegacyJsonIndexFiles();
      this.#finishDiagnosticStep(migrateMeasurement, {
        operationStatus: "completed",
        recordCount: legacySnapshot.records.length,
        indexedFileCount: legacySnapshot.indexedFiles.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(migrateMeasurement, { operationStatus: "failed" });
      throw error;
    }
  }

  async #removeLegacyJsonIndexFiles(): Promise<void> {
    if (!this.#legacyJsonIndexFilePath) {
      return;
    }
    const legacyRecordsFilePath = `${dirname(this.#legacyJsonIndexFilePath)}/codebase-knowledge.records.json`;
    await rm(this.#legacyJsonIndexFilePath, { force: true });
    await rm(legacyRecordsFilePath, { force: true });
  }

  #persistRecordRowDelta(input: {
    deletedRecordIds: readonly string[];
    upsertedRecords: readonly CodebaseKnowledgeRecord[];
    metadataDelta?: Readonly<{
      deletedFilePathKeys: readonly string[];
      upsertedIndexedFiles: readonly CodebaseIndexedFileMetadata[];
    }> | undefined;
  }): void {
    const database = this.#requireReadyDatabase();
    const stringifyMeasurement = this.#startDiagnosticStep({
      operationName: "write_records",
      stepName: "json_stringify",
      storedFileRole: "records",
    });
    let upsertedRecordRows: Array<{ recordId: string; recordJson: string }>;
    let upsertedMetadataRows: Array<{ filePathKey: string; metadataJson: string }>;
    try {
      upsertedRecordRows = input.upsertedRecords.map((record) => ({
        recordId: record.recordId,
        recordJson: JSON.stringify(record),
      }));
      upsertedMetadataRows = (input.metadataDelta?.upsertedIndexedFiles ?? []).map((indexedFileMetadata) => ({
        filePathKey: createFilePathKey(indexedFileMetadata.filePath),
        metadataJson: JSON.stringify(indexedFileMetadata),
      }));
      this.#finishDiagnosticStep(stringifyMeasurement, {
        operationStatus: "completed",
        serializedJsonByteLength: sumRowTextBytes([
          ...upsertedRecordRows.map((recordRow) => recordRow.recordJson),
          ...upsertedMetadataRows.map((metadataRow) => metadataRow.metadataJson),
        ]),
        recordCount: upsertedRecordRows.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(stringifyMeasurement, { operationStatus: "failed" });
      throw error;
    }

    const transactionMeasurement = this.#startDiagnosticStep({
      operationName: "write_records",
      stepName: "write_temporary_file",
      storedFileRole: "records",
    });
    try {
      const applyRowDelta = database.transaction(() => {
        const deleteRecordStatement = database.query("DELETE FROM knowledge_record WHERE record_id = ?");
        for (const deletedRecordId of input.deletedRecordIds) {
          deleteRecordStatement.run(deletedRecordId);
        }
        const upsertRecordStatement = database.query(
          "INSERT OR REPLACE INTO knowledge_record (record_id, record_json) VALUES (?, ?)",
        );
        for (const recordRow of upsertedRecordRows) {
          upsertRecordStatement.run(recordRow.recordId, recordRow.recordJson);
        }
        if (input.metadataDelta) {
          const deleteMetadataStatement = database.query("DELETE FROM indexed_file_metadata WHERE file_path_key = ?");
          for (const deletedFilePathKey of input.metadataDelta.deletedFilePathKeys) {
            deleteMetadataStatement.run(deletedFilePathKey);
          }
          const upsertMetadataStatement = database.query(
            "INSERT OR REPLACE INTO indexed_file_metadata (file_path_key, metadata_json) VALUES (?, ?)",
          );
          for (const metadataRow of upsertedMetadataRows) {
            upsertMetadataStatement.run(metadataRow.filePathKey, metadataRow.metadataJson);
          }
        }
      });
      applyRowDelta();
      this.#finishDiagnosticStep(transactionMeasurement, {
        operationStatus: "completed",
        recordCount: upsertedRecordRows.length + input.deletedRecordIds.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(transactionMeasurement, { operationStatus: "failed" });
      throw error;
    }
  }

  #persistFullSnapshot(): void {
    const database = this.#requireReadyDatabase();
    this.#writeFullSnapshotRows(database, {
      records: this.#listRecordsFromMemory(),
      indexedFiles: this.#listIndexedFilesFromMemory(),
    });
  }

  #persistAllMetadataRows(): void {
    const database = this.#requireReadyDatabase();
    const writeMeasurement = this.#startDiagnosticStep({
      operationName: "write_metadata_index",
      stepName: "write_temporary_file",
      storedFileRole: "metadata_index",
    });
    try {
      const indexedFiles = this.#listIndexedFilesFromMemory();
      const replaceMetadataRows = database.transaction(() => {
        database.run("DELETE FROM indexed_file_metadata");
        const upsertMetadataStatement = database.query(
          "INSERT OR REPLACE INTO indexed_file_metadata (file_path_key, metadata_json) VALUES (?, ?)",
        );
        for (const indexedFileMetadata of indexedFiles) {
          upsertMetadataStatement.run(createFilePathKey(indexedFileMetadata.filePath), JSON.stringify(indexedFileMetadata));
        }
      });
      replaceMetadataRows();
      this.#finishDiagnosticStep(writeMeasurement, { operationStatus: "completed", indexedFileCount: indexedFiles.length });
      this.#hasLoadedStartupMetadata = true;
    } catch (error) {
      this.#finishDiagnosticStep(writeMeasurement, { operationStatus: "failed" });
      throw error;
    }
  }

  #writeFullSnapshotRows(database: Database, snapshot: CodebaseKnowledgeRepositorySnapshot): void {
    const writeMeasurement = this.#startDiagnosticStep({
      operationName: "write_records",
      stepName: "write_temporary_file",
      storedFileRole: "records",
    });
    try {
      const replaceAllRows = database.transaction(() => {
        database.run("DELETE FROM indexed_file_metadata");
        database.run("DELETE FROM knowledge_record");
        const upsertRecordStatement = database.query(
          "INSERT OR REPLACE INTO knowledge_record (record_id, record_json) VALUES (?, ?)",
        );
        for (const record of snapshot.records) {
          upsertRecordStatement.run(record.recordId, JSON.stringify(record));
        }
        const upsertMetadataStatement = database.query(
          "INSERT OR REPLACE INTO indexed_file_metadata (file_path_key, metadata_json) VALUES (?, ?)",
        );
        for (const indexedFileMetadata of snapshot.indexedFiles) {
          upsertMetadataStatement.run(createFilePathKey(indexedFileMetadata.filePath), JSON.stringify(indexedFileMetadata));
        }
      });
      replaceAllRows();
      this.#finishDiagnosticStep(writeMeasurement, {
        operationStatus: "completed",
        recordCount: snapshot.records.length,
        indexedFileCount: snapshot.indexedFiles.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(writeMeasurement, { operationStatus: "failed" });
      throw error;
    }
  }

  #requireReadyDatabase(): Database {
    if (!this.#database) {
      throw new Error("Cannot write codebase knowledge rows before the repository database is opened by a load.");
    }
    return this.#database;
  }

  #startDiagnosticStep(input: {
    operationName: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName;
    stepName: JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName;
    storedFileRole: JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole;
  }): SqliteDiagnosticStepMeasurement {
    return {
      operationName: input.operationName,
      stepName: input.stepName,
      storedFileRole: input.storedFileRole,
      startedAtMs: this.#now(),
      memoryBefore: this.#readMemoryUsage(),
    };
  }

  #finishDiagnosticStep(
    measurement: SqliteDiagnosticStepMeasurement,
    completion: Readonly<{
      operationStatus: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationStatus;
      fileTextByteLength?: number | undefined;
      serializedJsonByteLength?: number | undefined;
      recordCount?: number | undefined;
      indexedFileCount?: number | undefined;
    }>,
  ): void {
    const memoryAfter = this.#readMemoryUsage();
    const diagnosticEvent: JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent = {
      operationName: measurement.operationName,
      stepName: measurement.stepName,
      storedFileRole: measurement.storedFileRole,
      operationStatus: completion.operationStatus,
      durationMs: this.#now() - measurement.startedAtMs,
      memoryBeforeRssBytes: measurement.memoryBefore.rssBytes,
      memoryAfterRssBytes: memoryAfter.rssBytes,
      memoryDeltaRssBytes: memoryAfter.rssBytes - measurement.memoryBefore.rssBytes,
      memoryBeforeHeapTotalBytes: measurement.memoryBefore.heapTotalBytes,
      memoryAfterHeapTotalBytes: memoryAfter.heapTotalBytes,
      memoryDeltaHeapTotalBytes: memoryAfter.heapTotalBytes - measurement.memoryBefore.heapTotalBytes,
      memoryBeforeHeapUsedBytes: measurement.memoryBefore.heapUsedBytes,
      memoryAfterHeapUsedBytes: memoryAfter.heapUsedBytes,
      memoryDeltaHeapUsedBytes: memoryAfter.heapUsedBytes - measurement.memoryBefore.heapUsedBytes,
      memoryBeforeExternalBytes: measurement.memoryBefore.externalBytes,
      memoryAfterExternalBytes: memoryAfter.externalBytes,
      memoryDeltaExternalBytes: memoryAfter.externalBytes - measurement.memoryBefore.externalBytes,
      memoryBeforeArrayBuffersBytes: measurement.memoryBefore.arrayBuffersBytes,
      memoryAfterArrayBuffersBytes: memoryAfter.arrayBuffersBytes,
      memoryDeltaArrayBuffersBytes: memoryAfter.arrayBuffersBytes - measurement.memoryBefore.arrayBuffersBytes,
      ...(completion.fileTextByteLength !== undefined ? { fileTextByteLength: completion.fileTextByteLength } : {}),
      ...(completion.serializedJsonByteLength !== undefined ? { serializedJsonByteLength: completion.serializedJsonByteLength } : {}),
      ...(completion.recordCount !== undefined ? { recordCount: completion.recordCount } : {}),
      ...(completion.indexedFileCount !== undefined ? { indexedFileCount: completion.indexedFileCount } : {}),
    };
    try {
      this.#diagnosticReporter?.(diagnosticEvent);
    } catch {
      // Diagnostics must never change repository behavior.
    }
  }

  #listRecordsFromMemory(): readonly CodebaseKnowledgeRecord[] {
    return [...this.#recordById.values()].sort((leftRecord, rightRecord) => leftRecord.recordId.localeCompare(rightRecord.recordId));
  }

  #listIndexedFilesFromMemory(): readonly CodebaseIndexedFileMetadata[] {
    return [...this.#indexedFileMetadataByPath.values()].sort((leftMetadata, rightMetadata) =>
      leftMetadata.filePath.localeCompare(rightMetadata.filePath)
    );
  }
}

function parseJsonRowWithSchema<ParsedRow>(
  rowJsonText: string,
  rowSchema: { safeParse: (value: unknown) => { success: boolean; data?: ParsedRow } },
): ParsedRow | undefined {
  try {
    const parseResult = rowSchema.safeParse(JSON.parse(rowJsonText));
    return parseResult.success ? parseResult.data : undefined;
  } catch {
    return undefined;
  }
}

function doesRecordReferenceFilePath(input: { record: CodebaseKnowledgeRecord; filePath: string }): boolean {
  const normalizedFilePath = normalizeFilePathForComparison(input.filePath);
  const recordFilePaths = [input.record.filePath, ...input.record.evidenceRanges.map((evidenceRange) => evidenceRange.filePath)];
  return recordFilePaths.some((recordFilePath) => normalizeFilePathForComparison(recordFilePath) === normalizedFilePath);
}

function normalizeFilePathForComparison(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function createFilePathKey(filePath: string): string {
  return normalizeFilePathForComparison(filePath);
}

function sumRowTextBytes(rowTexts: readonly string[]): number {
  return rowTexts.reduce((totalByteCount, rowText) => totalByteCount + Buffer.byteLength(rowText, "utf8"), 0);
}

function readCurrentMemoryUsageSnapshot(): JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot {
  const memoryUsage = process.memoryUsage();
  return {
    rssBytes: memoryUsage.rss,
    heapTotalBytes: memoryUsage.heapTotal,
    heapUsedBytes: memoryUsage.heapUsed,
    externalBytes: memoryUsage.external,
    arrayBuffersBytes: memoryUsage.arrayBuffers,
  };
}
