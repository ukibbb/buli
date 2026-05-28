import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileCodebaseKnowledgeRepository, type CodebaseKnowledgeJsonIndexFile } from "../src/index.ts";
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
    freshness: "fresh",
  });

  await repository.upsertRecords([runtimeRecord]);

  const persistedIndexFile = JSON.parse(await readFile(indexFilePath, "utf8")) as CodebaseKnowledgeJsonIndexFile;
  expect(persistedIndexFile.schemaVersion).toBe(1);
  expect(persistedIndexFile.records).toHaveLength(1);

  const reloadedRepository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });
  const queryResult = await reloadedRepository.queryRecords({
    codebaseProblemDescription: "runtime dispatch",
    knownRelevantSymbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"],
  });

  expect(queryResult.matches[0]?.record.recordId).toBe("symbol:runtime");
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
      freshness: "fresh",
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
        freshness: "fresh",
      }),
    ],
  });

  expect((await repository.listRecords()).map((record) => record.recordId)).toEqual(["symbol:new"]);
});

test("JsonFileCodebaseKnowledgeRepository rejects malformed index files", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "buli-json-codebase-knowledge-invalid-"));
  const indexFilePath = join(workspaceRootPath, ".buli", "index", "codebase-knowledge.json");
  await mkdir(join(workspaceRootPath, ".buli", "index"), { recursive: true });
  await writeFile(indexFilePath, JSON.stringify({ schemaVersion: 999, records: [] }), "utf8");
  const repository = new JsonFileCodebaseKnowledgeRepository({ indexFilePath });

  await expect(repository.listRecords()).rejects.toThrow();
});
