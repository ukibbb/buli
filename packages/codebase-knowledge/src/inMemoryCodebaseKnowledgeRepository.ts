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

export class InMemoryCodebaseKnowledgeRepository implements CodebaseKnowledgeRepository {
  readonly #recordById = new Map<string, CodebaseKnowledgeRecord>();
  readonly #indexedFileMetadataByPath = new Map<string, CodebaseIndexedFileMetadata>();

  async upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
  }

  async replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    await this.upsertRecords(records);
  }

  async replaceFileRecords(input: {
    filePath: string;
    records: readonly CodebaseKnowledgeRecord[];
    indexedFileMetadata?: CodebaseIndexedFileMetadata | undefined;
  }): Promise<void> {
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath: input.filePath })) {
        this.#recordById.delete(record.recordId);
      }
    }
    this.#indexedFileMetadataByPath.delete(createFilePathKey(input.filePath));

    await this.upsertRecords(input.records);
    if (input.indexedFileMetadata) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(input.indexedFileMetadata.filePath), input.indexedFileMetadata);
    }
  }

  async removeFileRecords(filePath: string): Promise<void> {
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath })) {
        this.#recordById.delete(record.recordId);
      }
    }
    this.#indexedFileMetadataByPath.delete(createFilePathKey(filePath));
  }

  async readStartupMetadata(): Promise<CodebaseKnowledgeRepositoryStartupMetadata> {
    return {
      indexedFiles: this.#listIndexedFilesFromMemory(),
    };
  }

  async replaceStartupMetadata(startupMetadata: CodebaseKnowledgeRepositoryStartupMetadata): Promise<void> {
    this.#indexedFileMetadataByPath.clear();
    for (const indexedFileMetadata of startupMetadata.indexedFiles) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }
  }

  async readSnapshot(): Promise<CodebaseKnowledgeRepositorySnapshot> {
    return {
      records: await this.listRecords(),
      indexedFiles: this.#listIndexedFilesFromMemory(),
    };
  }

  async replaceSnapshot(snapshot: CodebaseKnowledgeRepositorySnapshot): Promise<void> {
    this.#recordById.clear();
    this.#indexedFileMetadataByPath.clear();
    await this.upsertRecords(snapshot.records);
    for (const indexedFileMetadata of snapshot.indexedFiles) {
      this.#indexedFileMetadataByPath.set(createFilePathKey(indexedFileMetadata.filePath), indexedFileMetadata);
    }
  }

  async locateSymbolDefinitions(query: CodebaseSymbolDefinitionLocatorQuery): Promise<CodebaseSymbolDefinitionLocatorResult> {
    return locateCodebaseSymbolDefinitions({ query, records: await this.listRecords() });
  }

  async listRecords(): Promise<readonly CodebaseKnowledgeRecord[]> {
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
