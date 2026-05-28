import type { CodebaseKnowledgeQueryResult } from "./codebaseKnowledgeTypes.ts";

export const MAX_CODEBASE_KNOWLEDGE_TOOL_RESULT_TEXT_LENGTH = 24_000;

const MAX_CODEBASE_KNOWLEDGE_MATCH_SUMMARY_LENGTH = 900;
const MAX_EVIDENCE_RANGES_PER_MATCH = 8;
const MAX_RECOMMENDED_READS_PER_MATCH = 6;

export function buildCodebaseKnowledgeToolResultText(queryResult: CodebaseKnowledgeQueryResult): string {
  const resultLines = [
    "<codebase_knowledge_query>",
    `<problem>${escapeXmlText(queryResult.query.codebaseProblemDescription)}</problem>`,
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
    `<freshness>${input.match.record.freshness}</freshness>`,
    "<evidence>",
    ...evidenceRanges.map((evidenceRange) =>
      `<source file="${escapeXmlAttribute(evidenceRange.filePath)}" lines="${evidenceRange.startLineNumber}-${evidenceRange.endLineNumber}" source_kind="${evidenceRange.sourceKind}" />`
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

function formatCodebaseKnowledgeToolResultTrailingLines(input: { omittedMatchCount: number }): string[] {
  return [
    ...(input.omittedMatchCount > 0
      ? [
          "<codebase_knowledge_truncation>",
          `<omitted_match_count>${input.omittedMatchCount}</omitted_match_count>`,
          "<guidance>Use maximumKnowledgeResultCount, knownRelevantFilePaths, knownRelevantSymbolNames, or a more specific problem description to narrow results.</guidance>",
          "</codebase_knowledge_truncation>",
        ]
      : []),
    "<verification_note>Read the exact current source ranges with read/read_many before relying on these summaries.</verification_note>",
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
