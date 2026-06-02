export type CodebaseEvidenceSourceRange = {
  filePath: string;
  startLineNumber: number;
  endLineNumber: number;
  contentHash: string;
};

export type CodebaseImportDeclaration = {
  moduleSpecifier: string;
  importedSymbolNames: readonly string[];
  isTypeOnly: boolean;
  startLineNumber: number;
  endLineNumber: number;
};

export type CodebaseExportDeclaration = {
  exportedSymbolNames: readonly string[];
  moduleSpecifier?: string | undefined;
  startLineNumber: number;
  endLineNumber: number;
};

export type CodebaseSymbolDeclarationPreview = {
  declarationPreviewText: string;
  documentationCommentText?: string | undefined;
};

export type CodebaseKnowledgeRecordKind = "file" | "symbol";

export type CodebaseSymbolKind = "function" | "class" | "interface" | "type" | "enum" | "variable";

type CodebaseKnowledgeRecordBase = {
  recordId: string;
  recordKind: CodebaseKnowledgeRecordKind;
  title: string;
  summary: string;
  tags: readonly string[];
  evidenceRanges: readonly CodebaseEvidenceSourceRange[];
  updatedAtMs: number;
};

export type CodebaseFileKnowledgeRecord = CodebaseKnowledgeRecordBase & {
  recordKind: "file";
  filePath: string;
  languageId: string;
  importedModuleSpecifiers: readonly string[];
  importDeclarations?: readonly CodebaseImportDeclaration[] | undefined;
  exportedSymbolNames: readonly string[];
  exportDeclarations?: readonly CodebaseExportDeclaration[] | undefined;
  symbolNames: readonly string[];
};

export type CodebaseSymbolKnowledgeRecord = CodebaseKnowledgeRecordBase & {
  recordKind: "symbol";
  filePath: string;
  symbolName: string;
  symbolKind: CodebaseSymbolKind;
  startLineNumber: number;
  endLineNumber: number;
  isExported: boolean;
  declarationPreview?: CodebaseSymbolDeclarationPreview | undefined;
};

export type CodebaseKnowledgeRecord =
  | CodebaseFileKnowledgeRecord
  | CodebaseSymbolKnowledgeRecord;

export type CodebaseSymbolDefinitionLocatorQuery = {
  symbolNames: readonly string[];
  filePaths?: readonly string[] | undefined;
};

export type CodebaseSymbolDefinitionVerificationRead = {
  filePath: string;
  startLineNumber: number;
  maximumLineCount: number;
  reason: string;
};

export type CodebaseSymbolDefinitionLocation = {
  filePath: string;
  symbolName: string;
  symbolKind: CodebaseSymbolKind;
  startLineNumber: number;
  endLineNumber: number;
  isExported: boolean;
  declarationPreview?: CodebaseSymbolDeclarationPreview | undefined;
  verificationRead: CodebaseSymbolDefinitionVerificationRead;
};

export type CodebaseSymbolDefinitionLookupStatus = "resolved" | "not_found" | "ambiguous";

export type CodebaseSymbolDefinitionLookup = {
  requestedSymbolName: string;
  lookupStatus: CodebaseSymbolDefinitionLookupStatus;
  locations: readonly CodebaseSymbolDefinitionLocation[];
};

export type CodebaseSymbolDefinitionLocatorResult = {
  query: CodebaseSymbolDefinitionLocatorQuery;
  symbolLookups: readonly CodebaseSymbolDefinitionLookup[];
};

export type CodebaseIndexedFileMetadata = {
  filePath: string;
  languageId: string;
  sourceFileSizeBytes: number;
  sourceFileModifiedAtMs: number;
  contentHash: string;
  indexedAtMs: number;
  recordIds: readonly string[];
  structureMapVersion?: number | undefined;
};

export type CodebaseKnowledgeRepositorySnapshot = {
  records: readonly CodebaseKnowledgeRecord[];
  indexedFiles: readonly CodebaseIndexedFileMetadata[];
};

export type CodebaseKnowledgeRepositoryStartupMetadata = {
  indexedFiles: readonly CodebaseIndexedFileMetadata[];
};

export type CodebaseKnowledgeRepository = {
  upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void>;
  replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void>;
  replaceFileRecords(input: {
    filePath: string;
    records: readonly CodebaseKnowledgeRecord[];
    indexedFileMetadata?: CodebaseIndexedFileMetadata | undefined;
  }): Promise<void>;
  removeFileRecords(filePath: string): Promise<void>;
  readStartupMetadata(): Promise<CodebaseKnowledgeRepositoryStartupMetadata>;
  replaceStartupMetadata(startupMetadata: CodebaseKnowledgeRepositoryStartupMetadata): Promise<void>;
  readSnapshot(): Promise<CodebaseKnowledgeRepositorySnapshot>;
  replaceSnapshot(snapshot: CodebaseKnowledgeRepositorySnapshot): Promise<void>;
  locateSymbolDefinitions(query: CodebaseSymbolDefinitionLocatorQuery): Promise<CodebaseSymbolDefinitionLocatorResult>;
  listRecords(): Promise<readonly CodebaseKnowledgeRecord[]>;
};

export type CodebaseStructureSymbolRecord = {
  symbolName: string;
  symbolKind: CodebaseSymbolKind;
  startLineNumber: number;
  endLineNumber: number;
  isExported: boolean;
  declarationPreview?: CodebaseSymbolDeclarationPreview | undefined;
};

export type CodebaseStructureFileRecord = {
  filePath: string;
  languageId: string;
  contentHash: string;
  hasSyntaxError: boolean;
  importedModuleSpecifiers: readonly string[];
  importDeclarations: readonly CodebaseImportDeclaration[];
  exportedSymbolNames: readonly string[];
  exportDeclarations: readonly CodebaseExportDeclaration[];
  symbols: readonly CodebaseStructureSymbolRecord[];
  knowledgeRecords: readonly CodebaseKnowledgeRecord[];
};

export type CodebaseStructureIndexer = {
  indexFile(input: { filePath: string; fileText: string; indexedAtMs?: number | undefined }): Promise<CodebaseStructureFileRecord>;
};
