import { expect, test } from "bun:test";
import { queryCodebaseKnowledgeRecords } from "../src/index.ts";
import { createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("queryCodebaseKnowledgeRecords ranks exact symbol hints above lexical matches", () => {
  const queryResult = queryCodebaseKnowledgeRecords({
    query: {
      codebaseProblemDescription: "runtime tool dispatch",
      knownRelevantSymbolNames: ["createOpenAiResponsesInputItems"],
    },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
        summary: "Routes provider tool calls to runtime executors.",
        tags: ["runtime", "tool", "dispatch"],
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:request",
        filePath: "packages/openai/src/provider/request.ts",
        symbolName: "createOpenAiResponsesInputItems",
        summary: "Builds OpenAI input items from conversation entries.",
        tags: ["openai", "request"],
      }),
    ],
  });

  expect(queryResult.matches[0]?.record.recordId).toBe("symbol:request");
  expect(queryResult.matches[0]?.matchReasons).toContain("matched symbol createOpenAiResponsesInputItems");
});

test("queryCodebaseKnowledgeRecords penalizes stale records but keeps them discoverable", () => {
  const queryResult = queryCodebaseKnowledgeRecords({
    query: { codebaseProblemDescription: "runtime tool dispatch" },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:fresh-runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "freshRuntimeDispatch",
        summary: "Runtime tool dispatch.",
        tags: ["runtime", "tool", "dispatch"],
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:stale-runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "staleRuntimeDispatch",
        summary: "Runtime tool dispatch.",
        tags: ["runtime", "tool", "dispatch"],
        freshness: "stale",
      }),
    ],
  });

  expect(queryResult.matches.map((match) => match.record.recordId)).toEqual(["symbol:fresh-runtime", "symbol:stale-runtime"]);
  expect(queryResult.matches[1]?.matchReasons).toContain("record is stale; verify current source before relying on it");
});

test("queryCodebaseKnowledgeRecords respects maximumKnowledgeResultCount", () => {
  const queryResult = queryCodebaseKnowledgeRecords({
    query: { codebaseProblemDescription: "runtime", maximumKnowledgeResultCount: 1 },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime-a",
        filePath: "a.ts",
        symbolName: "runtimeA",
        summary: "Runtime A.",
        tags: ["runtime"],
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime-b",
        filePath: "b.ts",
        symbolName: "runtimeB",
        summary: "Runtime B.",
        tags: ["runtime"],
      }),
    ],
  });

  expect(queryResult.matches).toHaveLength(1);
});
