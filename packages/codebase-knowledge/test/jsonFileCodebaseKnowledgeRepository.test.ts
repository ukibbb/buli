import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonFileCodebaseKnowledgeRepository,
  type CodebaseKnowledgeJsonIndexFile,
  type CodebaseKnowledgeRecordsJsonFile,
  type JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent,
  type JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot,
} from "../src/index.ts";
import { createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("JsonFileCodebaseKnowledgeRepository persists and reloads records", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    title: "Runtime dispatch",
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
    declarationPreview: {
      declarationPreviewText: "export function streamAssistantResponseEventsForRequestedToolCalls() { … }",
    },
  });

  await repository.upsertRecords([runtimeRecord]);

  const persistedIndexFile = JSON.parse(await readFile(indexFilePath, "utf8")) as CodebaseKnowledgeJsonIndexFile;
  expect(persistedIndexFile.schemaVersion).toBe(4);
  expect(persistedIndexFile.recordsFileName).toBe("codebase-knowledge.records.json");
  expect(persistedIndexFile.indexedFiles).toEqual([]);
  const persistedRecordsFile = JSON.parse(
    await readFile(join(workspaceRootPath, ".buli", "index", "codebase-knowledge.records.json"), "utf8"),
  ) as CodebaseKnowledgeRecordsJsonFile;
  expect(persistedRecordsFile.records).toEqual([runtimeRecord]);

  const reloadedRepository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  const locatorResult = await reloadedRepository.locateSymbolDefinitions({
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
  });

  expect(locatorResult.symbolLookups[0]?.lookupStatus).toBe("resolved");
  expect(locatorResult.symbolLookups[0]?.locations[0]).toMatchObject({
    filePath: runtimeRecord.filePath,
    symbolName: runtimeRecord.symbolName,
    symbolKind: runtimeRecord.symbolKind,
    startLineNumber: runtimeRecord.startLineNumber,
    endLineNumber: runtimeRecord.endLineNumber,
    isExported: runtimeRecord.isExported,
  });
});

test("JsonFileCodebaseKnowledgeRepository reads startup metadata without loading split records", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-metadata-only-"));
  const indexDirectoryPath = join(workspaceRootPath, ".buli", "index");
  const indexFilePath = join(indexDirectoryPath, "codebase-knowledge.json");
  const indexedFileMetadata = {
    filePath: "src/runtime.ts",
    languageId: "typescript",
    sourceFileSizeBytes: 42,
    sourceFileModifiedAtMs: 123.5,
    contentHash: "hash-runtime",
    indexedAtMs: 200,
    recordIds: ["symbol:runtime"],
  };
  await mkdir(indexDirectoryPath, { recursive: true });
  await writeFile(indexFilePath, JSON.stringify({
    schemaVersion: 4,
    recordsFileName: "codebase-knowledge.records.json",
    indexedFiles: [indexedFileMetadata],
  }), "utf8");
  await writeFile(join(indexDirectoryPath, "codebase-knowledge.records.json"), "not json", "utf8");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });

  await expect(repository.readStartupMetadata()).resolves.toEqual({ indexedFiles: [indexedFileMetadata] });
  await expect(repository.listRecords()).rejects.toThrow();
});

test("JsonFileCodebaseKnowledgeRepository updates startup metadata without loading split records", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-metadata-update-"));
  const indexDirectoryPath = join(workspaceRootPath, ".buli", "index");
  const indexFilePath = join(indexDirectoryPath, "codebase-knowledge.json");
  const indexedFileMetadata = {
    filePath: "src/runtime.ts",
    languageId: "typescript",
    sourceFileSizeBytes: 42,
    sourceFileModifiedAtMs: 123.5,
    contentHash: "hash-runtime",
    indexedAtMs: 200,
    recordIds: ["symbol:runtime"],
  };
  await mkdir(indexDirectoryPath, { recursive: true });
  await writeFile(indexFilePath, JSON.stringify({
    schemaVersion: 4,
    recordsFileName: "codebase-knowledge.records.json",
    indexedFiles: [indexedFileMetadata],
  }), "utf8");
  await writeFile(join(indexDirectoryPath, "codebase-knowledge.records.json"), "not json", "utf8");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });

  await repository.replaceStartupMetadata({
    indexedFiles: [{ ...indexedFileMetadata, sourceFileModifiedAtMs: 500 }],
  });

  await expect(repository.readStartupMetadata()).resolves.toEqual({
    indexedFiles: [{ ...indexedFileMetadata, sourceFileModifiedAtMs: 500 }],
  });
  await expect(repository.listRecords()).rejects.toThrow();
});

