import type {
  CodebaseSymbolDefinitionLocation,
  CodebaseSymbolDefinitionLocatorResult,
  CodebaseSymbolDefinitionLookup,
} from "./codebaseKnowledgeTypes.ts";

export const MAX_CODEBASE_SYMBOL_DEFINITION_TOOL_RESULT_TEXT_LENGTH = 24_000;

export function buildCodebaseSymbolDefinitionToolResultText(
  locatorResult: CodebaseSymbolDefinitionLocatorResult,
): string {
  const resultLines = [
    "<codebase_symbol_locations>",
    `<requested_symbol_names>${escapeXmlText(locatorResult.query.symbolNames.join(", "))}</requested_symbol_names>`,
    `<file_path_filters>${escapeXmlText((locatorResult.query.filePaths ?? []).join(", "))}</file_path_filters>`,
    `<symbol_result_count>${locatorResult.symbolLookups.length}</symbol_result_count>`,
    "<symbol_results>",
  ];

  let appendedSymbolResultCount = 0;
  let omittedSymbolResultCount = 0;
  const appendedSymbolResultLineCounts: number[] = [];
  for (const symbolLookup of locatorResult.symbolLookups) {
    const symbolResultLines = formatSymbolDefinitionLookupLines(symbolLookup);
    const candidateLines = [
      ...resultLines,
      ...symbolResultLines,
      "</symbol_results>",
      ...formatCodebaseSymbolLocationsTrailingLines({ omittedSymbolResultCount: 0 }),
    ];
    if (candidateLines.join("\n").length > MAX_CODEBASE_SYMBOL_DEFINITION_TOOL_RESULT_TEXT_LENGTH) {
      omittedSymbolResultCount = locatorResult.symbolLookups.length - appendedSymbolResultCount;
      break;
    }

    resultLines.push(...symbolResultLines);
    appendedSymbolResultCount += 1;
    appendedSymbolResultLineCounts.push(symbolResultLines.length);
  }

  while (
    appendedSymbolResultCount > 0 &&
    [
      ...resultLines,
      "</symbol_results>",
      ...formatCodebaseSymbolLocationsTrailingLines({ omittedSymbolResultCount }),
    ].join("\n").length > MAX_CODEBASE_SYMBOL_DEFINITION_TOOL_RESULT_TEXT_LENGTH
  ) {
    const removedSymbolResultLineCount = appendedSymbolResultLineCounts.pop();
    if (removedSymbolResultLineCount === undefined) {
      throw new Error("Missing appended codebase symbol result line count.");
    }
    resultLines.splice(resultLines.length - removedSymbolResultLineCount, removedSymbolResultLineCount);
    appendedSymbolResultCount -= 1;
    omittedSymbolResultCount += 1;
  }

  resultLines.push(
    "</symbol_results>",
    ...formatCodebaseSymbolLocationsTrailingLines({ omittedSymbolResultCount }),
  );

  return resultLines.join("\n");
}

function formatSymbolDefinitionLookupLines(symbolLookup: CodebaseSymbolDefinitionLookup): string[] {
  return [
    `<symbol_result name="${escapeXmlAttribute(symbolLookup.requestedSymbolName)}" status="${symbolLookup.lookupStatus}" location_count="${symbolLookup.locations.length}">`,
    ...(symbolLookup.locations.length > 0
      ? symbolLookup.locations.flatMap(formatSymbolDefinitionLocationLines)
      : [
          "<guidance>No exact symbol definition was found. Use grep or glob to discover candidate names, then call locate_codebase_symbols with exact symbolNames.</guidance>",
        ]),
    "</symbol_result>",
  ];
}

function formatSymbolDefinitionLocationLines(location: CodebaseSymbolDefinitionLocation): string[] {
  return [
    `<location file="${escapeXmlAttribute(location.filePath)}" name="${escapeXmlAttribute(location.symbolName)}" kind="${location.symbolKind}" exported="${location.isExported}" lines="${location.startLineNumber}-${location.endLineNumber}">`,
    ...(location.declarationPreview
      ? [`<declaration_preview>${escapeXmlText(location.declarationPreview.declarationPreviewText)}</declaration_preview>`]
      : []),
    ...(location.declarationPreview?.documentationCommentText
      ? [`<documentation_comment>${escapeXmlText(location.declarationPreview.documentationCommentText)}</documentation_comment>`]
      : []),
    `<verification_read file="${escapeXmlAttribute(location.verificationRead.filePath)}" offset_line="${location.verificationRead.startLineNumber}" line_count="${location.verificationRead.maximumLineCount}" reason="${escapeXmlAttribute(location.verificationRead.reason)}" />`,
    "</location>",
  ];
}

function formatCodebaseSymbolLocationsTrailingLines(input: { omittedSymbolResultCount: number }): string[] {
  return [
    ...(input.omittedSymbolResultCount > 0
      ? [
          "<codebase_symbol_locations_truncation>",
          "<status>too_broad_incomplete</status>",
          `<omitted_symbol_result_count>${input.omittedSymbolResultCount}</omitted_symbol_result_count>`,
          "<guidance>This symbol-location result is incomplete/too broad and cannot support absence or completeness claims. Use fewer exact symbolNames or narrower filePaths, then read exact source ranges before relying on indexed locations.</guidance>",
          "</codebase_symbol_locations_truncation>",
        ]
      : []),
    "<verification_note>Read the exact current source ranges with read before relying on these indexed symbol locations.</verification_note>",
    "</codebase_symbol_locations>",
  ];
}

function escapeXmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(text: string): string {
  return escapeXmlText(text).replaceAll('"', "&quot;");
}
