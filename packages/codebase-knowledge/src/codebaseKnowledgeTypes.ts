export type CodebaseKnowledgeFreshness = "fresh" | "stale";

export type CodebaseEvidenceSourceKind = "tree_sitter_structure" | "agent_verified_summary" | "tool_observation";

export type CodebaseEvidenceSourceRange = {
  filePath: string;
  startLineNumber: number;
  endLineNumber: number;
  contentHash: string;
  sourceKind: CodebaseEvidenceSourceKind;
};

export type CodebaseKnowledgeRecordKind = "file" | "symbol" | "flow" | "concept";

export type CodebaseSymbolKind = "function" | "class" | "interface" | "type" | "enum" | "variable";

type CodebaseKnowledgeRecordBase = {
  recordId: string;
  recordKind: CodebaseKnowledgeRecordKind;
  title: string;
  summary: string;
  tags: readonly string[];
  evidenceRanges: readonly CodebaseEvidenceSourceRange[];
  freshness: CodebaseKnowledgeFreshness;
  updatedAtMs: number;
};

export type CodebaseFileKnowledgeRecord = CodebaseKnowledgeRecordBase & {
  recordKind: "file";
  filePath: string;
  languageId: string;
  importedModuleSpecifiers: readonly string[];
  exportedSymbolNames: readonly string[];
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
};

export type CodebaseFlowKnowledgeRecord = CodebaseKnowledgeRecordBase & {
  recordKind: "flow";
  flowName: string;
  involvedFilePaths: readonly string[];
  involvedSymbolNames: readonly string[];
};

export type CodebaseConceptKnowledgeRecord = CodebaseKnowledgeRecordBase & {
  recordKind: "concept";
  conceptName: string;
  relatedFilePaths: readonly string[];
  relatedSymbolNames: readonly string[];
};

export type CodebaseKnowledgeRecord =
  | CodebaseFileKnowledgeRecord
  | CodebaseSymbolKnowledgeRecord
  | CodebaseFlowKnowledgeRecord
  | CodebaseConceptKnowledgeRecord;

export type CodebaseKnowledgeQuery = {
  codebaseProblemDescription: string;
  knownRelevantFilePaths?: readonly string[] | undefined;
  knownRelevantSymbolNames?: readonly string[] | undefined;
  maximumKnowledgeResultCount?: number | undefined;
};

export type CodebaseKnowledgeRecommendedRead = {
  filePath: string;
  startLineNumber: number;
  maximumLineCount: number;
  reason: string;
};

export type CodebaseKnowledgeQueryMatch = {
  record: CodebaseKnowledgeRecord;
  score: number;
  matchReasons: readonly string[];
  recommendedReads: readonly CodebaseKnowledgeRecommendedRead[];
};

export type CodebaseKnowledgeQueryResult = {
  query: CodebaseKnowledgeQuery;
  matches: readonly CodebaseKnowledgeQueryMatch[];
};

export type CodebaseKnowledgeRepository = {
  upsertRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void>;
  replaceAllRecords(records: readonly CodebaseKnowledgeRecord[]): Promise<void>;
  replaceFileRecords(input: { filePath: string; records: readonly CodebaseKnowledgeRecord[] }): Promise<void>;
  markFilePathStale(filePath: string): Promise<void>;
  queryRecords(query: CodebaseKnowledgeQuery): Promise<CodebaseKnowledgeQueryResult>;
  listRecords(): Promise<readonly CodebaseKnowledgeRecord[]>;
};

export type CodebaseStructureSymbolRecord = {
  symbolName: string;
  symbolKind: CodebaseSymbolKind;
  startLineNumber: number;
  endLineNumber: number;
  isExported: boolean;
};

export type CodebaseStructureFileRecord = {
  filePath: string;
  languageId: string;
  contentHash: string;
  hasSyntaxError: boolean;
  importedModuleSpecifiers: readonly string[];
  exportedSymbolNames: readonly string[];
  symbols: readonly CodebaseStructureSymbolRecord[];
  knowledgeRecords: readonly CodebaseKnowledgeRecord[];
};

export type CodebaseStructureIndexer = {
  indexFile(input: { filePath: string; fileText: string; indexedAtMs?: number | undefined }): Promise<CodebaseStructureFileRecord>;
};
