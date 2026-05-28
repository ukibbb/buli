import { expect, test } from "bun:test";
import { InMemoryCodebaseKnowledgeRepository } from "../src/index.ts";
import { createTestFileKnowledgeRecord, createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("InMemoryCodebaseKnowledgeRepository removes all knowledge for a changed file", async () => {
  const repository = new InMemoryCodebaseKnowledgeRepository();
  await repository.upsertRecords([
    createTestFileKnowledgeRecord({
      recordId: "file:runtime",
      filePath: "packages/engine/src/runtimeToolCallExecution.ts",
      symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
    }),
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:runtime",
      filePath: "packages/engine/src/runtimeToolCallExecution.ts",
      symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
      summary: "Routes provider tool calls to runtime executors.",
    }),
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:request",
      filePath: "packages/openai/src/provider/request.ts",
      symbolName: "createOpenAiResponsesInputItems",
      summary: "Builds OpenAI input items.",
    }),
  ]);

  await repository.removeFileRecords("packages/engine/src/runtimeToolCallExecution.ts");

  const records = await repository.listRecords();
  expect(records.map((record) => record.recordId)).toEqual(["symbol:request"]);
});

test("InMemoryCodebaseKnowledgeRepository replaces records for one file after re-indexing", async () => {
  const repository = new InMemoryCodebaseKnowledgeRepository();
  await repository.upsertRecords([
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:old-runtime",
      filePath: "packages/engine/src/runtimeToolCallExecution.ts",
      symbolName: "oldRuntimeDispatch",
      summary: "Old runtime dispatch summary.",
    }),
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:request",
      filePath: "packages/openai/src/provider/request.ts",
      symbolName: "createOpenAiResponsesInputItems",
      summary: "Builds OpenAI input items.",
    }),
  ]);

  await repository.replaceFileRecords({
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:new-runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "newRuntimeDispatch",
        summary: "New runtime dispatch summary.",
      }),
    ],
  });

  expect((await repository.listRecords()).map((record) => record.recordId)).toEqual(["symbol:new-runtime", "symbol:request"]);
});

test("InMemoryCodebaseKnowledgeRepository stores and replaces repository snapshots", async () => {
  const repository = new InMemoryCodebaseKnowledgeRepository();
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
    summary: "Routes provider tool calls to runtime executors.",
  });
  const indexedFileMetadata = {
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
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

  await expect(repository.readSnapshot()).resolves.toEqual({
    records: [runtimeRecord],
    indexedFiles: [indexedFileMetadata],
  });
});

test("InMemoryCodebaseKnowledgeRepository removes records and indexed metadata for a removed file", async () => {
  const repository = new InMemoryCodebaseKnowledgeRepository();
  const runtimeRecord = createTestSymbolKnowledgeRecord({
    recordId: "symbol:runtime",
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
    summary: "Routes provider tool calls to runtime executors.",
  });

  await repository.replaceFileRecords({
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    records: [runtimeRecord],
    indexedFileMetadata: {
      filePath: "packages/engine/src/runtimeToolCallExecution.ts",
      languageId: "typescript",
      sourceFileSizeBytes: 42,
      sourceFileModifiedAtMs: 123.5,
      contentHash: "hash-runtime",
      indexedAtMs: 200,
      recordIds: ["symbol:runtime"],
    },
  });

  await repository.removeFileRecords("packages/engine/src/runtimeToolCallExecution.ts");

  const snapshot = await repository.readSnapshot();
  expect(snapshot.records).toEqual([]);
  expect(snapshot.indexedFiles).toEqual([]);
});

test("InMemoryCodebaseKnowledgeRepository queries records with the shared ranker", async () => {
  const repository = new InMemoryCodebaseKnowledgeRepository();
  await repository.upsertRecords([
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:runtime",
      filePath: "packages/engine/src/runtimeToolCallExecution.ts",
      symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
      summary: "Routes provider tool calls to runtime executors.",
      tags: ["tool", "dispatch", "runtime"],
    }),
    createTestSymbolKnowledgeRecord({
      recordId: "symbol:request",
      filePath: "packages/openai/src/provider/request.ts",
      symbolName: "createOpenAiResponsesInputItems",
      summary: "Builds OpenAI input items.",
      tags: ["openai", "request"],
    }),
  ]);

  const queryResult = await repository.queryRecords({
    symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
  });

  expect(queryResult.matches[0]?.record.recordId).toBe("symbol:runtime");
  expect(queryResult.matches[0]?.recommendedReads[0]).toMatchObject({
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    startLineNumber: 10,
    maximumLineCount: 11,
  });
});
