import type {
  AssistantMarkdownCallout,
  AssistantMarkdownCalloutKind,
  AssistantMarkdownCodeToken,
  AssistantMarkdownHeadingToken,
  AssistantMarkdownParagraphToken,
  AssistantMarkdownToken,
} from "./assistantMarkdownTypes.ts";

const minimumAssistantMarkdownChromeRuleLength = 8;
const maximumAssistantMarkdownChromeRuleLength = 120;
const calloutMarkerPattern = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?([\s\S]*)$/i;

export const assistantMarkdownDashOnlyParagraphPattern = /^[-*_\s]{3,}$/;

export function isAssistantMarkdownCodeToken(token: AssistantMarkdownToken): token is AssistantMarkdownCodeToken {
  return token.type === "code" && "text" in token && typeof token.text === "string";
}

export function isAssistantMarkdownHeadingToken(token: AssistantMarkdownToken): token is AssistantMarkdownHeadingToken {
  return (
    token.type === "heading" &&
    "text" in token &&
    typeof token.text === "string" &&
    "depth" in token &&
    typeof token.depth === "number"
  );
}

export function isAssistantMarkdownDashOnlyParagraphToken(
  token: AssistantMarkdownToken,
): token is AssistantMarkdownParagraphToken {
  return (
    token.type === "paragraph" &&
    "text" in token &&
    typeof token.text === "string" &&
    assistantMarkdownDashOnlyParagraphPattern.test(token.text.trim())
  );
}

export function isAssistantMarkdownParagraphToken(token: AssistantMarkdownToken): token is AssistantMarkdownParagraphToken {
  return token.type === "paragraph" && "text" in token && typeof token.text === "string";
}

export function formatAssistantMarkdownInlineTextForStyledText(inlineMarkdownText: string): string {
  return inlineMarkdownText
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(
      /!?\[([^\]\n]+)\]\(\s*([^\s)]+)(?:\s+[^)]*)?\)/g,
      (_linkMarkdown, visibleLinkText: string, linkUrl: string) =>
        // Dropping the URL would make the link unreachable in a terminal, and
        // repeating it reads as noise when the visible text already is the URL.
        visibleLinkText === linkUrl ? linkUrl : `${visibleLinkText} (${linkUrl})`,
    );
}

function removeIncompleteStreamingInlineMarkdownSyntax(inlineMarkdownText: string): string {
  const inlineTextWithoutIncompleteLinks = inlineMarkdownText
    .replace(/!?\[([^\]\n]*)\]\([^\n)]*$/g, "$1")
    .replace(/!?\[([^\]\n]*)$/g, "$1");
  return removeUnmatchedTrailingInlineDelimiter(
    removeUnmatchedTrailingInlineDelimiter(
      removeUnmatchedTrailingInlineDelimiter(inlineTextWithoutIncompleteLinks, "`"),
      "**",
    ),
    "__",
  );
}

function removeUnmatchedTrailingInlineDelimiter(inlineMarkdownText: string, inlineDelimiter: string): string {
  let delimiterCount = 0;
  let searchStartIndex = 0;
  while (searchStartIndex < inlineMarkdownText.length) {
    const delimiterIndex = inlineMarkdownText.indexOf(inlineDelimiter, searchStartIndex);
    if (delimiterIndex === -1) {
      break;
    }

    delimiterCount += 1;
    searchStartIndex = delimiterIndex + inlineDelimiter.length;
  }

  if (delimiterCount % 2 === 0) {
    return inlineMarkdownText;
  }

  const unmatchedDelimiterIndex = inlineMarkdownText.lastIndexOf(inlineDelimiter);
  return unmatchedDelimiterIndex === -1
    ? inlineMarkdownText
    : `${inlineMarkdownText.slice(0, unmatchedDelimiterIndex)}${inlineMarkdownText.slice(unmatchedDelimiterIndex + inlineDelimiter.length)}`;
}

