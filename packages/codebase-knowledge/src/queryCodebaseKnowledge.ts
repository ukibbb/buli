import type {
  CodebaseEvidenceSourceRange,
  CodebaseKnowledgeQuery,
  CodebaseKnowledgeQueryMatch,
  CodebaseKnowledgeQueryResult,
  CodebaseKnowledgeRecord,
  CodebaseKnowledgeRecommendedRead,
} from "./codebaseKnowledgeTypes.ts";

const DEFAULT_MAXIMUM_RESULT_COUNT = 8;
const MAXIMUM_RECOMMENDED_READS_PER_RECORD = 3;

export function queryCodebaseKnowledgeRecords(input: {
  query: CodebaseKnowledgeQuery;
  records: readonly CodebaseKnowledgeRecord[];
}): CodebaseKnowledgeQueryResult {
  const hasInputs = (input.query.symbolNames?.length ?? 0) > 0 || (input.query.filePaths?.length ?? 0) > 0;
  const scoredMatches = hasInputs
    ? input.records
        .map((record) => scoreCodebaseKnowledgeRecord({ query: input.query, record }))
        .filter((match) => match.score > 0)
        .sort((leftMatch, rightMatch) =>
          rightMatch.score !== leftMatch.score
            ? rightMatch.score - leftMatch.score
            : leftMatch.record.title.localeCompare(rightMatch.record.title),
        )
    : [];

  return {
    query: input.query,
    matches: scoredMatches.slice(0, input.query.maximumResultCount ?? DEFAULT_MAXIMUM_RESULT_COUNT),
  };
}

function scoreCodebaseKnowledgeRecord(input: {
  query: CodebaseKnowledgeQuery;
  record: CodebaseKnowledgeRecord;
}): CodebaseKnowledgeQueryMatch {
  const matchReasons: string[] = [];
  let score = 0;

  for (const symbolName of input.query.symbolNames ?? []) {
    const symbolNameMatchScore = scoreKnownRelevantSymbolName({ knownRelevantSymbolName: symbolName, record: input.record });
    if (symbolNameMatchScore > 0) {
      score += symbolNameMatchScore;
      matchReasons.push(`matched symbol ${symbolName}`);
    }
  }

  for (const filePath of input.query.filePaths ?? []) {
    const filePathMatchScore = scoreKnownRelevantFilePath({ knownRelevantFilePath: filePath, record: input.record });
    if (filePathMatchScore > 0) {
      score += filePathMatchScore;
      matchReasons.push(`matched file path ${filePath}`);
    }
  }

  return {
    record: input.record,
    score,
    matchReasons,
    recommendedReads: buildRecommendedReads(input.record),
  };
}

// Exact symbol match must outrank an exact file-path match so a grepped symbol name
// resolves to its own definition ahead of the file that merely contains it.
function scoreKnownRelevantSymbolName(input: { knownRelevantSymbolName: string; record: CodebaseKnowledgeRecord }): number {
  const normalizedKnownSymbolName = normalizeToken(input.knownRelevantSymbolName);
  if (!normalizedKnownSymbolName) {
    return 0;
  }

  const referencedSymbolNames = listRecordReferencedSymbolNames(input.record).map(normalizeToken);
  if (referencedSymbolNames.some((symbolName) => symbolName === normalizedKnownSymbolName)) {
    return 100;
  }
  if (referencedSymbolNames.some((symbolName) => symbolName.includes(normalizedKnownSymbolName))) {
    return 35;
  }
  return 0;
}

function scoreKnownRelevantFilePath(input: { knownRelevantFilePath: string; record: CodebaseKnowledgeRecord }): number {
  const normalizedKnownFilePath = normalizePathForMatching(input.knownRelevantFilePath);
  if (!normalizedKnownFilePath) {
    return 0;
  }

  const referencedFilePaths = listRecordReferencedFilePaths(input.record).map(normalizePathForMatching);
  if (referencedFilePaths.some((filePath) => filePath === normalizedKnownFilePath)) {
    return 90;
  }
  if (referencedFilePaths.some((filePath) => filePath.includes(normalizedKnownFilePath) || normalizedKnownFilePath.includes(filePath))) {
    return 40;
  }
  return 0;
}

function listRecordReferencedFilePaths(record: CodebaseKnowledgeRecord): readonly string[] {
  return [record.filePath, ...record.evidenceRanges.map((evidenceRange) => evidenceRange.filePath)];
}

function listRecordReferencedSymbolNames(record: CodebaseKnowledgeRecord): readonly string[] {
  switch (record.recordKind) {
    case "file":
      return [
        ...record.symbolNames,
        ...(record.importDeclarations ?? []).flatMap((importDeclaration) => importDeclaration.importedSymbolNames),
        ...(record.exportDeclarations ?? []).flatMap((exportDeclaration) => exportDeclaration.exportedSymbolNames),
      ];
    case "symbol":
      return [record.symbolName];
  }
}

function buildRecommendedReads(record: CodebaseKnowledgeRecord): readonly CodebaseKnowledgeRecommendedRead[] {
  return deduplicateEvidenceRanges(record.evidenceRanges)
    .slice(0, MAXIMUM_RECOMMENDED_READS_PER_RECORD)
    .map((evidenceRange) => ({
      filePath: evidenceRange.filePath,
      startLineNumber: evidenceRange.startLineNumber,
      maximumLineCount: evidenceRange.endLineNumber - evidenceRange.startLineNumber + 1,
      reason: `Verify ${record.title}`,
    }));
}

function deduplicateEvidenceRanges(evidenceRanges: readonly CodebaseEvidenceSourceRange[]): readonly CodebaseEvidenceSourceRange[] {
  const seenEvidenceRangeKeys = new Set<string>();
  const uniqueEvidenceRanges: CodebaseEvidenceSourceRange[] = [];

  for (const evidenceRange of evidenceRanges) {
    const evidenceRangeKey = `${evidenceRange.filePath}:${evidenceRange.startLineNumber}:${evidenceRange.endLineNumber}`;
    if (seenEvidenceRangeKeys.has(evidenceRangeKey)) {
      continue;
    }
    seenEvidenceRangeKeys.add(evidenceRangeKey);
    uniqueEvidenceRanges.push(evidenceRange);
  }

  return uniqueEvidenceRanges;
}

function normalizeToken(text: string): string {
  return text.trim().toLowerCase();
}

function normalizePathForMatching(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}
