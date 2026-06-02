import { expect, test } from "bun:test";
import { locateCodebaseSymbolDefinitions } from "../src/locateCodebaseSymbolDefinitions.ts";
import { createTestFileKnowledgeRecord, createTestSymbolKnowledgeRecord } from "./testCodebaseKnowledgeRecords.ts";

test("locateCodebaseSymbolDefinitions returns only exact case-sensitive symbol definitions", () => {
  const result = locateCodebaseSymbolDefinitions({
    query: { symbolNames: ["handleRequest"] },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:substring",
        filePath: "src/retry.ts",
        symbolName: "handleRequestRetry",
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:case-mismatch",
        filePath: "src/lower.ts",
        symbolName: "handlerequest",
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:exact",
        filePath: "src/request.ts",
        symbolName: "handleRequest",
        startLineNumber: 42,
        endLineNumber: 55,
      }),
    ],
  });

  expect(result.symbolLookups).toEqual([
    {
      requestedSymbolName: "handleRequest",
      lookupStatus: "resolved",
      locations: [
        expect.objectContaining({
          filePath: "src/request.ts",
          symbolName: "handleRequest",
          startLineNumber: 42,
          endLineNumber: 55,
          verificationRead: {
            filePath: "src/request.ts",
            startLineNumber: 42,
            maximumLineCount: 14,
            reason: "Verify exact definition of handleRequest",
          },
        }),
      ],
    },
  ]);
});

test("locateCodebaseSymbolDefinitions ignores file/import/export records that only mention the symbol", () => {
  const result = locateCodebaseSymbolDefinitions({
    query: { symbolNames: ["handleRequest"] },
    records: [
      createTestFileKnowledgeRecord({
        recordId: "file:mentions",
        filePath: "src/mentions.ts",
        symbolNames: ["handleRequest"],
        importDeclarations: [
          {
            moduleSpecifier: "./request",
            importedSymbolNames: ["handleRequest"],
            isTypeOnly: false,
            startLineNumber: 1,
            endLineNumber: 1,
          },
        ],
        exportDeclarations: [
          {
            exportedSymbolNames: ["handleRequest"],
            startLineNumber: 3,
            endLineNumber: 3,
          },
        ],
      }),
    ],
  });

  expect(result.symbolLookups).toEqual([
    {
      requestedSymbolName: "handleRequest",
      lookupStatus: "not_found",
      locations: [],
    },
  ]);
});

test("locateCodebaseSymbolDefinitions uses filePaths only as exact file filters", () => {
  const result = locateCodebaseSymbolDefinitions({
    query: {
      symbolNames: ["createRuntime"],
      filePaths: ["./src/runtime.ts"],
    },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:runtime",
        filePath: "src/runtime.ts",
        symbolName: "createRuntime",
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:test-runtime",
        filePath: "src/runtime.test.ts",
        symbolName: "createRuntime",
      }),
    ],
  });

  expect(result.symbolLookups[0]?.lookupStatus).toBe("resolved");
  expect(result.symbolLookups[0]?.locations.map((location) => location.filePath)).toEqual(["src/runtime.ts"]);
});

test("locateCodebaseSymbolDefinitions returns all duplicate exact definitions as ambiguous in deterministic order", () => {
  const result = locateCodebaseSymbolDefinitions({
    query: { symbolNames: ["Button"] },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:b",
        filePath: "src/ui/Button.tsx",
        symbolName: "Button",
        symbolKind: "function",
        startLineNumber: 20,
        endLineNumber: 40,
      }),
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:a",
        filePath: "src/design/Button.tsx",
        symbolName: "Button",
        symbolKind: "function",
        startLineNumber: 5,
        endLineNumber: 18,
      }),
    ],
  });

  expect(result.symbolLookups[0]?.lookupStatus).toBe("ambiguous");
  expect(result.symbolLookups[0]?.locations.map((location) => `${location.filePath}:${location.startLineNumber}-${location.endLineNumber}`)).toEqual([
    "src/design/Button.tsx:5-18",
    "src/ui/Button.tsx:20-40",
  ]);
});

test("locateCodebaseSymbolDefinitions preserves requested symbol order with not_found results", () => {
  const result = locateCodebaseSymbolDefinitions({
    query: { symbolNames: ["MissingSymbol", "ExistingSymbol"] },
    records: [
      createTestSymbolKnowledgeRecord({
        recordId: "symbol:existing",
        filePath: "src/existing.ts",
        symbolName: "ExistingSymbol",
      }),
    ],
  });

  expect(result.symbolLookups.map((symbolLookup) => symbolLookup.requestedSymbolName)).toEqual([
    "MissingSymbol",
    "ExistingSymbol",
  ]);
  expect(result.symbolLookups.map((symbolLookup) => symbolLookup.lookupStatus)).toEqual(["not_found", "resolved"]);
});