const incompleteStreamingFencePattern = /^\s*(?:`{3,}[^`]*|~{3,}[^~]*)$/;
const incompleteStreamingListMarkerPattern = /^\s*(?:[-*+]\s*(?:\[[ xX]?\]?)?|\d+\.)\s*$/;
const incompleteStreamingHeadingPattern = /^\s*#{1,6}\s*$/;
const streamingFenceBoundaryLinePattern = /^ {0,3}(?:`{3,}|~{3,})/;

// While streaming, a trailing fence opener, bare list marker, or bare heading marker is
// syntax still being typed; rendering it would flash raw markers (or an empty code
// block) for one frame until the next chunk arrives. Likewise, unmatched trailing
// inline delimiters on the last prose line would flash literally — but the last line is
// left untouched inside an open code fence, where delimiters are code, not syntax.
export function prepareAssistantMarkdownTextForRendering(markdownText: string, isStreaming: boolean): string {
  if (!isStreaming) {
    return markdownText;
  }

  const lastLineBreakIndex = markdownText.lastIndexOf("\n");
  const lastMarkdownLine = markdownText.slice(lastLineBreakIndex + 1);
  if (
    incompleteStreamingFencePattern.test(lastMarkdownLine) ||
    incompleteStreamingListMarkerPattern.test(lastMarkdownLine) ||
    incompleteStreamingHeadingPattern.test(lastMarkdownLine)
  ) {
    return lastLineBreakIndex >= 0 ? markdownText.slice(0, lastLineBreakIndex).trimEnd() : "";
  }

  if (isInsideOpenStreamingCodeFence(markdownText.slice(0, lastLineBreakIndex + 1))) {
    return markdownText;
  }

  const stableLastMarkdownLine = removeIncompleteStreamingInlineMarkdownSyntax(lastMarkdownLine);
  if (stableLastMarkdownLine === lastMarkdownLine) {
    return markdownText;
  }
  return `${markdownText.slice(0, lastLineBreakIndex + 1)}${stableLastMarkdownLine}`;
}

function isInsideOpenStreamingCodeFence(markdownTextBeforeLastLine: string): boolean {
  let fenceBoundaryLineCount = 0;
  for (const markdownLine of markdownTextBeforeLastLine.split("\n")) {
    if (streamingFenceBoundaryLinePattern.test(markdownLine)) {
      fenceBoundaryLineCount += 1;
    }
  }
  return fenceBoundaryLineCount % 2 === 1;
}

const taskListMarkerLinePattern = /^(\s*[-*+]\s+)\[([ xX])\](\s|$)/;
const taskListMarkerProbePattern = /\[[ xX]\]/;

// OpenTUI's conceal hides task-list `[x]`/`[ ]` markers without rendering a checkbox,
// which silently drops the checked state; substituting glyphs before parsing keeps the
// state visible. Fence content is left untouched — brackets there are code.
export function formatAssistantMarkdownTaskListMarkers(markdownText: string): string {
  if (!taskListMarkerProbePattern.test(markdownText)) {
    return markdownText;
  }

  let isInsideCodeFence = false;
  let hasConvertedTaskListMarker = false;
  const formattedMarkdownLines = markdownText.split("\n").map((markdownLine) => {
    if (streamingFenceBoundaryLinePattern.test(markdownLine)) {
      isInsideCodeFence = !isInsideCodeFence;
      return markdownLine;
    }
    if (isInsideCodeFence) {
      return markdownLine;
    }
    return markdownLine.replace(taskListMarkerLinePattern, (_taskListMarkerMatch, markerPrefix, checkedState, markerSuffix) => {
      hasConvertedTaskListMarker = true;
      return `${markerPrefix}${checkedState.trim().length > 0 ? "☑" : "☐"}${markerSuffix}`;
    });
  });
  return hasConvertedTaskListMarker ? formattedMarkdownLines.join("\n") : markdownText;
}

export function trimAssistantMarkdownBoundaryBlankLines(markdownLines: readonly string[]): string[] {
  let firstNonBlankLineIndex = 0;
  let lastNonBlankLineExclusiveIndex = markdownLines.length;
  while (
    firstNonBlankLineIndex < lastNonBlankLineExclusiveIndex &&
    (markdownLines[firstNonBlankLineIndex] ?? "").trim().length === 0
  ) {
    firstNonBlankLineIndex += 1;
  }
  while (
    lastNonBlankLineExclusiveIndex > firstNonBlankLineIndex &&
    (markdownLines[lastNonBlankLineExclusiveIndex - 1] ?? "").trim().length === 0
  ) {
    lastNonBlankLineExclusiveIndex -= 1;
  }
  return markdownLines.slice(firstNonBlankLineIndex, lastNonBlankLineExclusiveIndex);
}

export function formatAssistantMarkdownHeadingText(headingText: string, depth: number): string {
  const visibleHeadingText = formatAssistantMarkdownInlineTextForStyledText(headingText);
  if (depth === 1) {
    return `\n▌ ${visibleHeadingText}`;
  }

  if (depth === 2) {
    return `\n◆ ${visibleHeadingText}`;
  }

  if (depth === 3) {
    return `\n${visibleHeadingText}`;
  }

  return `\n• ${visibleHeadingText}`;
}

export function parseAssistantMarkdownCallout(inputText: string): AssistantMarkdownCallout | undefined {
  const calloutMarkerMatch = calloutMarkerPattern.exec(inputText.trimStart());
  if (!calloutMarkerMatch) {
    return undefined;
  }

  return {
    calloutKind: calloutMarkerMatch[1]!.toUpperCase() as AssistantMarkdownCalloutKind,
    bodyText: calloutMarkerMatch[2]?.trimStart() ?? "",
  };
}

export function repeatAssistantMarkdownChromeRule(input: { availableColumnCount: number; occupiedColumnCount?: number }): string {
  const availableRuleColumnCount = input.availableColumnCount - (input.occupiedColumnCount ?? 0);
  return "─".repeat(
    Math.max(
      minimumAssistantMarkdownChromeRuleLength,
      Math.min(maximumAssistantMarkdownChromeRuleLength, availableRuleColumnCount),
    ),
  );
}
