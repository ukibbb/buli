import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type {
  CodebaseIndexedFileMetadata,
  CodebaseKnowledgeRecord,
  CodebaseKnowledgeRepository,
  CodebaseKnowledgeRepositorySnapshot,
  CodebaseKnowledgeRepositoryStartupMetadata,
  CodebaseSymbolDefinitionLocatorQuery,
  CodebaseSymbolDefinitionLocatorResult,
} from "./codebaseKnowledgeTypes.ts";
import { locateCodebaseSymbolDefinitions } from "./locateCodebaseSymbolDefinitions.ts";

const CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION = 4;
const CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME = "codebase-knowledge.records.json";

const CodebaseEvidenceSourceRangeSchema = z
  .object({
    filePath: z.string().min(1),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
    contentHash: z.string().min(1),
  })
  .strict();

const CodebaseImportDeclarationSchema = z
  .object({
    moduleSpecifier: z.string().min(1),
    importedSymbolNames: z.array(z.string().min(1)),
    isTypeOnly: z.boolean(),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
  })
  .strict();

const CodebaseExportDeclarationSchema = z
  .object({
    exportedSymbolNames: z.array(z.string().min(1)),
    moduleSpecifier: z.string().min(1).optional(),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
  })
  .strict();

const CodebaseSymbolDeclarationPreviewSchema = z
  .object({
    declarationPreviewText: z.string().min(1),
    documentationCommentText: z.string().min(1).optional(),
  })
  .strict();

const CodebaseKnowledgeRecordBaseSchema = z.object({
  recordId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string()),
  evidenceRanges: z.array(CodebaseEvidenceSourceRangeSchema),
  updatedAtMs: z.number().int().nonnegative(),
});

const CodebaseFileKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("file"),
  filePath: z.string().min(1),
  languageId: z.string().min(1),
  importedModuleSpecifiers: z.array(z.string()),
  importDeclarations: z.array(CodebaseImportDeclarationSchema).optional(),
  exportedSymbolNames: z.array(z.string()),
  exportDeclarations: z.array(CodebaseExportDeclarationSchema).optional(),
  symbolNames: z.array(z.string()),
}).strict();

const CodebaseSymbolKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("symbol"),
  filePath: z.string().min(1),
  symbolName: z.string().min(1),
  symbolKind: z.enum(["function", "class", "interface", "type", "enum", "variable"]),
  startLineNumber: z.number().int().positive(),
  endLineNumber: z.number().int().positive(),
  isExported: z.boolean(),
  declarationPreview: CodebaseSymbolDeclarationPreviewSchema.optional(),
}).strict();

const CodebaseKnowledgeRecordSchema = z.discriminatedUnion("recordKind", [
  CodebaseFileKnowledgeRecordSchema,
  CodebaseSymbolKnowledgeRecordSchema,
]);

const CodebaseIndexedFileMetadataSchema = z
  .object({
    filePath: z.string().min(1),
    languageId: z.string().min(1),
    sourceFileSizeBytes: z.number().int().nonnegative(),
    sourceFileModifiedAtMs: z.number().nonnegative(),
    contentHash: z.string().min(1),
    indexedAtMs: z.number().int().nonnegative(),
    recordIds: z.array(z.string().min(1)),
    structureMapVersion: z.number().int().positive().optional(),
  })
  .strict();

const CodebaseKnowledgeJsonIndexFileSchema = z
  .object({
    schemaVersion: z.literal(CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION),
    recordsFileName: z.literal(CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME),
    indexedFiles: z.array(CodebaseIndexedFileMetadataSchema),
  })
  .strict();

const CodebaseKnowledgeRecordsJsonFileV4Schema = z
  .object({
    schemaVersion: z.literal(CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION),
    records: z.array(CodebaseKnowledgeRecordSchema),
  })
  .strict();

export type CodebaseKnowledgeJsonIndexFile = {
  schemaVersion: typeof CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION;
  recordsFileName: typeof CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME;
  indexedFiles: readonly CodebaseIndexedFileMetadata[];
};

export type CodebaseKnowledgeRecordsJsonFile = {
  schemaVersion: typeof CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION;
  records: readonly CodebaseKnowledgeRecord[];
};

export type JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName =
  | "read_startup_metadata"
  | "load_records"
  | "write_metadata_index"
  | "write_records";