test("JsonFileCodebaseKnowledgeRepository replaces records for a re-indexed file", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-replace-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  await repository.upsertRecords([
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:old",
      title: "Old runtime symbol",
      filePath: "src/runtime.ts",
      symbolName: "oldRuntimeSymbol",
    }),
  ]);

  await repository.replaceFileRecords({
    filePath: "src/runtime.ts",
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:new",
        title: "New runtime symbol",
        filePath: "src/runtime.ts",
        symbolName: "newRuntimeSymbol",
      }),
    ],
  });

  expect((await repository.listRecords()).map((record) => record.recordId)).toEqual(["symbol:new"]);
});

test("JsonFileCodebaseKnowledgeRepository emits load and write diagnostics with memory deltas", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-diagnostics-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  const originalRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:old",
    title: "Old runtime symbol",
    filePath: "src/runtime.ts",
    symbolName: "oldRuntimeSymbol",
  });
  const updatedRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:new",
    title: "New runtime symbol",
    filePath: "src/runtime.ts",
    symbolName: "newRuntimeSymbol",
  });
  const indexedFileMetadata = {
    filePath: "src/runtime.ts",
    languageId: "typescript",
    sourceFileSizeBytes: 42,
    sourceFileModifiedAtMs: 123.5,
    contentHash: "hash-runtime",
    indexedAtMs: 200,
    recordIds: ["symbol:new"],
  };
  await new JsonFileCodebaseKnowledgeRepository({ indexFilePath }).replaceSnapshot({
    records: [originalRecord],
    indexedFiles: [{ ...indexedFileMetadata, recordIds: ["symbol:old"] }],
  });
  const diagnosticEvents: JsonFileCodebaseKnowledgeRepositoryDiagnosticEvent[] = [];
  const repository = new JsonFileCodebaseKnowledgeRepository({
    indexFilePath,
    diagnosticReporter: (diagnosticEvent) => diagnosticEvents.push(diagnosticEvent),
    now: createIncrementingNow({ startAtMs: 100, incrementMs: 5 }),
    readMemoryUsage: createIncrementingMemoryUsageReader({ startRssBytes: 1_000, incrementBytes: 10 }),
  });

  await repository.replaceFileRecords({
    filePath: "src/runtime.ts",
    records: [updatedRecord],
    indexedFileMetadata,
  });

  expect((await repository.listRecords()).map((record) => record.recordId)).toEqual(["symbol:new"]);
  expect(diagnosticEvents.map((diagnosticEvent) => [
    diagnosticEvent.operationName,
    diagnosticEvent.stepName,
    diagnosticEvent.storedFileRole,
    diagnosticEvent.operationStatus,
  ])).toEqual([
    ["read_startup_metadata", "read_file", "metadata_index", "completed"],
    ["read_startup_metadata", "json_parse", "metadata_index", "completed"],
    ["read_startup_metadata", "schema_parse", "metadata_index", "completed"],
    ["read_startup_metadata", "map_disk_metadata_to_memory", "metadata_index", "completed"],
    ["load_records", "read_file", "records", "completed"],
    ["load_records", "json_parse", "records", "completed"],
    ["load_records", "schema_parse", "records", "completed"],
    ["load_records", "map_disk_records_to_memory", "records", "completed"],
    ["write_records", "map_memory_records_to_disk", "records", "completed"],
    ["write_records", "json_stringify", "records", "completed"],
    ["write_records", "write_temporary_file", "records", "completed"],
    ["write_records", "rename_temporary_file", "records", "completed"],
    ["write_metadata_index", "map_memory_metadata_to_disk", "metadata_index", "completed"],
    ["write_metadata_index", "json_stringify", "metadata_index", "completed"],
    ["write_metadata_index", "write_temporary_file", "metadata_index", "completed"],
    ["write_metadata_index", "rename_temporary_file", "metadata_index", "completed"],
  ]);
  expect(diagnosticEvents[0]).toMatchObject({
    durationMs: 5,
    memoryBeforeRssBytes: 1_000,
    memoryAfterRssBytes: 1_010,
    memoryDeltaRssBytes: 10,
  });
  expect(diagnosticEvents.find((diagnosticEvent) =>
    diagnosticEvent.operationName === "load_records" && diagnosticEvent.stepName === "schema_parse"
  )).toMatchObject({ recordCount: 1 });
  expect(diagnosticEvents.find((diagnosticEvent) =>
    diagnosticEvent.operationName === "write_records" && diagnosticEvent.stepName === "json_stringify"
  )?.serializedJsonByteLength).toBeGreaterThan(0);
});

