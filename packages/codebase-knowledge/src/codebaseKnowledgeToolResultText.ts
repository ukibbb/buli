import type { CodebaseKnowledgeQueryResult, CodebaseKnowledgeRecord } from "./codebaseKnowledgeTypes.ts";

export const MAX_CODEBASE_KNOWLEDGE_TOOL_RESULT_TEXT_LENGTH = 24_000;

const MAX_CODEBASE_KNOWLEDGE_MATCH_SUMMARY_LENGTH = 900;
const MAX_EVIDENCE_RANGES_PER_MATCH = 8;
const MAX_RECOMMENDED_READS_PER_MATCH = 6;
const MAX_IMPORT_DECLARATIONS_PER_MATCH = 8;
const MAX_EXPORT_DECLARATIONS_PER_MATCH = 8;

export function buildCodebaseKnowledgeToolResultText(queryResult: CodebaseKnowledgeQueryResult): string {
  const resultLines = [
    "<codebase_knowledge_query>",
    `<symbol_names>${escapeXmlText((queryResult.query.symbolNames ?? []).join(", "))}</symbol_names>`,
    `<file_paths>${escapeXmlText((queryResult.query.filePaths ?? []).join(", "))}</file_paths>`,
    `<match_count>${queryResult.matches.length}</match_count>`,
    "<matches>",
  ];

  let appendedMatchCount = 0;
  let omittedMatchCount = 0;
  const appendedMatchLineCounts: number[] = [];
  for (const [matchIndex, match] of queryResult.matches.entries()) {
    const matchLines = formatCodebaseKnowledgeMatchLines({
      match,
      rank: matchIndex + 1,
    });
    const candidateLines = [
      ...resultLines,
      ...matchLines,
      "</matches>",
      ...formatCodebaseKnowledgeToolResultTrailingLines({ omittedMatchCount: 0 }),
    ];
    if (candidateLines.join("\n").length > MAX_CODEBASE_KNOWLEDGE_TOOL_RESULT_TEXT_LENGTH) {
      omittedMatchCount = queryResult.matches.length - appendedMatchCount;
      break;
    }

    resultLines.push(...matchLines);
    appendedMatchCount += 1;
    appendedMatchLineCounts.push(matchLines.length);
  }

  while (
    appendedMatchCount > 0 &&
    [
        ...resultLines,
        "</matches>",
        ...formatCodebaseKnowledgeToolResultTrailingLines({ omittedMatchCount }),
      ].join("\n").length > MAX_CODEBASE_KNOWLEDGE_TOOL_RESULT_TEXT_LENGTH
  ) {
    const removedMatchLineCount = appendedMatchLineCounts.pop();
    if (removedMatchLineCount === undefined) {
      throw new Error("Missing appended codebase knowledge match line count.");
    }
    resultLines.splice(resultLines.length - removedMatchLineCount, removedMatchLineCount);
    appendedMatchCount -= 1;
    omittedMatchCount += 1;
  }

  resultLines.push(
    "</matches>",
    ...formatCodebaseKnowledgeToolResultTrailingLines({ omittedMatchCount }),
  );

  return resultLines.join("\n");
}

function formatCodebaseKnowledgeMatchLines(input: {
  match: CodebaseKnowledgeQueryResult["matches"][number];
  rank: number;
}): string[] {
  const evidenceRanges = input.match.record.evidenceRanges.slice(0, MAX_EVIDENCE_RANGES_PER_MATCH);
  const recommendedReads = input.match.recommendedReads.slice(0, MAX_RECOMMENDED_READS_PER_MATCH);
  return [
    `<match rank="${input.rank}" score="${input.match.score}">`,
    `<record_kind>${input.match.record.recordKind}</record_kind>`,
    `<title>${escapeXmlText(input.match.record.title)}</title>`,
    `<summary>${escapeXmlText(truncateText(input.match.record.summary, MAX_CODEBASE_KNOWLEDGE_MATCH_SUMMARY_LENGTH))}</summary>`,
    ...formatCodebaseKnowledgeRecordMapDetailLines(input.match.record),
    "<evidence>",
    ...evidenceRanges.map((evidenceRange) =>
      `<source file="${escapeXmlAttribute(evidenceRange.filePath)}" lines="${evidenceRange.startLineNumber}-${evidenceRange.endLineNumber}" />`
    ),
    ...(input.match.record.evidenceRanges.length > evidenceRanges.length
      ? [`<omitted_evidence_count>${input.match.record.evidenceRanges.length - evidenceRanges.length}</omitted_evidence_count>`]
      : []),
    "</evidence>",
    "<recommended_reads>",
    ...recommendedReads.map((recommendedRead) =>
      `<read file="${escapeXmlAttribute(recommendedRead.filePath)}" offset_line="${recommendedRead.startLineNumber}" line_count="${recommendedRead.maximumLineCount}" reason="${escapeXmlAttribute(recommendedRead.reason)}" />`
    ),
    ...(input.match.recommendedReads.length > recommendedReads.length
      ? [`<omitted_recommended_read_count>${input.match.recommendedReads.length - recommendedReads.length}</omitted_recommended_read_count>`]
      : []),
    "</recommended_reads>",
    "</match>",
  ];
}

