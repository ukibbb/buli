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
    query: { filePaths: ["packages/engine/src/runtimeToolCallExecution.ts"] },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
        summary: "Routes provider tool calls to runtime executors.",
        tags: ["runtime", "tool", "dispatch", "export function rawSourceShouldNotAppear"],
        declarationPreview: {
          declarationPreviewText: "export function streamAssistantResponseEventsForRequestedToolCalls() { … }",
        },
      }),
    ],
  });

  const resultText = buildCodebaseKnowledgeToolResultText(queryResult);

  expect(resultText).toContain("<codebase_knowledge_query>");
  expect(resultText).toContain('file="packages/engine/src/runtimeToolCallExecution.ts"');
  expect(resultText).toContain('offset_line="10"');
  expect(resultText).toContain("<map_details>");
  expect(resultText).toContain(
    '<symbol name="streamAssistantResponseEventsForRequestedToolCalls" kind="function" exported="true" file="packages/engine/src/runtimeToolCallExecution.ts" lines="10-20" />',
  );
  expect(resultText).toContain("<declaration_preview>export function streamAssistantResponseEventsForRequestedToolCalls() { … }</declaration_preview>");
  expect(resultText).toContain("Read the exact current source ranges");
  expect(resultText).not.toContain("content_hash");
  expect(resultText).not.toContain("export function rawSourceShouldNotAppear() {");
});

test("buildCodebaseKnowledgeToolResultText caps large outputs with narrowing guidance", () => {
  const queryResult: CodebaseKnowledgeQueryResult = {
    query: { symbolNames: ["symbol0"] },
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
  expect(resultText).toContain("filePaths");
  expect(resultText).toContain("</codebase_knowledge_query>");
});
