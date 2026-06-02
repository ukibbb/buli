import { expect, test } from "bun:test";
import {
  buildCodebaseSymbolDefinitionToolResultText,
  locateCodebaseSymbolDefinitions,
  MAX_CODEBASE_SYMBOL_DEFINITION_TOOL_RESULT_TEXT_LENGTH,
  type CodebaseSymbolDefinitionLocatorResult,
} from "../src/index.ts";
import { createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("buildCodebaseSymbolDefinitionToolResultText returns exact locations and verification reads without score or raw source", () => {
  const locatorResult = locateCodebaseSymbolDefinitions({
    query: { symbolNames: ["streamAssistantResponseEventsForRequestedToolCalls"] },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime",
        filePath: "packages/engine/src/runtimeToolCallExecution.ts",
        symbolName: "streamAssistantResponseEventsForRequestedToolCalls",
        startLineNumber: 10,
        endLineNumber: 20,
        summary: "Routes provider tool calls to runtime executors.",
        tags: ["runtime", "tool", "dispatch", "export function rawSourceShouldNotAppear"],
        declarationPreview: {
          declarationPreviewText: "export function streamAssistantResponseEventsForRequestedToolCalls() { … }",
        },
      }),
    ],
  });

  const resultText = buildCodebaseSymbolDefinitionToolResultText(locatorResult);

  expect(resultText).toContain("<codebase_symbol_locations>");
  expect(resultText).toContain('<symbol_result name="streamAssistantResponseEventsForRequestedToolCalls" status="resolved" location_count="1">');
  expect(resultText).toContain(
    '<location file="packages/engine/src/runtimeToolCallExecution.ts" name="streamAssistantResponseEventsForRequestedToolCalls" kind="function" exported="true" lines="10-20">',
  );
  expect(resultText).toContain('<verification_read file="packages/engine/src/runtimeToolCallExecution.ts" offset_line="10" line_count="11" reason="Verify exact definition of streamAssistantResponseEventsForRequestedToolCalls" />');
  expect(resultText).toContain("<declaration_preview>export function streamAssistantResponseEventsForRequestedToolCalls() { … }</declaration_preview>");
  expect(resultText).toContain("Read the exact current source ranges");
  expect(resultText).not.toContain("score=");
  expect(resultText).not.toContain("<match");
  expect(resultText).not.toContain("content_hash");
  expect(resultText).not.toContain("export function rawSourceShouldNotAppear() {");
});

test("buildCodebaseSymbolDefinitionToolResultText reports ambiguous and not_found statuses", () => {
  const locatorResult = locateCodebaseSymbolDefinitions({
    query: { symbolNames: ["Button", "MissingSymbol"] },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:button-a",
        filePath: "src/a/Button.tsx",
        symbolName: "Button",
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:button-b",
        filePath: "src/b/Button.tsx",
        symbolName: "Button",
      }),
    ],
  });

  const resultText = buildCodebaseSymbolDefinitionToolResultText(locatorResult);

  expect(resultText).toContain('<symbol_result name="Button" status="ambiguous" location_count="2">');
  expect(resultText).toContain('<symbol_result name="MissingSymbol" status="not_found" location_count="0">');
  expect(resultText).toContain("Use grep or glob to discover candidate names");
});

test("buildCodebaseSymbolDefinitionToolResultText caps large outputs with narrowing guidance", () => {
  const locatorResult: CodebaseSymbolDefinitionLocatorResult = {
    query: { symbolNames: ["symbol0"] },
    symbolLookups: Array.from({ length: 80 }, (_value, symbolIndex) => ({
      requestedSymbolName: `symbol${symbolIndex}`,
      lookupStatus: "resolved",
      locations: [
        {
          filePath: `src/file-${symbolIndex}.ts`,
          symbolName: `symbol${symbolIndex}`,
          symbolKind: "function",
          startLineNumber: 1,
          endLineNumber: 20,
          isExported: true,
          declarationPreview: {
            declarationPreviewText: `export function symbol${symbolIndex}() { ${"output budget ".repeat(120)} }`,
          },
          verificationRead: {
            filePath: `src/file-${symbolIndex}.ts`,
            startLineNumber: 1,
            maximumLineCount: 20,
            reason: `Verify exact definition of symbol${symbolIndex}`,
          },
        },
      ],
    })),
  };

  const resultText = buildCodebaseSymbolDefinitionToolResultText(locatorResult);

  expect(resultText.length).toBeLessThanOrEqual(MAX_CODEBASE_SYMBOL_DEFINITION_TOOL_RESULT_TEXT_LENGTH);
  expect(resultText).toContain("<codebase_symbol_locations_truncation>");
  expect(resultText).toContain("<status>too_broad_incomplete</status>");
  expect(resultText).toContain("cannot support absence or completeness claims");
  expect(resultText).toContain("fewer exact symbolNames");
  expect(resultText).toContain("</codebase_symbol_locations>");
});