export type JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName =
  | "read_file"
  | "json_parse"
  | "schema_parse"
  | "map_disk_metadata_to_memory"
  | "map_disk_records_to_memory"
  | "map_memory_metadata_to_disk"
  | "map_memory_records_to_disk"
  | "json_stringify"
  | "write_temporary_file"
  | "rename_temporary_file";

export type JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole = "metadata_index" | "records";

export type JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationStatus = "completed" | "failed";

export type JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot = Readonly<{
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}>;

export type JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent = Readonly<{
  operationName: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName;
  stepName: JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName;
  storedFileRole: JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole;
  operationStatus: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationStatus;
  durationMs: number;
  memoryBeforeRssBytes: number;
  memoryAfterRssBytes: number;
  memoryDeltaRssBytes: number;
  memoryBeforeHeapTotalBytes: number;
  memoryAfterHeapTotalBytes: number;
  memoryDeltaHeapTotalBytes: number;
  memoryBeforeHeapUsedBytes: number;
  memoryAfterHeapUsedBytes: number;
  memoryDeltaHeapUsedBytes: number;
  memoryBeforeExternalBytes: number;
  memoryAfterExternalBytes: number;
  memoryDeltaExternalBytes: number;
  memoryBeforeArrayBuffersBytes: number;
  memoryAfterArrayBuffersBytes: number;
  memoryDeltaArrayBuffersBytes: number;
  fileTextByteLength?: number | undefined;
  serializedJsonByteLength?: number | undefined;
  recordCount?: number | undefined;
  indexedFileCount?: number | undefined;
}>;

export type JsonFileCodebaseKnowledgeRepositoryDiagnosticReporter = (
  diagnosticEvent: JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent,
) => void;

type RepositoryDiagnosticStepMeasurement = Readonly<{
  operationName: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName;
  stepName: JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName;
  storedFileRole: JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole;
  startedAtMs: number;
  memoryBefore: JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot;
}>;

type RepositoryDiagnosticStepCompletion = Readonly<{
  operationStatus: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationStatus;
  fileTextByteLength?: number | undefined;
  serializedJsonByteLength?: number | undefined;
  recordCount?: number | undefined;
  indexedFileCount?: number | undefined;
}>;

export class JsonFileCodebaseKnowledgeRepository implements CodebaseKnowledgeRepository {
  readonly #indexFilePath: string;
  readonly #recordsFilePath: string;
  readonly #diagnosticReporter: JsonFileCodebaseKnowledgeRepositoryDiagnosticReporter | undefined;
  readonly #now: () => number;
  readonly #readMemoryUsage: () => JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot;
  readonly #recordById = new Map<string, CodebaseKnowledgeRecord>();
  readonly #indexedFileMetadataByPath = new Map<string, CodebaseIndexedFileMetadata>();
  #hasLoadedStartupMetadata = false;
  #hasLoadedRecords = false;

  constructor(input: {
    indexFilePath: string;
    diagnosticReporter?: JsonFileCodebaseKnowledgeRepositoryDiagnosticReporter | undefined;
    now?: (() => number) | undefined;
    readMemoryUsage?: (() => JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot) | undefined;
  }) {
    this.#indexFilePath = input.indexFilePath;
    this.#recordsFilePath = join(dirname(input.indexFilePath), CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME);
    this.#diagnosticReporter = input.diagnosticReporter;
    this.#now = input.now ?? (() => performance.now());
    this.#readMemoryUsage = input.readMemoryUsage ?? readCurrentMemoryUsageSnapshot;
  }

