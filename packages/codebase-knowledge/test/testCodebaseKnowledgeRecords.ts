import type {
  CodebaseExportDeclaration,
  CodebaseImportDeclaration,
  CodebaseKnowledgeRecord,
  CodebaseSymbolDeclarationPreview,
  CodebaseSymbolKnowledgeRecord,
} from "../src/index.ts";

export function createTestSymbolKnowledgeRecord(input: {
  recordId: string;
  filePath: string;
  symbolName: string;
  title?: string | undefined;
  summary?: string | undefined;
  tags?: readonly string[] | undefined;
  declarationPreview?: CodebaseSymbolDeclarationPreview | undefined;
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
      },
    ],
    updatedAtMs: 100,
    filePath: input.filePath,
    symbolName: input.symbolName,
    symbolKind: "function",
    startLineNumber: 10,
    endLineNumber: 20,
    isExported: true,
    ...(input.declarationPreview ? { declarationPreview: input.declarationPreview } : {}),
  };
}

export function createTestFileKnowledgeRecord(input: {
  recordId: string;
  filePath: string;
  symbolNames?: readonly string[] | undefined;
  importDeclarations?: readonly CodebaseImportDeclaration[] | undefined;
  exportDeclarations?: readonly CodebaseExportDeclaration[] | undefined;
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
      },
    ],
    updatedAtMs: 100,
    filePath: input.filePath,
    languageId: "typescript",
    importedModuleSpecifiers: [],
    exportedSymbolNames: input.symbolNames ?? [],
    symbolNames: input.symbolNames ?? [],
    ...(input.importDeclarations ? { importDeclarations: input.importDeclarations } : {}),
    ...(input.exportDeclarations ? { exportDeclarations: input.exportDeclarations } : {}),
  };
}
