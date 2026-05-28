import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type {
  CodebaseKnowledgeFreshness,
  CodebaseKnowledgeQuery,
  CodebaseKnowledgeQueryResult,
  CodebaseKnowledgeRecord,
  CodebaseKnowledgeRepository,
} from "./codebaseKnowledgeTypes.ts";
import { queryCodebaseKnowledgeRecords } from "./queryCodebaseKnowledge.ts";

const CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION = 1;

const CodebaseEvidenceSourceRangeSchema = z
  .object({
    filePath: z.string().min(1),
    startLineNumber: z.number().int().positive(),
    endLineNumber: z.number().int().positive(),
    contentHash: z.string().min(1),
    sourceKind: z.enum(["tree_sitter_structure", "agent_verified_summary", "tool_observation"]),
  })
  .strict();

const CodebaseKnowledgeRecordBaseSchema = z.object({
  recordId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string()),
  evidenceRanges: z.array(CodebaseEvidenceSourceRangeSchema),
  freshness: z.enum(["fresh", "stale"]),
  updatedAtMs: z.number().int().nonnegative(),
});

const CodebaseFileKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("file"),
  filePath: z.string().min(1),
  languageId: z.string().min(1),
  importedModuleSpecifiers: z.array(z.string()),
  exportedSymbolNames: z.array(z.string()),
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
}).strict();

const CodebaseFlowKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("flow"),
  flowName: z.string().min(1),
  involvedFilePaths: z.array(z.string()),
  involvedSymbolNames: z.array(z.string()),
}).strict();

const CodebaseConceptKnowledgeRecordSchema = CodebaseKnowledgeRecordBaseSchema.extend({
  recordKind: z.literal("concept"),
  conceptName: z.string().min(1),
  relatedFilePaths: z.array(z.string()),
  relatedSymbolNames: z.array(z.string()),
}).strict();

const CodebaseKnowledgeRecordSchema = z.discriminatedUnion("recordKind", [
  CodebaseFileKnowledgeRecordSchema,
  CodebaseSymbolKnowledgeRecordSchema,
  CodebaseFlowKnowledgeRecordSchema,
  CodebaseConceptKnowledgeRecordSchema,
]);

const CodebaseKnowledgeJsonIndexFileSchema = z
  .object({
    schemaVersion: z.literal(CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION),
    records: z.array(CodebaseKnowledgeRecordSchema),
  })
  .strict();

export type CodebaseKnowledgeJsonIndexFile = {
  schemaVersion: typeof CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION;
  records: readonly CodebaseKnowledgeRecord[];
};

export class JsonFileCodebaseKnowledgeRepository implements CodebaseKnowledgeRepository {
  readonly #indexFilePath: string;
  readonly #recordById = new Map<string, CodebaseKnowledgeRecord>();
  #hasLoadedIndexFile = false;

  constructor(input: { indexFilePath: string }) {
    this.#indexFilePath = input.indexFilePath;
  }

  async upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    await this.#loadIndexFileIfNeeded();
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
    await this.#writeIndexFile();
  }

  async replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void> {
    await this.#loadIndexFileIfNeeded();
    this.#recordById.clear();
    for (const record of records) {
      this.#recordById.set(record.recordId, record);
    }
    await this.#writeIndexFile();
  }

  async replaceFileRecords(input: { filePath: string; records: readonly CodebaseKnowledgeRecord[] }): Promise<void> {
    await this.#loadIndexFileIfNeeded();
    for (const record of this.#recordById.values()) {
      if (doesRecordReferenceFilePath({ record, filePath: input.filePath })) {
        this.#recordById.delete(record.recordId);
      }
    }

    for (const record of input.records) {
      this.#recordById.set(record.recordId, record);
    }
    await this.#writeIndexFile();
  }

  async markFilePathStale(filePath: string): Promise<void> {
    await this.#loadIndexFileIfNeeded();
    let didChangeRecord = false;
    for (const record of this.#recordById.values()) {
      if (!doesRecordReferenceFilePath({ record, filePath }) || record.freshness === "stale") {
        continue;
      }
      this.#recordById.set(record.recordId, withRecordFreshness({ record, freshness: "stale" }));
      didChangeRecord = true;
    }

    if (didChangeRecord) {
      await this.#writeIndexFile();
    }
  }

  async queryRecords(query: CodebaseKnowledgeQuery): Promise<CodebaseKnowledgeQueryResult> {
    return queryCodebaseKnowledgeRecords({ query, records: await this.listRecords() });
  }

  async listRecords(): Promise<readonly CodebaseKnowledgeRecord[]> {
    await this.#loadIndexFileIfNeeded();
    return [...this.#recordById.values()].sort((leftRecord, rightRecord) => leftRecord.recordId.localeCompare(rightRecord.recordId));
  }

  async #loadIndexFileIfNeeded(): Promise<void> {
    if (this.#hasLoadedIndexFile) {
      return;
    }

    let indexFileText: string;
    try {
      indexFileText = await readFile(this.#indexFilePath, "utf8");
    } catch (error) {
      if (isFileNotFoundError(error)) {
        this.#hasLoadedIndexFile = true;
        return;
      }
      throw error;
    }

    const parsedIndexFile = CodebaseKnowledgeJsonIndexFileSchema.parse(JSON.parse(indexFileText));
    this.#recordById.clear();
    for (const record of parsedIndexFile.records) {
      this.#recordById.set(record.recordId, record);
    }
    this.#hasLoadedIndexFile = true;
  }

  async #writeIndexFile(): Promise<void> {
    await mkdir(dirname(this.#indexFilePath), { recursive: true, mode: 0o700 });
    const temporaryIndexFilePath = `${this.#indexFilePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    const indexFile: CodebaseKnowledgeJsonIndexFile = {
      schemaVersion: CODEBASE_KNOWLEDGE_JSON_INDEX_SCHEMA_VERSION,
      records: await this.listRecords(),
    };
    await writeFile(temporaryIndexFilePath, `${JSON.stringify(indexFile, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryIndexFilePath, this.#indexFilePath);
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

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