  async upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    await this.#loadRecordsIfNeeded();
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
    await this.#writeSplitIndexFiles();
  }

  async replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
    this.#hasLoadedRecords = true;
    await this.#writeSplitIndexFiles();
  }

  async replaceFileRecords(input: {
    filePath: string;
    records: readonly CodebaseKnowledgeRecord[];
    indexedFileMetadata?: CodebaseIndexedFileMetadata | undefined;
  }): Promise<void> {
    await this.#loadRecordsIfNeeded();
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath: input.filePath })) {
        this.#recordById.delete(record.recordId);
      }
    }
    this.#indexedFileMetadataByPath.delete(createFilePathKey(input.filePath));

    for (const record of input.records) {
      this.#recordById.set(record.recordId, record);
    }
    if (input.indexedFileMetadata) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(input.indexedFileMetadata.filePath), input.indexedFileMetadata);
    }
    await this.#writeSplitIndexFiles();
  }

  async removeFileRecords(filePath: string): Promise<void> {
    await this.#loadRecordsIfNeeded();
    let didChangeRecord = false;
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath })) {
        this.#recordById.delete(record.recordId);
        didChangeRecord = true;
      }
    }
    if (this.#indexedFileMetadataByPath.delete(createFilePathKey(filePath))) {
      didChangeRecord = true;
    }

    if (didChangeRecord) {
      await this.#writeSplitIndexFiles();
    }
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
    if (this.#hasLoadedRecords) {
      await this.#writeSplitIndexFiles();
      return;
    }
    await this.#writeMetadataIndexFile();
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
    await this.#writeSplitIndexFiles();
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

    const readIndexFileMeasurement = this.#startDiagnosticStep({
      operationName: "read_startup_metadata",
      stepName: "read_file",
      storedFileRole: "metadata_index",
    });
    let indexFileText: string;
    try {
      indexFileText = await readFile(this.#indexFilePath, "utf8");
      this.#finishDiagnosticStep(readIndexFileMeasurement, {
        operationStatus: "completed",
        fileTextByteLength: byteLength(indexFileText),
      });
    } catch (error) {
      this.#finishDiagnosticStep(readIndexFileMeasurement, { operationStatus: "failed" });
      if (isFileNotFoundError(error)) {
        this.#hasLoadedStartupMetadata = true;
        this.#hasLoadedRecords = true;
        return;
      }
      throw error;
    }

    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    const parsedIndexJsonMeasurement = this.#startDiagnosticStep({
      operationName: "read_startup_metadata",
      stepName: "json_parse",
      storedFileRole: "metadata_index",
    });
    let parsedIndexJson: unknown;
    try {
      parsedIndexJson = JSON.parse(indexFileText);
      this.#finishDiagnosticStep(parsedIndexJsonMeasurement, { operationStatus: "completed", fileTextByteLength: byteLength(indexFileText) });
    } catch {
      this.#finishDiagnosticStep(parsedIndexJsonMeasurement, { operationStatus: "failed", fileTextByteLength: byteLength(indexFileText) });
      // Unrecognized or stale on-disk schema: start fresh and let the workspace re-index.
      this.#hasLoadedStartupMetadata = true;
      this.#hasLoadedRecords = true;
      return;
    }

    const schemaParseMeasurement = this.#startDiagnosticStep({
      operationName: "read_startup_metadata",
      stepName: "schema_parse",
      storedFileRole: "metadata_index",
    });
    const parsedIndexFileResult = CodebaseKnowledgeJsonIndexFileSchema.safeParse(parsedIndexJson);
    this.#finishDiagnosticStep(schemaParseMeasurement, {
      operationStatus: parsedIndexFileResult.success ? "completed" : "failed",
      indexedFileCount: parsedIndexFileResult.success ? parsedIndexFileResult.data.indexedFiles.length : undefined,
    });
    if (!parsedIndexFileResult.success) {
      // Unrecognized or stale on-disk schema: start fresh and let the workspace re-index.
      this.#hasLoadedStartupMetadata = true;
      this.#hasLoadedRecords = true;
      return;
    }

    const parsedIndexFile = parsedIndexFileResult.data;
    if (!parsedIndexFile) {
      // Unrecognized or stale on-disk schema: start fresh and let the workspace re-index.
      this.#hasLoadedStartupMetadata = true;
      this.#hasLoadedRecords = true;
      return;
    }

    const mapMetadataMeasurement = this.#startDiagnosticStep({
      operationName: "read_startup_metadata",
      stepName: "map_disk_metadata_to_memory",
      storedFileRole: "metadata_index",
    });
    try {
      for (const indexedFileMetadata of parsedIndexFile.indexedFiles) {
        this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
      }
      this.#finishDiagnosticStep(mapMetadataMeasurement, {
        operationStatus: "completed",
        indexedFileCount: parsedIndexFile.indexedFiles.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(mapMetadataMeasurement, {
        operationStatus: "failed",
        indexedFileCount: parsedIndexFile.indexedFiles.length,
      });
      throw error;
    }
    this.#hasLoadedStartupMetadata = true;
  }

  async #loadRecordsIfNeeded(): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    if (this.#hasLoadedRecords) {
      return;
    }

    const readRecordsMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "read_file",
      storedFileRole: "records",
    });
    let recordsFileText: string;
    try {
      recordsFileText = await readFile(this.#recordsFilePath, "utf8");
      this.#finishDiagnosticStep(readRecordsMeasurement, { operationStatus: "completed", fileTextByteLength: byteLength(recordsFileText) });
    } catch (error) {
      this.#finishDiagnosticStep(readRecordsMeasurement, { operationStatus: "failed" });
      throw error;
    }

    const parseRecordsJsonMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "json_parse",
      storedFileRole: "records",
    });
    let parsedRecordsJson: unknown;
    try {
      parsedRecordsJson = JSON.parse(recordsFileText);
      this.#finishDiagnosticStep(parseRecordsJsonMeasurement, { operationStatus: "completed", fileTextByteLength: byteLength(recordsFileText) });
    } catch (error) {
      this.#finishDiagnosticStep(parseRecordsJsonMeasurement, { operationStatus: "failed", fileTextByteLength: byteLength(recordsFileText) });
      throw error;
    }

    const parseRecordsSchemaMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "schema_parse",
      storedFileRole: "records",
    });
    let parsedRecordsFile: CodebaseKnowledgeRecordsJsonFile;
    try {
      parsedRecordsFile = CodebaseKnowledgeRecordsJsonFileV4Schema.parse(parsedRecordsJson);
      this.#finishDiagnosticStep(parseRecordsSchemaMeasurement, {
        operationStatus: "completed",
        recordCount: parsedRecordsFile.records.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(parseRecordsSchemaMeasurement, { operationStatus: "failed" });
      throw error;
    }

    this.#recordById.clear();
    const mapRecordsMeasurement = this.#startDiagnosticStep({
      operationName: "load_records",
      stepName: "map_disk_records_to_memory",
      storedFileRole: "records",
    });
    try {
      for (const record of parsedRecordsFile.records) {
        this.#recordById.set(record.recordId, record);
      }
      this.#finishDiagnosticStep(mapRecordsMeasurement, {
        operationStatus: "completed",
        recordCount: parsedRecordsFile.records.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(mapRecordsMeasurement, {
        operationStatus: "failed",
        recordCount: parsedRecordsFile.records.length,
      });
      throw error;
    }
    this.#hasLoadedRecords = true;
  }

  async #writeSplitIndexFiles(): Promise<void> {
    if (!this.#hasLoadedRecords) {
      throw new Error("Cannot write codebase knowledge records before records are loaded.");
    }
    await this.#writeRecordsFile();
    await this.#writeMetadataIndexFile();
  }

  async #writeMetadataIndexFile(): Promise<void> {
    const mapMetadataMeasurement = this.#startDiagnosticStep({
      operationName: "write_metadata_index",
      stepName: "map_memory_metadata_to_disk",
      storedFileRole: "metadata_index",
    });
    let indexedFiles: readonly CodebaseIndexedFileMetadata[];
    try {
      indexedFiles = this.#listIndexedFilesFromMemory();
      this.#finishDiagnosticStep(mapMetadataMeasurement, {
        operationStatus: "completed",
        indexedFileCount: indexedFiles.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(mapMetadataMeasurement, { operationStatus: "failed" });
      throw error;
    }
    const indexFile: CodebaseKnowledgeJsonIndexFile = {
      schemaVersion: CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION,
      recordsFileName: CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME,
      indexedFiles,
    };
    await this.#writeJsonFileAtomically({
      filePath: this.#indexFilePath,
      value: indexFile,
      operationName: "write_metadata_index",
      storedFileRole: "metadata_index",
      indexedFileCount: indexedFiles.length,
    });
    this.#hasLoadedStartupMetadata = true;
  }

  async #writeRecordsFile(): Promise<void> {
    const mapRecordsMeasurement = this.#startDiagnosticStep({
      operationName: "write_records",
      stepName: "map_memory_records_to_disk",
      storedFileRole: "records",
    });
    let records: readonly CodebaseKnowledgeRecord[];
    try {
      records = this.#listRecordsFromMemory();
      this.#finishDiagnosticStep(mapRecordsMeasurement, {
        operationStatus: "completed",
        recordCount: records.length,
      });
    } catch (error) {
      this.#finishDiagnosticStep(mapRecordsMeasurement, { operationStatus: "failed" });
      throw error;
    }
    const recordsFile: CodebaseKnowledgeRecordsJsonFile = {
      schemaVersion: CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION,
      records,
    };
    await this.#writeJsonFileAtomically({
      filePath: this.#recordsFilePath,
      value: recordsFile,
      operationName: "write_records",
      storedFileRole: "records",
      recordCount: records.length,
    });
    this.#hasLoadedRecords = true;
  }

  async #writeJsonFileAtomically(input: {
    filePath: string;
    value: unknown;
    operationName: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName;
    storedFileRole: JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole;
    recordCount?: number | undefined;
    indexedFileCount?: number | undefined;
  }): Promise<void> {
    await mkdir(dirname(input.filePath), { recursive: true, mode: 0o700 });
    const temporaryFilePath = `${input.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

    const stringifyMeasurement = this.#startDiagnosticStep({
      operationName: input.operationName,
      stepName: "json_stringify",
      storedFileRole: input.storedFileRole,
    });
    let jsonFileText: string;
    try {
      jsonFileText = `${JSON.stringify(input.value, null, 2)}\n`;
      this.#finishDiagnosticStep(stringifyMeasurement, {
        operationStatus: "completed",
        serializedJsonByteLength: byteLength(jsonFileText),
        recordCount: input.recordCount,
        indexedFileCount: input.indexedFileCount,
      });
    } catch (error) {
      this.#finishDiagnosticStep(stringifyMeasurement, {
        operationStatus: "failed",
        recordCount: input.recordCount,
        indexedFileCount: input.indexedFileCount,
      });
      throw error;
    }

    const writeMeasurement = this.#startDiagnosticStep({
      operationName: input.operationName,
      stepName: "write_temporary_file",
      storedFileRole: input.storedFileRole,
    });
    try {
      await writeFile(temporaryFilePath, jsonFileText, { encoding: "utf8", mode: 0o600 });
      this.#finishDiagnosticStep(writeMeasurement, {
        operationStatus: "completed",
        serializedJsonByteLength: byteLength(jsonFileText),
        recordCount: input.recordCount,
        indexedFileCount: input.indexedFileCount,
      });
    } catch (error) {
      this.#finishDiagnosticStep(writeMeasurement, {
        operationStatus: "failed",
        serializedJsonByteLength: byteLength(jsonFileText),
        recordCount: input.recordCount,
        indexedFileCount: input.indexedFileCount,
      });
      throw error;
    }

    const renameMeasurement = this.#startDiagnosticStep({
      operationName: input.operationName,
      stepName: "rename_temporary_file",
      storedFileRole: input.storedFileRole,
    });
    try {
      await rename(temporaryFilePath, input.filePath);
      this.#finishDiagnosticStep(renameMeasurement, {
        operationStatus: "completed",
        serializedJsonByteLength: byteLength(jsonFileText),
        recordCount: input.recordCount,
        indexedFileCount: input.indexedFileCount,
      });
    } catch (error) {
      this.#finishDiagnosticStep(renameMeasurement, {
        operationStatus: "failed",
        serializedJsonByteLength: byteLength(jsonFileText),
        recordCount: input.recordCount,
        indexedFileCount: input.indexedFileCount,
      });
      throw error;
    }
  }

  #startDiagnosticStep(input: {
    operationName: JsonFileCodebaseKnowledgeRepositoryDiagnosticOperationName;
    stepName: JsonFileCodebaseKnowledgeRepositoryDiagnosticStepName;
    storedFileRole: JsonFileCodebaseKnowledgeRepositoryDiagnosticStoredFileRole;
  }): RepositoryDiagnosticStepMeasurement {
    return {
      operationName: input.operationName,
      stepName: input.stepName,
      storedFileRole: input.storedFileRole,
      startedAtMs: this.#now(),
      memoryBefore: this.#readMemoryUsage(),
    };
  }

  #finishDiagnosticStep(
    measurement: RepositoryDiagnosticStepMeasurement,
    completion: RepositoryDiagnosticStepCompletion,
  ): void {
    const memoryAfter = this.#readMemoryUsage();
    this.#emitDiagnosticEvent({
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
    });
  }

  #emitDiagnosticEvent(diagnosticEvent: JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent): void {
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

function doesRecordReferenceFilePath(input: { record: CodebaseKnowledgeRecord; filePath: string }): boolean {
  const normalizedFilePath = normalizeFilePathForComparison(input.filePath);
  return listRecordFilePaths(input.record).some((recordFilePath) => normalizeFilePathForComparison(recordFilePath) === normalizedFilePath);
}

function listRecordFilePaths(record: CodebaseKnowledgeRecord): readonly string[] {
  const evidenceFilePaths = record.evidenceRanges.map((evidenceRange) => evidenceRange.filePath);
  return [record.filePath, ...evidenceFilePaths];
}

function normalizeFilePathForComparison(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function createFilePathKey(filePath: string): string {
  return normalizeFilePathForComparison(filePath);
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
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

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
