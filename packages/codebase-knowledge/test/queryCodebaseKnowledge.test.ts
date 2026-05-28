import { expect, test } from "bun:test";
import { queryCodebaseKnowledgeRecords } from "../src/queryCodebaseKnowledge.ts";
import type { CodebaseSymbolKnowledgeRecord } from "../src/codebaseKnowledgeTypes.ts";

function symbolRecord(overrides: Partial<CodebaseSymbolKnowledgeRecord>): CodebaseSymbolKnowledgeRecord {
  return {
    recordId: "r1",
    recordKind: "symbol",
    title: "someSymbol",
    summary: "",
    tags: [],
    evidenceRanges: [],
    updatedAtMs: 0,
    filePath: "packages/x/src/a.ts",
    symbolName: "someSymbol",
    symbolKind: "function",
    startLineNumber: 142,
    endLineNumber: 187,
    isExported: true,
    ...overrides,
  };
}

test("exact symbol-name match ranks above substring match", () => {
  const exact = symbolRecord({ recordId: "exact", symbolName: "handleRequest" });
  const substring = symbolRecord({ recordId: "sub", symbolName: "handleRequestRetry" });
  const result = queryCodebaseKnowledgeRecords({
    query: { symbolNames: ["handleRequest"] },
    records: [substring, exact],
  });
  expect(result.matches[0]?.record.recordId).toBe("exact");
});

test("file path match returns the file record", () => {
  const symbol = symbolRecord({ recordId: "s", filePath: "packages/x/src/a.ts" });
  const result = queryCodebaseKnowledgeRecords({
    query: { filePaths: ["packages/x/src/a.ts"] },
    records: [symbol],
  });
  expect(result.matches.map((m) => m.record.recordId)).toContain("s");
});

test("no inputs returns no matches", () => {
  const result = queryCodebaseKnowledgeRecords({ query: {}, records: [symbolRecord({})] });
  expect(result.matches).toHaveLength(0);
});