function formatCodebaseKnowledgeRecordMapDetailLines(record: CodebaseKnowledgeRecord): string[] {
  switch (record.recordKind) {
    case "file":
      return formatFileKnowledgeRecordMapDetailLines(record);
    case "symbol":
      return formatSymbolKnowledgeRecordMapDetailLines(record);
  }
}

function formatFileKnowledgeRecordMapDetailLines(record: CodebaseKnowledgeRecord & { recordKind: "file" }): string[] {
  const importDeclarations = (record.importDeclarations ?? []).slice(0, MAX_IMPORT_DECLARATIONS_PER_MATCH);
  const exportDeclarations = (record.exportDeclarations ?? []).slice(0, MAX_EXPORT_DECLARATIONS_PER_MATCH);
  if (importDeclarations.length === 0 && exportDeclarations.length === 0) {
    return [];
  }

  return [
    "<map_details>",
    ...(importDeclarations.length > 0
      ? [
          "<imports>",
          ...importDeclarations.map((importDeclaration) =>
            `<import module="${escapeXmlAttribute(importDeclaration.moduleSpecifier)}" symbols="${escapeXmlAttribute(importDeclaration.importedSymbolNames.join(", "))}" type_only="${importDeclaration.isTypeOnly}" lines="${importDeclaration.startLineNumber}-${importDeclaration.endLineNumber}" />`
          ),
          ...(record.importDeclarations && record.importDeclarations.length > importDeclarations.length
            ? [`<omitted_import_count>${record.importDeclarations.length - importDeclarations.length}</omitted_import_count>`]
            : []),
          "</imports>",
        ]
      : []),
    ...(exportDeclarations.length > 0
      ? [
          "<exports>",
          ...exportDeclarations.map((exportDeclaration) =>
            `<export symbols="${escapeXmlAttribute(exportDeclaration.exportedSymbolNames.join(", "))}"${exportDeclaration.moduleSpecifier ? ` module="${escapeXmlAttribute(exportDeclaration.moduleSpecifier)}"` : ""} lines="${exportDeclaration.startLineNumber}-${exportDeclaration.endLineNumber}" />`
          ),
          ...(record.exportDeclarations && record.exportDeclarations.length > exportDeclarations.length
            ? [`<omitted_export_count>${record.exportDeclarations.length - exportDeclarations.length}</omitted_export_count>`]
            : []),
          "</exports>",
        ]
      : []),
    "</map_details>",
  ];
}

function formatSymbolKnowledgeRecordMapDetailLines(record: CodebaseKnowledgeRecord & { recordKind: "symbol" }): string[] {
  return [
    "<map_details>",
    `<symbol name="${escapeXmlAttribute(record.symbolName)}" kind="${record.symbolKind}" exported="${record.isExported}" file="${escapeXmlAttribute(record.filePath)}" lines="${record.startLineNumber}-${record.endLineNumber}" />`,
    ...(record.declarationPreview
      ? [`<declaration_preview>${escapeXmlText(record.declarationPreview.declarationPreviewText)}</declaration_preview>`]
      : []),
    ...(record.declarationPreview?.documentationCommentText
      ? [`<documentation_comment>${escapeXmlText(record.declarationPreview.documentationCommentText)}</documentation_comment>`]
      : []),
    "</map_details>",
  ];
}

function formatCodebaseKnowledgeToolResultTrailingLines(input: { omittedMatchCount: number }): string[] {
  return [
    ...(input.omittedMatchCount > 0
      ? [
          "<codebase_knowledge_truncation>",
          `<omitted_match_count>${input.omittedMatchCount}</omitted_match_count>`,
          "<guidance>Use maximumResultCount, or narrow symbolNames and filePaths to fewer entries, to reduce results.</guidance>",
          "</codebase_knowledge_truncation>",
        ]
      : []),
    "<verification_note>Read the exact current source ranges with read before relying on these summaries.</verification_note>",
    "</codebase_knowledge_query>",
  ];
}

function truncateText(text: string, maximumLength: number): string {
  if (text.length <= maximumLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maximumLength - 15))}[truncated]`;
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
