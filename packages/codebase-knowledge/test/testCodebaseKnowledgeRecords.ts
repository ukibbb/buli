import type {
  CodebaseExportDeclaration,
  CodebaseImportDeclaration,
  CodebaseKnowledgeRecord,
  CodebaseSymbolDeclarationPreview,
  CodebaseSymbolKind,
  CodebaseSymbolKnowledgeRecord,
} from "../src/index.ts";

export function createTestSymbolKnowledgeRecord(input: {
  recordId: string;
  filePath: string;
  symbolName: string;
  symbolKind?: CodebaseSymbolKind | undefined;
  startLineNumber?: number | undefined;
  endLineNumber?: number | undefined;
  isExported?: boolean | undefined;
  title?: string | undefined;
  summary?: string | undefined;
  tags?: readonly string[] | undefined;
  declarationPreview?: CodebaseSymbolDeclarationPreview | undefined;
}): CodebaseSymbolKnowledgeRecord {
  const startLineNumber = input.startLineNumber ?? 10;
  const endLineNumber = input.endLineNumber ?? 20;
  const symbolKind = input.symbolKind ?? "function";
  return {
    recordId: input.recordId,
    recordKind: "symbol",
    title: input.title ?? `${input.symbolName} (${symbolKind})`,
    summary: input.summary ?? `Defines ${symbolKind} ${input.symbolName} in ${input.filePath}.`,
    tags: input.tags ?? [],
    evidenceRanges: [
      {
        filePath: input.filePath,
        startLineNumber,
        endLineNumber,
        contentHash: "hash-1",
      },
    ],
    updatedAtMs: 100,
    filePath: input.filePath,
    symbolName: input.symbolName,
    symbolKind,
    startLineNumber,
    endLineNumber,
    isExported: input.isExported ?? true,
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
