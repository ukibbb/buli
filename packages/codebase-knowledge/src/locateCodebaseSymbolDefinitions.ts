import type {
  CodebaseKnowledgeRecord,
  CodebaseSymbolDefinitionLocation,
  CodebaseSymbolDefinitionLocatorQuery,
  CodebaseSymbolDefinitionLocatorResult,
  CodebaseSymbolDefinitionLookup,
  CodebaseSymbolKnowledgeRecord,
} from "./codebaseKnowledgeTypes.ts";

export function locateCodebaseSymbolDefinitions(input: {
  query: CodebaseSymbolDefinitionLocatorQuery;
  records: readonly CodebaseKnowledgeRecord[];
}): CodebaseSymbolDefinitionLocatorResult {
  const matchingSymbolRecords = input.records
    .filter((record): record is CodebaseSymbolKnowledgeRecord => record.recordKind === "symbol")
    .filter((symbolRecord) => isSymbolRecordInsideRequestedFiles({ symbolRecord, query: input.query }));

  return {
    query: input.query,
    symbolLookups: input.query.symbolNames.map((requestedSymbolName) =>
      locateRequestedSymbolDefinition({ requestedSymbolName, matchingSymbolRecords })
    ),
  };
}

function locateRequestedSymbolDefinition(input: {
  requestedSymbolName: string;
  matchingSymbolRecords: readonly CodebaseSymbolKnowledgeRecord[];
}): CodebaseSymbolDefinitionLookup {
  const locations = input.matchingSymbolRecords
    .filter((symbolRecord) => symbolRecord.symbolName === input.requestedSymbolName)
    .map(createSymbolDefinitionLocation)
    .sort(compareSymbolDefinitionLocations);

  return {
    requestedSymbolName: input.requestedSymbolName,
    lookupStatus: resolveLookupStatus(locations.length),
    locations,
  };
}

function isSymbolRecordInsideRequestedFiles(input: {
  symbolRecord: CodebaseSymbolKnowledgeRecord;
  query: CodebaseSymbolDefinitionLocatorQuery;
}): boolean {
  if (!input.query.filePaths || input.query.filePaths.length === 0) {
    return true;
  }

  const requestedFilePathKeys = new Set(input.query.filePaths.map(normalizeFilePathForComparison));
  return requestedFilePathKeys.has(normalizeFilePathForComparison(input.symbolRecord.filePath));
}

function createSymbolDefinitionLocation(
  symbolRecord: CodebaseSymbolKnowledgeRecord,
): CodebaseSymbolDefinitionLocation {
  return {
    filePath: symbolRecord.filePath,
    symbolName: symbolRecord.symbolName,
    symbolKind: symbolRecord.symbolKind,
    startLineNumber: symbolRecord.startLineNumber,
    endLineNumber: symbolRecord.endLineNumber,
    isExported: symbolRecord.isExported,
    ...(symbolRecord.declarationPreview ? { declarationPreview: symbolRecord.declarationPreview } : {}),
    verificationRead: {
      filePath: symbolRecord.filePath,
      startLineNumber: symbolRecord.startLineNumber,
      maximumLineCount: symbolRecord.endLineNumber - symbolRecord.startLineNumber + 1,
      reason: `Verify exact definition of ${symbolRecord.symbolName}`,
    },
  };
}

function resolveLookupStatus(locationCount: number): CodebaseSymbolDefinitionLookup["lookupStatus"] {
  if (locationCount === 0) {
    return "not_found";
  }
  if (locationCount === 1) {
    return "resolved";
  }
  return "ambiguous";
}

function compareSymbolDefinitionLocations(
  leftLocation: CodebaseSymbolDefinitionLocation,
  rightLocation: CodebaseSymbolDefinitionLocation,
): number {
  return leftLocation.filePath.localeCompare(rightLocation.filePath) ||
    leftLocation.startLineNumber - rightLocation.startLineNumber ||
    leftLocation.endLineNumber - rightLocation.endLineNumber ||
    leftLocation.symbolKind.localeCompare(rightLocation.symbolKind) ||
    compareExportedFirst(leftLocation.isExported, rightLocation.isExported);
}

function compareExportedFirst(leftIsExported: boolean, rightIsExported: boolean): number {
  if (leftIsExported === rightIsExported) {
    return 0;
  }

  return leftIsExported ? -1 : 1;
}

function normalizeFilePathForComparison(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}
