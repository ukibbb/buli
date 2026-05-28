import type {
  CodebaseKnowledgeFreshness,
  CodebaseKnowledgeQuery,
  CodebaseKnowledgeQueryResult,
  CodebaseKnowledgeRecord,
  CodebaseKnowledgeRepository,
} from "./codebaseKnowledgeTypes.ts";
import { queryCodebaseKnowledgeRecords } from "./queryCodebaseKnowledge.ts";

export class InMemoryCodebaseKnowledgeRepository implements CodebaseKnowledgeRepository {
  readonly #recordById = new Map<string, CodebaseKnowledgeRecord>();

  async upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
  }

  async replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    this.#recordById.clear();
    await this.upsertRecords(records);
  }

  async replaceFileRecords(input: { filePath: string; records: readonly CodebaseKnowledgeRecord[] }): Promise<void> {
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath: input.filePath })) {
        this.#recordById.delete(record.recordId);
      }
    }

    await this.upsertRecords(input.records);
  }

  async markFilePathStale(filePath: string): Promise<void> {
    for (const record of this.#recordById.values()) {
      if (!doesRecordReferenceFilePath({ record, filePath })) {
        continue;
      }
      this.#recordById.set(record.recordId, withRecordFreshness({ record, freshness: "stale" }));
    }
  }

  async queryRecords(query: CodebaseKnowledgeQuery): Promise<CodebaseKnowledgeQueryResult> {
    return queryCodebaseKnowledgeRecords({ query, records: await this.listRecords() });
  }

  async listRecords(): Promise<readonly CodebaseKnowledgeRecord[]> {
    return [...this.#recordById.values()].sort((leftRecord, rightRecord) => leftRecord.recordId.localeCompare(rightRecord.recordId));
  }
}

function doesRecordReferenceFilePath(input: { record: CodebaseKnowledgeRecord; filePath: string }): boolean {
  const normalizedFilePath = normalizeFilePathForComparison(input.filePath);
  return listRecordFilePaths(input.record).some((recordFilePath) => normalizeFilePathForComparison(recordFilePath) === normalizedFilePath);
}

function listRecordFilePaths(record: CodebaseKnowledgeRecord): readonly string[] {
  const evidenceFilePaths = record.evidenceRanges.map((evidenceRange) => evidenceRange.filePath);
  switch (record.recordKind) {
    case "file":
      return [record.filePath, ...evidenceFilePaths];
    case "symbol":
      return [record.filePath, ...evidenceFilePaths];
    case "flow":
      return [...record.involvedFilePaths, ...evidenceFilePaths];
    case "concept":
      return [...record.relatedFilePaths, ...evidenceFilePaths];
  }
}

function withRecordFreshness(input: {
  record: CodebaseKnowledgeRecord;
  freshness: CodebaseKnowledgeFreshness;
}): CodebaseKnowledgeRecord {
  switch (input.record.recordKind) {
    case "file":
      return { ...input.record, freshness: input.freshness };
    case "symbol":
      return { ...input.record, freshness: input.freshness };
    case "flow":
      return { ...input.record, freshness: input.freshness };
    case "concept":
      return { ...input.record, freshness: input.freshness };
  }
}

function normalizeFilePathForComparison(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}
