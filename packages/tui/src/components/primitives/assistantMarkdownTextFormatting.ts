import type {
  AssistantMarkdownCallout,
  AssistantMarkdownCalloutKind,
  AssistantMarkdownCodeToken,
  AssistantMarkdownHeadingToken,
  AssistantMarkdownParagraphToken,
  AssistantMarkdownToken,
} from "./assistantMarkdownRenderSectionTypes.ts";

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

export function formatStreamingAssistantMarkdownInlineTextForStyledText(inlineMarkdownText: string): string {
  return formatAssistantMarkdownInlineTextForStyledText(
    removeIncompleteStreamingInlineMarkdownSyntax(inlineMarkdownText),
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
