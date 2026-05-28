import { expect, test } from "bun:test";
import { InMemoryCodebaseKnowledgeRepository } from "../src/index.ts";
import { createTestFileKnowledgeRecord, createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("InMemoryCodebaseKnowledgeRepository marks all knowledge for a changed file as stale", async () => {
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

  await repository.markFilePathStale("packages/engine/src/runtimeToolCallExecution.ts");

  const records = await repository.listRecords();
  expect(records.filter((record) => record.freshness === "stale").map((record) => record.recordId)).toEqual([
    "file:runtime",
    "symbol:runtime",
  ]);
  expect(records.find((record) => record.recordId === "symbol:request")?.freshness).toBe("fresh");
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

  const queryResult = await repository.queryRecords({ codebaseProblemDescription: "runtime tool dispatch" });

  expect(queryResult.matches[0]?.record.recordId).toBe("symbol:runtime");
  expect(queryResult.matches[0]?.recommendedReads[0]).toMatchObject({
    filePath: "packages/engine/src/runtimeToolCallExecution.ts",
    startLineNumber: 10,
    maximumLineCount: 11,
  });
});
