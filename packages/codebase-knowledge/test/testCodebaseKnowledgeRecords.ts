import type { CodebaseKnowledgeRecord, CodebaseSymbolKnowledgeRecord } from "../src/index.ts";

export function createTestSymbolKnowledgeRecord(input: {
  recordId: string;
  filePath: string;
  symbolName: string;
  title?: string | undefined;
  summary?: string | undefined;
  tags?: readonly string[] | undefined;
  freshness?: "fresh" | "stale" | undefined;
}): CodebaseSymbolKnowledgeRecord {
  return {
    recordId: input.recordId,
    recordKind: "symbol",
    title: input.title ?? `${input.symbolName} (function)`,
    summary: input.summary ?? `Defines function ${input.symbolName} in ${input.filePath}.`,
    tags: input.tags ?? [],
    evidenceRanges: [
      {
        filePath: input.filePath,
        startLineNumber: 10,
        endLineNumber: 20,
        contentHash: "hash-1",
        sourceKind: "tree_sitter_structure",
      },
    ],
    freshness: input.freshness ?? "fresh",
    updatedAtMs: 100,
    filePath: input.filePath,
    symbolName: input.symbolName,
    symbolKind: "function",
    startLineNumber: 10,
    endLineNumber: 20,
    isExported: true,
  };
}

export function createTestFileKnowledgeRecord(input: {
  recordId: string;
  filePath: string;
  symbolNames?: readonly string[] | undefined;
}): CodebaseKnowledgeRecord {
  return {
    recordId: input.recordId,
    recordKind: "file",
    title: input.filePath,
    summary: `File ${input.filePath} defines ${(input.symbolNames ?? []).join(", ")}.`,
    tags: [input.filePath, ...(input.symbolNames ?? [])],
    evidenceRanges: [
      {
        filePath: input.filePath,
        startLineNumber: 1,
        endLineNumber: 50,
        contentHash: "hash-file",
        sourceKind: "tree_sitter_structure",
      },
    ],
    freshness: "fresh",
    updatedAtMs: 100,
    filePath: input.filePath,
    languageId: "typescript",
    importedModuleSpecifiers: [],
    exportedSymbolNames: input.symbolNames ?? [],
    symbolNames: input.symbolNames ?? [],
  };
}
