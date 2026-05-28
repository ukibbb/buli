import { expect, test } from "bun:test";
import {
  buildCodebaseKnowledgeToolResultText,
  MAX_CODEBASE_KNOWLEDGE_TOOL_RESULT_TEXT_LENGTH,
  queryCodebaseKnowledgeRecords,
  type CodebaseKnowledgeQueryResult,
} from "../src/index.ts";
import { createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("buildCodebaseKnowledgeToolResultText returns evidence and recommended reads without raw source", () => {
  const queryResult = queryCodebaseKnowledgeRecords({
    query: { codebaseProblemDescription: "runtime <tool> dispatch" },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
        summary: "Routes provider tool calls to runtime executors.",
        tags: ["runtime", "tool", "dispatch", "export function rawSourceShouldNotAppear"],
      }),
    ],
  });

  const resultText = buildCodebaseKnowledgeToolResultText(queryResult);

  expect(resultText).toContain("<codebase_knowledge_query>");
  expect(resultText).toContain("runtime &lt;tool&gt; dispatch");
  expect(resultText).toContain('file="packages/engine/src/runtimeToolCallExecution.ts"');
  expect(resultText).toContain('offset_line="10"');
  expect(resultText).toContain("Read the exact current source ranges");
  expect(resultText).not.toContain("content_hash");
  expect(resultText).not.toContain("export function rawSourceShouldNotAppear() {");
});

test("buildCodebaseKnowledgeToolResultText caps large outputs with narrowing guidance", () => {
  const queryResult: CodebaseKnowledgeQueryResult = {
    query: { codebaseProblemDescription: "large query" },
    matches: Array.from({ length: 80 }, (_value, matchIndex) => ({
      score: 100 - matchIndex,
      matchReasons: [`matched symbol ${matchIndex}`],
      recommendedReads: [
        {
          filePath: `src/file-${matchIndex}.ts`,
          startLineNumber: 1,
          maximumLineCount: 20,
          reason: "Verify current source",
        },
      ],
      record: createTestSymbolKnowledgeRecord({
        recordId: `symbol:${matchIndex}`,
        filePath: `src/file-${matchIndex}.ts`,
        symbolName: `symbol${matchIndex}`,
        summary: `Large summary ${matchIndex} ${"output budget ".repeat(120)}`,
      }),
    })),
  };

  const resultText = buildCodebaseKnowledgeToolResultText(queryResult);

  expect(resultText.length).toBeLessThanOrEqual(MAX_CODEBASE_KNOWLEDGE_TOOL_RESULT_TEXT_LENGTH);
  expect(resultText).toContain("<codebase_knowledge_truncation>");
  expect(resultText).toContain("knownRelevantFilePaths");
  expect(resultText).toContain("</codebase_knowledge_query>");
});
