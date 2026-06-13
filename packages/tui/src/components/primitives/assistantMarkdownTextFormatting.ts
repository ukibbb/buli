import type {
  AssistantMarkdownCallout,
  AssistantMarkdownCalloutKind,
  AssistantMarkdownCodeToken,
  AssistantMarkdownHeadingToken,
  AssistantMarkdownParagraphToken,
  AssistantMarkdownToken,
} from "./assistantMarkdownTypes.ts";

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
  const inlineTextWithoutUnmatchedMultiCharacterDelimiters = removeUnmatchedTrailingInlineDelimiter(
    removeUnmatchedTrailingInlineDelimiter(
      removeUnmatchedTrailingInlineDelimiter(
        removeUnmatchedTrailingInlineDelimiter(inlineTextWithoutIncompleteLinks, "`"),
        "~~",
      ),
      "**",
    ),
    "__",
  );
  // Single-character emphasis runs after the double-delimiter passes: healing an
  // unmatched `**` can expose a leftover single `*` that must be healed in turn.
  return removeUnmatchedTrailingSingleEmphasisDelimiter(
    removeUnmatchedTrailingSingleEmphasisDelimiter(inlineTextWithoutUnmatchedMultiCharacterDelimiters, "*"),
    "_",
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

const inlineEmphasisWordCharacterPattern = /[A-Za-z0-9]/;

function isInlineEmphasisWhitespaceOrLineEdge(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character);
}

// A `*` isolated by whitespace is arithmetic and a `_` flanked by word characters is an
// identifier (snake_case) — markdown treats neither as emphasis, so healing must not
// strip them. Runs of the delimiter belong to the double-delimiter passes; only a
// leftover odd character at the end of a run counts as a single here.
function removeUnmatchedTrailingSingleEmphasisDelimiter(
  inlineMarkdownText: string,
  delimiterCharacter: "*" | "_",
): string {
  const emphasisCapableDelimiterIndexes: number[] = [];
  for (let characterIndex = 0; characterIndex < inlineMarkdownText.length; characterIndex += 1) {
    if (inlineMarkdownText[characterIndex] !== delimiterCharacter) {
      continue;
    }

    let delimiterRunEndIndex = characterIndex;
    while (inlineMarkdownText[delimiterRunEndIndex + 1] === delimiterCharacter) {
      delimiterRunEndIndex += 1;
    }
    const delimiterRunLength = delimiterRunEndIndex - characterIndex + 1;
    const precedingCharacter = characterIndex > 0 ? inlineMarkdownText[characterIndex - 1] : undefined;
    const followingCharacter =
      delimiterRunEndIndex + 1 < inlineMarkdownText.length ? inlineMarkdownText[delimiterRunEndIndex + 1] : undefined;
    characterIndex = delimiterRunEndIndex;
    if (delimiterRunLength % 2 === 0) {
      continue;
    }

    if (delimiterCharacter === "*") {
      if (
        isInlineEmphasisWhitespaceOrLineEdge(precedingCharacter) &&
        isInlineEmphasisWhitespaceOrLineEdge(followingCharacter)
      ) {
        continue;
      }
    } else {
      const canOpenEmphasis =
        (precedingCharacter === undefined || !inlineEmphasisWordCharacterPattern.test(precedingCharacter)) &&
        !isInlineEmphasisWhitespaceOrLineEdge(followingCharacter);
      const canCloseEmphasis =
        !isInlineEmphasisWhitespaceOrLineEdge(precedingCharacter) &&
        (followingCharacter === undefined || !inlineEmphasisWordCharacterPattern.test(followingCharacter));
      if (!canOpenEmphasis && !canCloseEmphasis) {
        continue;
      }
    }

    emphasisCapableDelimiterIndexes.push(delimiterRunEndIndex);
  }

  if (emphasisCapableDelimiterIndexes.length % 2 === 0) {
    return inlineMarkdownText;
  }

  const unmatchedDelimiterIndex = emphasisCapableDelimiterIndexes[emphasisCapableDelimiterIndexes.length - 1]!;
  return `${inlineMarkdownText.slice(0, unmatchedDelimiterIndex)}${inlineMarkdownText.slice(unmatchedDelimiterIndex + 1)}`;
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