test("JsonFileCodebaseKnowledgeRepository ignores diagnostic reporter failures", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-diagnostics-failure-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    title: "Runtime dispatch",
    filePath: "src/runtime.ts",
    symbolName: "runRuntime",
  });
  const repository = new JsonFileCodebaseKnowledgeRepository({
    indexFilePath,
    diagnosticReporter: () => {
      throw new Error("diagnostic sink unavailable");
    },
  });

  await repository.upsertRecords([runtimeRecord]);

  await expect(repository.listRecords()).resolves.toEqual([runtimeRecord]);
  const reloadedRepository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  await expect(reloadedRepository.listRecords()).resolves.toEqual([runtimeRecord]);
});

test("JsonFileCodebaseKnowledgeRepository persists and reloads snapshot metadata", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-snapshot-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    title: "Runtime dispatch",
    filePath: "src/runtime.ts",
    symbolName: "runRuntime",
  });
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
    records: [runtimeRecord],
    indexedFiles: [indexedFileMetadata],
  });

  const reloadedRepository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  await expect(reloadedRepository.readSnapshot()).resolves.toEqual({
    records: [runtimeRecord],
    indexedFiles: [indexedFileMetadata],
  });
});

test("JsonFileCodebaseKnowledgeRepository starts fresh when the on-disk index uses an unrecognized schema", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-legacy-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    title: "Runtime dispatch",
    filePath: "src/runtime.ts",
    symbolName: "runRuntime",
  });
  await mkdir(join(workspaceRootPath, ".buli", "index"), { recursive: true });
  await writeFile(indexFilePath, JSON.stringify({ schemaVersion: 1, records: [runtimeRecord] }), "utf8");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });

  await expect(repository.readSnapshot()).resolves.toEqual({
    records: [],
    indexedFiles: [],
  });
});

test("JsonFileCodebaseKnowledgeRepository starts fresh instead of parsing stale v3 split records", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-stale-v3-"));
  const indexDirectoryPath = join(workspaceRootPath, ".buli", "index");
  const indexFilePath = join(indexDirectoryPath, "codebase-knowledge.json");
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    title: "Runtime dispatch",
    filePath: "src/runtime.ts",
    symbolName: "runRuntime",
  });
  const staleRuntimeRecord = {
    ...runtimeRecord,
    freshness: "fresh",
    evidenceRanges: runtimeRecord.evidenceRanges.map((evidenceRange) => ({
      ...evidenceRange,
      sourceKind: "tree_sitter",
    })),
  };
  await mkdir(indexDirectoryPath, { recursive: true });
  await writeFile(indexFilePath, JSON.stringify({
    schemaVersion: 3,
    recordsFileName: "codebase-knowledge.records.json",
    indexedFiles: [
      {
        filePath: "src/runtime.ts",
        languageId: "typescript",
        sourceFileSizeBytes: 42,
        sourceFileModifiedAtMs: 123.5,
        contentHash: "hash-runtime",
        indexedAtMs: 200,
        recordIds: ["symbol:runtime"],
        structureMapVersion: 3,
      },
    ],
  }), "utf8");
  await writeFile(join(indexDirectoryPath, "codebase-knowledge.records.json"), JSON.stringify({
    schemaVersion: 3,
    records: [staleRuntimeRecord],
  }), "utf8");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });

  await expect(repository.readSnapshot()).resolves.toEqual({
    records: [],
    indexedFiles: [],
  });
});

test("JsonFileCodebaseKnowledgeRepository starts fresh when the index file is malformed", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-invalid-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  await mkdir(join(workspaceRootPath, ".buli", "index"), { recursive: true });
  await writeFile(indexFilePath, "{ not valid json", "utf8");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });

  await expect(repository.listRecords()).resolves.toEqual([]);
});

function createIncrementingNow(input: { startAtMs: number; incrementMs: number }): () => number {
  let currentNowMs = input.startAtMs;
  return () => {
    const reportedNowMs = currentNowMs;
    currentNowMs += input.incrementMs;
    return reportedNowMs;
  };
}

function createIncrementingMemoryUsageReader(input: {
  startRssBytes: number;
  incrementBytes: number;
}): () => JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot {
  let currentRssBytes = input.startRssBytes;
  return () => {
    const memoryUsageSnapshot: JsonFileCodebaseKnowledgeRepositoryMemoryUsageSnapshot = {
      rssBytes: currentRssBytes,
      heapTotalBytes: currentRssBytes + 100,
      heapUsedBytes: currentRssBytes + 200,
      externalBytes: currentRssBytes + 300,
      arrayBuffersBytes: currentRssBytes + 400,
    };
    currentRssBytes += input.incrementBytes;
    return memoryUsageSnapshot;
  };
}
