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

export class JsonFileCodebaseKnowledgeRepository implements CodebaseKnowledgeRepository {
  readonly #indexFilePath: string;
  readonly #recordsFilePath: string;
  readonly #recordById = new Map<string, CodebaseKnowledgeRecord>();
  readonly #indexedFileMetadataByPath = new Map<string, CodebaseIndexedFileMetadata>();
  #hasLoadedStartupMetadata = false;
  #hasLoadedRecords = false;

  constructor(input: { indexFilePath: string }) {
    this.#indexFilePath = input.indexFilePath;
    this.#recordsFilePath = join(dirname(input.indexFilePath), CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME);
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

    let indexFileText: string;
    try {
      indexFileText = await readFile(this.#indexFilePath, "utf8");
    } catch (error) {
      if (isFileNotFoundError(error)) {
        this.#hasLoadedStartupMetadata = true;
        this.#hasLoadedRecords = true;
        return;
      }
      throw error;
    }

    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    const parsedIndexFile = parseCodebaseKnowledgeIndexFile(indexFileText);
    if (!parsedIndexFile) {
      // Unrecognized or stale on-disk schema: start fresh and let the workspace re-index.
      this.#hasLoadedStartupMetadata = true;
      this.#hasLoadedRecords = true;
      return;
    }

    for (const indexedFileMetadata of parsedIndexFile.indexedFiles) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }
    this.#hasLoadedStartupMetadata = true;
  }

  async #loadRecordsIfNeeded(): Promise<void> {
    await this.#loadStartupMetadataIfNeeded();
    if (this.#hasLoadedRecords) {
      return;
    }

    const recordsFileText = await readFile(this.#recordsFilePath, "utf8");
    const parsedRecordsFile = CodebaseKnowledgeRecordsJsonFileV4Schema.parse(JSON.parse(recordsFileText));
    this.#recordById.clear();
    for (const record of parsedRecordsFile.records) {
      this.#recordById.set(record.recordId, record);
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
    const indexFile: CodebaseKnowledgeJsonIndexFile = {
      schemaVersion: CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION,
      recordsFileName: CODEBASE_KNOWLEDGE_RECORDS_FILE_NAME,
      indexedFiles: this.#listIndexedFilesFromMemory(),
    };
    await writeJsonFileAtomically({ filePath: this.#indexFilePath, value: indexFile });
    this.#hasLoadedStartupMetadata = true;
  }

  async #writeRecordsFile(): Promise<void> {
    const recordsFile: CodebaseKnowledgeRecordsJsonFile = {
      schemaVersion: CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION,
      records: this.#listRecordsFromMemory(),
    };
    await writeJsonFileAtomically({ filePath: this.#recordsFilePath, value: recordsFile });
    this.#hasLoadedRecords = true;
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

function parseCodebaseKnowledgeIndexFile(indexFileText: string): CodebaseKnowledgeJsonIndexFile | null {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(indexFileText);
  } catch {
    return null;
  }
  const parseResult = CodebaseKnowledgeJsonIndexFileSchema.safeParse(parsedJson);
  return parseResult.success ? parseResult.data : null;
}

function normalizeFilePathForComparison(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function createFilePathKey(filePath: string): string {
  return normalizeFilePathForComparison(filePath);
}

async function writeJsonFileAtomically(input: { filePath: string; value: unknown }): Promise<void> {
  await mkdir(dirname(input.filePath), { recursive: true, mode: 0o700 });
  const temporaryFilePath = `${input.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temporaryFilePath, `${JSON.stringify(input.value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryFilePath, input.filePath);
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
