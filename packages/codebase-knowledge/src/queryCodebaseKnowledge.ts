import type {
  CodebaseEvidenceSourceRange,
  CodebaseKnowledgeQuery,
  CodebaseKnowledgeQueryMatch,
  CodebaseKnowledgeQueryResult,
  CodebaseKnowledgeRecord,
  CodebaseKnowledgeRecommendedRead,
} from "./codebaseKnowledgeTypes.ts";

const DEFAULT_MAXIMUM_KNOWLEDGE_RESULT_COUNT = 8;
const MAXIMUM_RECOMMENDED_READS_PER_RECORD = 3;

export function queryCodebaseKnowledgeRecords(input: {
  query: CodebaseKnowledgeQuery;
  records: readonly CodebaseKnowledgeRecord[];
}): CodebaseKnowledgeQueryResult {
  const scoredMatches = input.records
    .map((record) => scoreCodebaseKnowledgeRecord({ query: input.query, record }))
    .filter((match) => match.score > 0)
    .sort((leftMatch, rightMatch) => {
      if (rightMatch.score !== leftMatch.score) {
        return rightMatch.score - leftMatch.score;
      }
      return leftMatch.record.title.localeCompare(rightMatch.record.title);
    });

  return {
    query: input.query,
    matches: scoredMatches.slice(0, input.query.maximumKnowledgeResultCount ?? DEFAULT_MAXIMUM_KNOWLEDGE_RESULT_COUNT),
  };
}

function scoreCodebaseKnowledgeRecord(input: {
  query: CodebaseKnowledgeQuery;
  record: CodebaseKnowledgeRecord;
}): CodebaseKnowledgeQueryMatch {
  const matchReasons: string[] = [];
  let score = 0;

  const queryTokens = tokenizeSearchText(input.query.codebaseProblemDescription);
  const recordSearchTokens = tokenizeSearchText(buildRecordSearchText(input.record));
  const tokenOverlapCount = countTokenOverlap(queryTokens, recordSearchTokens);
  if (tokenOverlapCount > 0) {
    score += tokenOverlapCount * 10;
    matchReasons.push(`matched ${tokenOverlapCount} query token${tokenOverlapCount === 1 ? "" : "s"}`);
  }

  for (const knownRelevantFilePath of input.query.knownRelevantFilePaths ?? []) {
    const filePathMatchScore = scoreKnownRelevantFilePath({ knownRelevantFilePath, record: input.record });
    if (filePathMatchScore > 0) {
      score += filePathMatchScore;
      matchReasons.push(`matched file path ${knownRelevantFilePath}`);
    }
  }

  for (const knownRelevantSymbolName of input.query.knownRelevantSymbolNames ?? []) {
    const symbolNameMatchScore = scoreKnownRelevantSymbolName({ knownRelevantSymbolName, record: input.record });
    if (symbolNameMatchScore > 0) {
      score += symbolNameMatchScore;
      matchReasons.push(`matched symbol ${knownRelevantSymbolName}`);
    }
  }

  if (score > 0 && input.record.freshness === "fresh") {
    score += 3;
  }
  if (score > 0 && input.record.freshness === "stale") {
    score -= 20;
    matchReasons.push("record is stale; verify current source before relying on it");
  }

  return {
    record: input.record,
    score: Math.max(0, score),
    matchReasons,
    recommendedReads: buildRecommendedReads(input.record),
  };
}

function scoreKnownRelevantFilePath(input: { knownRelevantFilePath: string; record: CodebaseKnowledgeRecord }): number {
  const normalizedKnownFilePath = normalizePathForMatching(input.knownRelevantFilePath);
  if (!normalizedKnownFilePath) {
    return 0;
  }

  const referencedFilePaths = listRecordReferencedFilePaths(input.record).map(normalizePathForMatching);
  if (referencedFilePaths.some((filePath) => filePath === normalizedKnownFilePath)) {
    return 100;
  }
  if (referencedFilePaths.some((filePath) => filePath.includes(normalizedKnownFilePath) || normalizedKnownFilePath.includes(filePath))) {
    return 40;
  }
  return 0;
}

function scoreKnownRelevantSymbolName(input: { knownRelevantSymbolName: string; record: CodebaseKnowledgeRecord }): number {
  const normalizedKnownSymbolName = normalizeToken(input.knownRelevantSymbolName);
  if (!normalizedKnownSymbolName) {
    return 0;
  }

  const referencedSymbolNames = listRecordReferencedSymbolNames(input.record).map(normalizeToken);
  if (referencedSymbolNames.some((symbolName) => symbolName === normalizedKnownSymbolName)) {
    return 90;
  }
  if (referencedSymbolNames.some((symbolName) => symbolName.includes(normalizedKnownSymbolName))) {
    return 35;
  }
  return 0;
}

function buildRecordSearchText(record: CodebaseKnowledgeRecord): string {
  const commonText = [record.title, record.summary, record.tags.join(" "), record.recordKind].join(" ");
  switch (record.recordKind) {
    case "file":
      return [
        commonText,
        record.filePath,
        record.languageId,
        record.importedModuleSpecifiers.join(" "),
        record.exportedSymbolNames.join(" "),
        record.symbolNames.join(" "),
      ].join(" ");
    case "symbol":
      return [commonText, record.filePath, record.symbolName, record.symbolKind, record.isExported ? "exported" : "local"].join(" ");
    case "flow":
      return [commonText, record.flowName, record.involvedFilePaths.join(" "), record.involvedSymbolNames.join(" ")].join(" ");
    case "concept":
      return [commonText, record.conceptName, record.relatedFilePaths.join(" "), record.relatedSymbolNames.join(" ")].join(" ");
  }
}

function listRecordReferencedFilePaths(record: CodebaseKnowledgeRecord): readonly string[] {
  const evidenceFilePaths = record.evidenceRanges.map((evidenceRange) => evidenceRange.filePath);
  switch (record.recordKind) {
    case "file":
      return [record.filePath, ...evidenceFilePaths];
    case "symbol":
      return [record.filePath, ...evidenceFilePaths];
    case "flow":
      return [...record.involvedFilePaths, ...evidenceFilePaths];
    case "concept":
      return [...record.relatedFilePaths, ...evidenceFilePaths];
  }
}

function listRecordReferencedSymbolNames(record: CodebaseKnowledgeRecord): readonly string[] {
  switch (record.recordKind) {
    case "file":
      return record.symbolNames;
    case "symbol":
      return [record.symbolName];
    case "flow":
      return record.involvedSymbolNames;
    case "concept":
      return record.relatedSymbolNames;
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

function countTokenOverlap(leftTokens: readonly string[], rightTokens: readonly string[]): number {
  const rightTokenSet = new Set(rightTokens);
  let tokenOverlapCount = 0;
  for (const leftToken of new Set(leftTokens)) {
    if (rightTokenSet.has(leftToken)) {
      tokenOverlapCount += 1;
    }
  }
  return tokenOverlapCount;
}

function tokenizeSearchText(text: string): readonly string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9_./-]+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 2);
}

function normalizeToken(text: string): string {
  return text.trim().toLowerCase();
}

function normalizePathForMatching(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}
