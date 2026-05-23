import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  CodeRenderable,
  RGBA,
  SyntaxStyle,
  TextAttributes,
  type MarkdownOptions,
  type TextChunk,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  decorateAssistantMarkdownInlineTextChunks,
  decorateAssistantMarkdownListChunks,
  decorateAssistantMarkdownProseChunks,
  type AssistantMarkdownInlineDecorationProfile,
} from "./assistantMarkdownChunkDecorators.ts";
import {
  assistantMarkdownSyntaxStyle,
  githubLikeTerminalCodeColors,
} from "./codeRenderingTheme.ts";
import { DiffBlock } from "./DiffBlock.tsx";
import { FencedCodeBlock } from "./FencedCodeBlock.tsx";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

export type AssistantMarkdownBlockProps = {
  markdownText: string;
  isStreaming: boolean;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
};

const assistantMarkdownHeadingSyntaxStyleByDepth = {
  1: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  2: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  3: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  fallback: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true } }),
} as const;

const assistantMarkdownQuoteSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textSecondary), italic: true },
});

const assistantMarkdownTaskListSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  checked: { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true },
  unchecked: { fg: RGBA.fromHex(chatScreenTheme.textDim), bold: true },
});

const assistantMarkdownCalloutSyntaxStyleByKind = {
  NOTE: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  TIP: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true } }),
  IMPORTANT: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  WARNING: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  CAUTION: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentRed), bold: true } }),
} as const;

const assistantMarkdownUnorderedListMarkers = ["-"] as const;

const minimumAssistantMarkdownChromeRuleLength = 8;
const maximumAssistantMarkdownChromeRuleLength = 120;
const defaultAssistantMarkdownTerminalColumnCount = 80;
const dashOnlyParagraphPattern = /^[-*_\s]{3,}$/;
const calloutMarkerPattern = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?([\s\S]*)$/i;
const codeFenceDiffLanguagePattern = /^(?:diff|patch)$/i;
const codeFenceShellLanguagePattern = /^(?:bash|sh|shell|zsh)$/i;
const codeFenceFileLabelPattern = /(?:^|\s)(?:title|filename|file|path)=("[^"]+"|'[^']+'|[^\s]+)/i;
const codeFenceFallbackFileLabelPattern = /(?:^|\s)(\S+\/\S+\.\S+)/;
const fencedCodeBlockStartPattern = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const incompleteStreamingFencePattern = /^\s*```[^`]*$/;
const incompleteStreamingListMarkerPattern = /^\s*(?:[-*+]\s*|\d+\.\s*)$/;
const incompleteStreamingHeadingPattern = /^\s*#{1,6}\s*$/;
const markdownHeadingLinePattern = /^(#{1,6})\s+(.+)$/;
const markdownBlockquoteLinePattern = /^\s*>\s?(.*)$/;
const markdownListLinePattern = /^(\s*)(?:([-*+])\s+(?:\[([ xX])\]\s+)?|(\d+\.)\s+)(.*)$/;
const markdownTableSeparatorLinePattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const assistantMarkdownGenericCodeFenceLanguageLabels = new Set(["code", "plain", "plaintext", "text", "txt"]);
const unifiedDiffFileHeaderPattern = /^diff --git a\/(.+) b\/(.+)$/;
const quotedUnifiedDiffFileHeaderPattern = /^diff --git "a\/(.+)" "b\/(.+)"$/;
const unifiedDiffHunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const unifiedDiffMetadataLinePrefixes = [
  "index ",
  "old mode ",
  "new mode ",
  "deleted file mode ",
  "new file mode ",
  "similarity index ",
  "dissimilarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
  "--- ",
  "+++ ",
  "Binary files ",
  "GIT binary patch",
] as const;

type AssistantMarkdownToken = Parameters<NonNullable<MarkdownOptions["renderNode"]>>[0];
type AssistantMarkdownCodeToken = AssistantMarkdownToken & { type: "code"; text: string; lang?: string };
type AssistantMarkdownHeadingToken = AssistantMarkdownToken & { type: "heading"; text: string; depth: number };
type AssistantMarkdownBlockquoteToken = AssistantMarkdownToken & { type: "blockquote"; text: string };
type AssistantMarkdownParagraphToken = AssistantMarkdownToken & { type: "paragraph"; text: string };
type AssistantMarkdownListItemToken = {
  text?: string;
  task?: boolean;
  checked?: boolean;
  tokens?: AssistantMarkdownToken[];
};
type AssistantMarkdownListToken = AssistantMarkdownToken & {
  type: "list";
  ordered?: boolean;
  start?: number;
  items?: AssistantMarkdownListItemToken[];
};

type AssistantMarkdownCalloutKind = keyof typeof assistantMarkdownCalloutSyntaxStyleByKind;
type AssistantMarkdownCodeFenceInfo = {
  codeLanguageLabel: string;
  codeFenceDisplayLabel?: string | undefined;
  codeFenceFilePath?: string | undefined;
};

type AssistantMarkdownRenderSectionBase = {
  sectionKey: string;
};

export type AssistantMarkdownRenderSection =
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "markdown"; markdownText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "paragraph"; paragraphText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "heading"; headingDepth: number; headingText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "horizontalRule" })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "table"; tableMarkdownText: string })
  | (AssistantMarkdownRenderSectionBase & {
    sectionKind: "codeFence";
    codeFenceText: string;
    codeFenceInfo: AssistantMarkdownCodeFenceInfo;
  })
  | (AssistantMarkdownRenderSectionBase & {
    sectionKind: "list";
    listLines: AssistantMarkdownVisibleListLine[];
    hasLeadingBlankLine: boolean;
  })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "blockquote"; quoteText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "unifiedDiff"; unifiedDiffText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "shellSnippet"; shellSnippetText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "diffSnippet"; diffSnippetText: string; filePath?: string | undefined });

export type AssistantMarkdownRenderSectionCache = {
  renderSections: readonly AssistantMarkdownRenderSection[];
};

type AssistantMarkdownFencedCodeBlock = {
  fenceInfoString: string;
  fencedContentLines: string[];
  hasClosingFence: boolean;
  nextLineIndex: number;
};

type AssistantMarkdownUnifiedDiffBlock = {
  unifiedDiffLines: string[];
  nextLineIndex: number;
};

type AssistantMarkdownRawDiffSnippetBlock = {
  diffSnippetLines: string[];
  nextLineIndex: number;
};

type AssistantMarkdownBlockquoteBlock = {
  quoteText: string;
  nextLineIndex: number;
};

type AssistantMarkdownListBlock = {
  listLines: AssistantMarkdownVisibleListLine[];
  nextLineIndex: number;
};

type AssistantMarkdownParagraphBlock = {
  paragraphText: string;
  nextLineIndex: number;
};

type AssistantMarkdownTableBlock = {
  tableMarkdownText: string;
  nextLineIndex: number;
};

type AssistantMarkdownVisibleListLine = {
  listItemIndentText: string;
  listItemMarkerText: string;
  listItemText: string;
};

type ParsedAssistantMarkdownListLine = {
  listItemDepth: number;
  listItemMarkerText: string;
  listItemText: string;
};

type AssistantUnifiedDiffExpectedHunkLineCounts = {
  oldLineCount: number;
  newLineCount: number;
};

type AssistantUnifiedDiffActualHunkLineCounts = {
  oldLineCount: number;
  newLineCount: number;
};

type AssistantUnifiedDiffFileSummary = {
  filePath: string;
  addedLineCount: number;
  removedLineCount: number;
};

function isAssistantMarkdownCodeToken(token: AssistantMarkdownToken): token is AssistantMarkdownCodeToken {
  return token.type === "code" && "text" in token && typeof token.text === "string";
}

function isAssistantMarkdownHeadingToken(token: AssistantMarkdownToken): token is AssistantMarkdownHeadingToken {
  return (
    token.type === "heading" &&
    "text" in token &&
    typeof token.text === "string" &&
    "depth" in token &&
    typeof token.depth === "number"
  );
}

function isAssistantMarkdownBlockquoteToken(token: AssistantMarkdownToken): token is AssistantMarkdownBlockquoteToken {
  return token.type === "blockquote" && "text" in token && typeof token.text === "string";
}

function isAssistantMarkdownListToken(token: AssistantMarkdownToken): token is AssistantMarkdownListToken {
  return token.type === "list" && "items" in token && Array.isArray(token.items);
}

function isAssistantMarkdownDashOnlyParagraphToken(
  token: AssistantMarkdownToken,
): token is AssistantMarkdownParagraphToken {
  return (
    token.type === "paragraph" &&
    "text" in token &&
    typeof token.text === "string" &&
    dashOnlyParagraphPattern.test(token.text.trim())
  );
}

function formatAssistantMarkdownInlineTextForStyledText(inlineMarkdownText: string): string {
  return inlineMarkdownText
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/!?\[([^\]\n]+)\]\([^\n)]+\)/g, "$1");
}

function createAssistantMarkdownPlainTextChunk(input: {
  text: string;
  foregroundColor: string;
  attributes?: number | undefined;
}): TextChunk {
  return {
    __isChunk: true,
    text: input.text,
    fg: RGBA.fromHex(input.foregroundColor),
    attributes: input.attributes ?? 0,
  };
}

function AssistantMarkdownInlineText(props: {
  inlineText: string;
  foregroundColor?: string | undefined;
  attributes?: number | undefined;
  decorationProfile?: AssistantMarkdownInlineDecorationProfile | undefined;
}): ReactNode {
  const baseForegroundColor = props.foregroundColor ?? chatScreenTheme.textPrimary;
  const inlineTextChunks = decorateAssistantMarkdownInlineTextChunks({
    profile: props.decorationProfile ?? "prose",
    textChunks: [
      createAssistantMarkdownPlainTextChunk({
        text: props.inlineText,
        foregroundColor: baseForegroundColor,
        attributes: props.attributes,
      }),
    ],
  });

  return inlineTextChunks.map((inlineTextChunk, index) => (
    <span
      attributes={inlineTextChunk.attributes ?? 0}
      fg={inlineTextChunk.fg ?? RGBA.fromHex(baseForegroundColor)}
      key={`assistant-inline-text-chunk-${index}`}
    >
      {inlineTextChunk.text}
    </span>
  ));
}

function resolveAssistantMarkdownHeadingSyntaxStyle(depth: number): SyntaxStyle {
  if (depth === 1) return assistantMarkdownHeadingSyntaxStyleByDepth[1];
  if (depth === 2) return assistantMarkdownHeadingSyntaxStyleByDepth[2];
  if (depth === 3) return assistantMarkdownHeadingSyntaxStyleByDepth[3];
  return assistantMarkdownHeadingSyntaxStyleByDepth.fallback;
}

function formatAssistantMarkdownHeadingText(headingText: string, depth: number): string {
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

function parseAssistantMarkdownCallout(inputText: string): { calloutKind: AssistantMarkdownCalloutKind; bodyText: string } | undefined {
  const calloutMarkerMatch = calloutMarkerPattern.exec(inputText.trimStart());
  if (!calloutMarkerMatch) {
    return undefined;
  }

  return {
    calloutKind: calloutMarkerMatch[1]!.toUpperCase() as AssistantMarkdownCalloutKind,
    bodyText: calloutMarkerMatch[2]?.trimStart() ?? "",
  };
}

function formatAssistantMarkdownQuoteText(quoteText: string): string {
  const quoteLines = quoteText.trim().split("\n");
  return quoteLines.map((quoteLine) => `│ ${formatAssistantMarkdownInlineTextForStyledText(quoteLine)}`).join("\n");
}

function formatAssistantMarkdownCalloutText(input: { calloutKind: AssistantMarkdownCalloutKind; bodyText: string }): string {
  const bodyLines = input.bodyText.trim().length > 0 ? input.bodyText.trim().split("\n") : [];
  return [`▌ ${input.calloutKind}`, "├" + "─".repeat(Math.max(12, input.calloutKind.length + 2)), ...bodyLines.map((bodyLine) => `│ ${formatAssistantMarkdownInlineTextForStyledText(bodyLine)}`)].join("\n");
}

function parseAssistantMarkdownCodeFenceInfo(codeFenceInfoString: string | undefined): AssistantMarkdownCodeFenceInfo {
  const normalizedCodeFenceInfoString = codeFenceInfoString?.trim() ?? "";
  const codeLanguageLabel = normalizedCodeFenceInfoString.split(/\s+/)[0] || "code";
  const codeFenceFileLabel = resolveAssistantMarkdownCodeFenceFileLabel(normalizedCodeFenceInfoString);
  const shouldShowCodeLanguageLabel = !isGenericAssistantMarkdownCodeFenceLanguageLabel(codeLanguageLabel);
  return {
    codeLanguageLabel,
    ...(codeFenceFileLabel
      ? {
          codeFenceDisplayLabel: shouldShowCodeLanguageLabel ? `${codeLanguageLabel} · ${codeFenceFileLabel}` : codeFenceFileLabel,
          codeFenceFilePath: codeFenceFileLabel,
        }
      : {}),
  };
}

function isGenericAssistantMarkdownCodeFenceLanguageLabel(codeLanguageLabel: string): boolean {
  return assistantMarkdownGenericCodeFenceLanguageLabels.has(codeLanguageLabel.toLowerCase());
}

function resolveAssistantMarkdownCodeFenceFileLabel(codeFenceInfoString: string): string | undefined {
  const explicitCodeFenceFileLabelMatch = codeFenceFileLabelPattern.exec(codeFenceInfoString);
  const explicitCodeFenceFileLabel = explicitCodeFenceFileLabelMatch?.[1];
  if (explicitCodeFenceFileLabel) {
    return explicitCodeFenceFileLabel.replace(/^['"]|['"]$/g, "");
  }

  return codeFenceFallbackFileLabelPattern.exec(codeFenceInfoString)?.[1];
}

function repeatAssistantMarkdownChromeRule(input: { availableColumnCount: number; occupiedColumnCount?: number }): string {
  const availableRuleColumnCount = input.availableColumnCount - (input.occupiedColumnCount ?? 0);
  return "─".repeat(
    Math.max(
      minimumAssistantMarkdownChromeRuleLength,
      Math.min(maximumAssistantMarkdownChromeRuleLength, availableRuleColumnCount),
    ),
  );
}

function formatAssistantMarkdownListText(listToken: AssistantMarkdownListToken, depth = 0): string {
  const orderedListStartNumber = typeof listToken.start === "number" ? listToken.start : 1;
  const listItems = listToken.items ?? [];
  const listItemMarkers = listItems.map((listItem, index) =>
    resolveAssistantMarkdownListItemMarker({
      listItem,
      listToken,
      depth,
      index,
      orderedListStartNumber,
    })
  );
  const listItemMarkerWidth = Math.max(...listItemMarkers.map((listItemMarker) => listItemMarker.length), 1);
  return listItems
    .map((listItem, index) => {
      const listItemIndent = "  ".repeat(depth);
      const listItemMarker = listItemMarkers[index] ?? "•";
      const alignedListItemMarker = listToken.ordered === true ? listItemMarker.padStart(listItemMarkerWidth, " ") : listItemMarker;
      const listItemText = resolveAssistantMarkdownListItemText(listItem);
      const listItemLine = `${listItemIndent}${alignedListItemMarker} ${listItemText}`.trimEnd();
      const childListText = resolveAssistantMarkdownChildListTokens(listItem)
        .map((childListToken) => formatAssistantMarkdownListText(childListToken, depth + 1))
        .join("\n");

      return childListText.length > 0 ? `${listItemLine}\n${childListText}` : listItemLine;
    })
    .join("\n");
}

function resolveAssistantMarkdownListItemMarker(input: {
  listItem: AssistantMarkdownListItemToken;
  listToken: AssistantMarkdownListToken;
  depth: number;
  index: number;
  orderedListStartNumber: number;
}): string {
  if (input.listItem.task === true) {
    return input.listItem.checked ? "☑" : "☐";
  }

  if (input.listToken.ordered === true) {
    return `${input.orderedListStartNumber + input.index}.`;
  }

  return assistantMarkdownUnorderedListMarkers[input.depth % assistantMarkdownUnorderedListMarkers.length] ?? "•";
}

function resolveAssistantMarkdownListItemText(listItem: AssistantMarkdownListItemToken): string {
  const paragraphText = (listItem.tokens ?? []).find(isAssistantMarkdownParagraphToken)?.text;
  return formatAssistantMarkdownInlineTextForStyledText((paragraphText ?? listItem.text ?? "").replace(/\n+/g, " ").trim());
}

function resolveAssistantMarkdownChildListTokens(listItem: AssistantMarkdownListItemToken): AssistantMarkdownListToken[] {
  return (listItem.tokens ?? []).filter(isAssistantMarkdownListToken);
}

function isAssistantMarkdownParagraphToken(token: AssistantMarkdownToken): token is AssistantMarkdownParagraphToken {
  return token.type === "paragraph" && "text" in token && typeof token.text === "string";
}

function prepareAssistantMarkdownTextForRendering(markdownText: string, isStreaming: boolean): string {
  if (!isStreaming) {
    return markdownText;
  }

  const markdownLines = markdownText.split("\n");
  const lastMarkdownLine = markdownLines.at(-1) ?? "";
  if (
    incompleteStreamingFencePattern.test(lastMarkdownLine) ||
    incompleteStreamingListMarkerPattern.test(lastMarkdownLine) ||
    incompleteStreamingHeadingPattern.test(lastMarkdownLine)
  ) {
    return markdownLines.slice(0, -1).join("\n").trimEnd();
  }

  return markdownText;
}

function splitAssistantMarkdownTextIntoRenderSections(markdownText: string): AssistantMarkdownRenderSection[] {
  const markdownLines = markdownText.split("\n");
  const renderSections: AssistantMarkdownRenderSection[] = [];
  let pendingMarkdownLines: string[] = [];
  let pendingMarkdownStartLineIndex: number | undefined;

  const flushPendingMarkdownLines = () => {
    const markdownSectionLines = trimAssistantMarkdownSectionBoundaryBlankLines(pendingMarkdownLines);
    const markdownSectionStartLineIndex = pendingMarkdownStartLineIndex ?? 0;
    pendingMarkdownLines = [];
    pendingMarkdownStartLineIndex = undefined;
    if (markdownSectionLines.length === 0) {
      return;
    }

    renderSections.push({
      sectionKind: "markdown",
      sectionKey: `markdown:${markdownSectionStartLineIndex}`,
      markdownText: markdownSectionLines.join("\n"),
    });
  };

  let lineIndex = 0;
  while (lineIndex < markdownLines.length) {
    const sectionStartLineIndex = lineIndex;
    const fencedCodeBlock = readAssistantMarkdownFencedCodeBlock(markdownLines, lineIndex);
    if (fencedCodeBlock) {
      const fencedUnifiedDiffText = resolveFencedUnifiedDiffText(fencedCodeBlock);
      if (fencedUnifiedDiffText) {
        flushPendingMarkdownLines();
        renderSections.push({
          sectionKind: "unifiedDiff",
          sectionKey: `unifiedDiff:${sectionStartLineIndex}`,
          unifiedDiffText: fencedUnifiedDiffText,
        });
      } else if (isAssistantMarkdownDiffFence(fencedCodeBlock)) {
        const codeFenceInfo = parseAssistantMarkdownCodeFenceInfo(fencedCodeBlock.fenceInfoString);
        flushPendingMarkdownLines();
        renderSections.push({
          sectionKind: "diffSnippet",
          sectionKey: `diffSnippet:${sectionStartLineIndex}`,
          diffSnippetText: formatAssistantUnifiedDiffText(fencedCodeBlock.fencedContentLines),
          ...(codeFenceInfo.codeFenceFilePath !== undefined ? { filePath: codeFenceInfo.codeFenceFilePath } : {}),
        });
      } else if (isAssistantMarkdownShellFence(fencedCodeBlock)) {
        flushPendingMarkdownLines();
        renderSections.push({
          sectionKind: "shellSnippet",
          sectionKey: `shellSnippet:${sectionStartLineIndex}`,
          shellSnippetText: formatAssistantCodeFenceText(fencedCodeBlock.fencedContentLines),
        });
      } else {
        flushPendingMarkdownLines();
        renderSections.push({
          sectionKind: "codeFence",
          sectionKey: `codeFence:${sectionStartLineIndex}`,
          codeFenceInfo: parseAssistantMarkdownCodeFenceInfo(fencedCodeBlock.fenceInfoString),
          codeFenceText: formatAssistantCodeFenceText(fencedCodeBlock.fencedContentLines),
        });
      }
      lineIndex = fencedCodeBlock.nextLineIndex;
      continue;
    }

    const unifiedDiffBlock = readAssistantMarkdownUnifiedDiffBlock(markdownLines, lineIndex);
    if (unifiedDiffBlock) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "unifiedDiff",
        sectionKey: `unifiedDiff:${sectionStartLineIndex}`,
        unifiedDiffText: formatAssistantUnifiedDiffText(unifiedDiffBlock.unifiedDiffLines),
      });
      lineIndex = unifiedDiffBlock.nextLineIndex;
      continue;
    }

    const rawDiffSnippetBlock = readAssistantMarkdownRawDiffSnippetBlock(markdownLines, lineIndex);
    if (rawDiffSnippetBlock) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "diffSnippet",
        sectionKey: `diffSnippet:${sectionStartLineIndex}`,
        diffSnippetText: formatAssistantUnifiedDiffText(rawDiffSnippetBlock.diffSnippetLines),
      });
      lineIndex = rawDiffSnippetBlock.nextLineIndex;
      continue;
    }

    const headingLineMatch = markdownHeadingLinePattern.exec(markdownLines[lineIndex] ?? "");
    if (headingLineMatch) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "heading",
        sectionKey: `heading:${sectionStartLineIndex}`,
        headingDepth: headingLineMatch[1]?.length ?? 1,
        headingText: formatAssistantMarkdownInlineTextForStyledText(headingLineMatch[2] ?? ""),
      });
      lineIndex += 1;
      continue;
    }

    if (dashOnlyParagraphPattern.test((markdownLines[lineIndex] ?? "").trim())) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "horizontalRule",
        sectionKey: `horizontalRule:${sectionStartLineIndex}`,
      });
      lineIndex += 1;
      continue;
    }

    const tableBlock = readAssistantMarkdownTableBlock(markdownLines, lineIndex);
    if (tableBlock) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "table",
        sectionKey: `table:${sectionStartLineIndex}`,
        tableMarkdownText: tableBlock.tableMarkdownText,
      });
      lineIndex = tableBlock.nextLineIndex;
      continue;
    }

    const listBlock = readAssistantMarkdownListBlock(markdownLines, lineIndex);
    if (listBlock) {
      const hasLeadingBlankLine = pendingMarkdownLines.some((markdownLine) => markdownLine.trim().length > 0) &&
        pendingMarkdownLines.at(-1)?.trim().length === 0;
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "list",
        sectionKey: `list:${sectionStartLineIndex}`,
        listLines: listBlock.listLines,
        hasLeadingBlankLine,
      });
      lineIndex = listBlock.nextLineIndex;
      continue;
    }

    const blockquoteBlock = readAssistantMarkdownBlockquoteBlock(markdownLines, lineIndex);
    if (blockquoteBlock) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "blockquote",
        sectionKey: `blockquote:${sectionStartLineIndex}`,
        quoteText: blockquoteBlock.quoteText,
      });
      lineIndex = blockquoteBlock.nextLineIndex;
      continue;
    }

    const paragraphBlock = readAssistantMarkdownParagraphBlock(markdownLines, lineIndex);
    if (paragraphBlock) {
      flushPendingMarkdownLines();
      renderSections.push({
        sectionKind: "paragraph",
        sectionKey: `paragraph:${sectionStartLineIndex}`,
        paragraphText: paragraphBlock.paragraphText,
      });
      lineIndex = paragraphBlock.nextLineIndex;
      continue;
    }

    if (pendingMarkdownStartLineIndex === undefined) {
      pendingMarkdownStartLineIndex = lineIndex;
    }
    pendingMarkdownLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  flushPendingMarkdownLines();
  return renderSections;
}

export function createAssistantMarkdownRenderSectionCache(): AssistantMarkdownRenderSectionCache {
  return { renderSections: [] };
}

export function buildStableAssistantMarkdownRenderSections(input: {
  markdownText: string;
  isStreaming: boolean;
  previousCache: AssistantMarkdownRenderSectionCache | undefined;
}): {
  renderSections: readonly AssistantMarkdownRenderSection[];
  nextCache: AssistantMarkdownRenderSectionCache;
} {
  const preparedMarkdownText = prepareAssistantMarkdownTextForRendering(input.markdownText, input.isStreaming);
  const nextRenderSections = splitAssistantMarkdownTextIntoRenderSections(preparedMarkdownText);
  const previousRenderSectionsByKey = new Map(
    (input.previousCache?.renderSections ?? []).map((renderSection) => [renderSection.sectionKey, renderSection]),
  );
  const stableRenderSections = nextRenderSections.map((nextRenderSection) => {
    const previousRenderSection = previousRenderSectionsByKey.get(nextRenderSection.sectionKey);
    return previousRenderSection && areAssistantMarkdownRenderSectionsEqual(previousRenderSection, nextRenderSection)
      ? previousRenderSection
      : nextRenderSection;
  });

  return {
    renderSections: stableRenderSections,
    nextCache: { renderSections: stableRenderSections },
  };
}

function areAssistantMarkdownRenderSectionsEqual(
  previousRenderSection: AssistantMarkdownRenderSection,
  nextRenderSection: AssistantMarkdownRenderSection,
): boolean {
  if (previousRenderSection.sectionKind !== nextRenderSection.sectionKind) {
    return false;
  }

  if (previousRenderSection.sectionKind === "markdown" && nextRenderSection.sectionKind === "markdown") {
    return previousRenderSection.markdownText === nextRenderSection.markdownText;
  }
  if (previousRenderSection.sectionKind === "paragraph" && nextRenderSection.sectionKind === "paragraph") {
    return previousRenderSection.paragraphText === nextRenderSection.paragraphText;
  }
  if (previousRenderSection.sectionKind === "heading" && nextRenderSection.sectionKind === "heading") {
    return previousRenderSection.headingDepth === nextRenderSection.headingDepth &&
      previousRenderSection.headingText === nextRenderSection.headingText;
  }
  if (previousRenderSection.sectionKind === "horizontalRule" && nextRenderSection.sectionKind === "horizontalRule") {
    return true;
  }
  if (previousRenderSection.sectionKind === "table" && nextRenderSection.sectionKind === "table") {
    return previousRenderSection.tableMarkdownText === nextRenderSection.tableMarkdownText;
  }
  if (previousRenderSection.sectionKind === "codeFence" && nextRenderSection.sectionKind === "codeFence") {
    return previousRenderSection.codeFenceText === nextRenderSection.codeFenceText &&
      areAssistantMarkdownCodeFenceInfoValuesEqual(previousRenderSection.codeFenceInfo, nextRenderSection.codeFenceInfo);
  }
  if (previousRenderSection.sectionKind === "list" && nextRenderSection.sectionKind === "list") {
    return previousRenderSection.hasLeadingBlankLine === nextRenderSection.hasLeadingBlankLine &&
      areAssistantMarkdownVisibleListLinesEqual(previousRenderSection.listLines, nextRenderSection.listLines);
  }
  if (previousRenderSection.sectionKind === "blockquote" && nextRenderSection.sectionKind === "blockquote") {
    return previousRenderSection.quoteText === nextRenderSection.quoteText;
  }
  if (previousRenderSection.sectionKind === "unifiedDiff" && nextRenderSection.sectionKind === "unifiedDiff") {
    return previousRenderSection.unifiedDiffText === nextRenderSection.unifiedDiffText;
  }
  if (previousRenderSection.sectionKind === "shellSnippet" && nextRenderSection.sectionKind === "shellSnippet") {
    return previousRenderSection.shellSnippetText === nextRenderSection.shellSnippetText;
  }
  if (previousRenderSection.sectionKind === "diffSnippet" && nextRenderSection.sectionKind === "diffSnippet") {
    return previousRenderSection.diffSnippetText === nextRenderSection.diffSnippetText &&
      previousRenderSection.filePath === nextRenderSection.filePath;
  }

  return false;
}

function areAssistantMarkdownCodeFenceInfoValuesEqual(
  previousCodeFenceInfo: AssistantMarkdownCodeFenceInfo,
  nextCodeFenceInfo: AssistantMarkdownCodeFenceInfo,
): boolean {
  return previousCodeFenceInfo.codeLanguageLabel === nextCodeFenceInfo.codeLanguageLabel &&
    previousCodeFenceInfo.codeFenceDisplayLabel === nextCodeFenceInfo.codeFenceDisplayLabel &&
    previousCodeFenceInfo.codeFenceFilePath === nextCodeFenceInfo.codeFenceFilePath;
}

function areAssistantMarkdownVisibleListLinesEqual(
  previousListLines: readonly AssistantMarkdownVisibleListLine[],
  nextListLines: readonly AssistantMarkdownVisibleListLine[],
): boolean {
  return previousListLines.length === nextListLines.length && previousListLines.every((previousListLine, index) => {
    const nextListLine = nextListLines[index];
    return nextListLine !== undefined &&
      previousListLine.listItemIndentText === nextListLine.listItemIndentText &&
      previousListLine.listItemMarkerText === nextListLine.listItemMarkerText &&
      previousListLine.listItemText === nextListLine.listItemText;
  });
}

function isAssistantMarkdownDiffFence(fencedCodeBlock: AssistantMarkdownFencedCodeBlock): boolean {
  return codeFenceDiffLanguagePattern.test(fencedCodeBlock.fenceInfoString.split(/\s+/)[0] ?? "");
}

function isAssistantMarkdownShellFence(fencedCodeBlock: AssistantMarkdownFencedCodeBlock): boolean {
  return codeFenceShellLanguagePattern.test(fencedCodeBlock.fenceInfoString.split(/\s+/)[0] ?? "");
}

function formatAssistantCodeFenceText(codeFenceLines: readonly string[]): string {
  return codeFenceLines.join("\n").replace(/\n*$/, "");
}

function trimAssistantMarkdownSectionBoundaryBlankLines(markdownLines: string[]): string[] {
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

function readAssistantMarkdownFencedCodeBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownFencedCodeBlock | undefined {
  const openingFenceMatch = fencedCodeBlockStartPattern.exec(markdownLines[startLineIndex] ?? "");
  const openingFenceMarker = openingFenceMatch?.[2];
  if (!openingFenceMarker) {
    return undefined;
  }

  const fenceCharacter = openingFenceMarker[0] ?? "`";
  for (let lineIndex = startLineIndex + 1; lineIndex < markdownLines.length; lineIndex += 1) {
    if (isFencedCodeBlockClosingLine(markdownLines[lineIndex] ?? "", fenceCharacter, openingFenceMarker.length)) {
      return {
        fenceInfoString: openingFenceMatch[3]?.trim() ?? "",
        fencedContentLines: markdownLines.slice(startLineIndex + 1, lineIndex),
        hasClosingFence: true,
        nextLineIndex: lineIndex + 1,
      };
    }
  }

  return {
    fenceInfoString: openingFenceMatch[3]?.trim() ?? "",
    fencedContentLines: markdownLines.slice(startLineIndex + 1),
    hasClosingFence: false,
    nextLineIndex: markdownLines.length,
  };
}

function isFencedCodeBlockClosingLine(
  markdownLine: string,
  fenceCharacter: string,
  minimumFenceLength: number,
): boolean {
  return new RegExp(`^ {0,3}${fenceCharacter}{${minimumFenceLength},}\\s*$`).test(markdownLine);
}

function resolveFencedUnifiedDiffText(fencedCodeBlock: AssistantMarkdownFencedCodeBlock): string | undefined {
  if (!fencedCodeBlock.hasClosingFence || !codeFenceDiffLanguagePattern.test(fencedCodeBlock.fenceInfoString.split(/\s+/)[0] ?? "")) {
    return undefined;
  }

  const candidateUnifiedDiffLines = trimAssistantMarkdownSectionBoundaryBlankLines(fencedCodeBlock.fencedContentLines);
  const unifiedDiffBlock = readAssistantMarkdownUnifiedDiffBlock(candidateUnifiedDiffLines, 0);
  if (!unifiedDiffBlock || unifiedDiffBlock.nextLineIndex !== candidateUnifiedDiffLines.length) {
    return undefined;
  }

  return formatAssistantUnifiedDiffText(unifiedDiffBlock.unifiedDiffLines);
}

function readAssistantMarkdownUnifiedDiffBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownUnifiedDiffBlock | undefined {
  if (!parseAssistantUnifiedDiffFileHeader(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const unifiedDiffLines: string[] = [];
  let lineIndex = startLineIndex;
  let hasHunkHeader = false;
  while (lineIndex < markdownLines.length) {
    const markdownLine = markdownLines[lineIndex] ?? "";
    if (markdownLine.length === 0) {
      break;
    }
    if (parseAssistantUnifiedDiffFileHeader(markdownLine) || isUnifiedDiffMetadataLine(markdownLine)) {
      unifiedDiffLines.push(markdownLine);
      lineIndex += 1;
      continue;
    }
    if (unifiedDiffHunkHeaderPattern.test(markdownLine)) {
      unifiedDiffLines.push(markdownLine);
      hasHunkHeader = true;
      lineIndex += 1;
      continue;
    }
    if (hasHunkHeader && isUnifiedDiffHunkBodyLine(markdownLine)) {
      unifiedDiffLines.push(markdownLine);
      lineIndex += 1;
      continue;
    }
    break;
  }

  if (!hasHunkHeader || !hasValidAssistantUnifiedDiffHunkLineCounts(unifiedDiffLines)) {
    return undefined;
  }
  return { unifiedDiffLines, nextLineIndex: lineIndex };
}

function readAssistantMarkdownRawDiffSnippetBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownRawDiffSnippetBlock | undefined {
  if (!parseAssistantUnifiedDiffFileHeader(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const diffSnippetLines: string[] = [];
  let lineIndex = startLineIndex;
  while (lineIndex < markdownLines.length) {
    const markdownLine = markdownLines[lineIndex] ?? "";
    if (markdownLine.length === 0) {
      break;
    }
    if (isRawDiffSnippetLine(markdownLine)) {
      diffSnippetLines.push(markdownLine);
      lineIndex += 1;
      continue;
    }
    break;
  }

  return diffSnippetLines.length > 0 ? { diffSnippetLines, nextLineIndex: lineIndex } : undefined;
}

function readAssistantMarkdownBlockquoteBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownBlockquoteBlock | undefined {
  if (!markdownBlockquoteLinePattern.test(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const quoteLines: string[] = [];
  let lineIndex = startLineIndex;
  while (lineIndex < markdownLines.length) {
    const blockquoteLineMatch = markdownBlockquoteLinePattern.exec(markdownLines[lineIndex] ?? "");
    if (!blockquoteLineMatch) {
      break;
    }
    quoteLines.push(blockquoteLineMatch[1] ?? "");
    lineIndex += 1;
  }

  return { quoteText: quoteLines.join("\n"), nextLineIndex: lineIndex };
}

function readAssistantMarkdownListBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownListBlock | undefined {
  if (!markdownListLinePattern.test(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const listMarkdownLines: string[] = [];
  let lineIndex = startLineIndex;
  while (lineIndex < markdownLines.length && markdownListLinePattern.test(markdownLines[lineIndex] ?? "")) {
    listMarkdownLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  return {
    listLines: formatAssistantMarkdownVisibleListLines(listMarkdownLines),
    nextLineIndex: lineIndex,
  };
}

function parseAssistantMarkdownListLine(markdownListLine: string): ParsedAssistantMarkdownListLine | undefined {
  const listLineMatch = markdownListLinePattern.exec(markdownListLine);
  if (!listLineMatch) {
    return undefined;
  }

  const listItemDepth = Math.floor((listLineMatch[1] ?? "").length / 2);
  const taskListState = listLineMatch[3];
  const orderedListMarkerText = listLineMatch[4];
  const unorderedListMarkerText = assistantMarkdownUnorderedListMarkers[listItemDepth % assistantMarkdownUnorderedListMarkers.length] ?? "-";
  const listItemMarkerText = taskListState !== undefined
    ? taskListState.toLowerCase() === "x" ? "☑" : "☐"
    : orderedListMarkerText ?? unorderedListMarkerText;
  return {
    listItemDepth,
    listItemMarkerText,
    listItemText: formatAssistantMarkdownInlineTextForStyledText((listLineMatch[5] ?? "").trim()),
  };
}

function formatAssistantMarkdownVisibleListLines(markdownListLines: readonly string[]): AssistantMarkdownVisibleListLine[] {
  const parsedListLines = markdownListLines
    .map(parseAssistantMarkdownListLine)
    .filter((listLine): listLine is ParsedAssistantMarkdownListLine => listLine !== undefined);
  const markerWidthByDepth = new Map<number, number>();
  for (const parsedListLine of parsedListLines) {
    markerWidthByDepth.set(
      parsedListLine.listItemDepth,
      Math.max(markerWidthByDepth.get(parsedListLine.listItemDepth) ?? 1, parsedListLine.listItemMarkerText.length),
    );
  }

  return parsedListLines.map((parsedListLine) => ({
    listItemIndentText: "  ".repeat(parsedListLine.listItemDepth),
    listItemMarkerText: parsedListLine.listItemMarkerText.padStart(markerWidthByDepth.get(parsedListLine.listItemDepth) ?? 1, " "),
    listItemText: parsedListLine.listItemText,
  }));
}

function isAssistantMarkdownTableStart(markdownLines: readonly string[], lineIndex: number): boolean {
  const tableHeaderLine = markdownLines[lineIndex] ?? "";
  const tableSeparatorLine = markdownLines[lineIndex + 1] ?? "";
  return tableHeaderLine.includes("|") && markdownTableSeparatorLinePattern.test(tableSeparatorLine);
}

function readAssistantMarkdownTableBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownTableBlock | undefined {
  if (!isAssistantMarkdownTableStart(markdownLines, startLineIndex)) {
    return undefined;
  }

  const tableLines: string[] = [];
  let lineIndex = startLineIndex;
  while (lineIndex < markdownLines.length && (markdownLines[lineIndex] ?? "").trim().length > 0) {
    tableLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  return {
    tableMarkdownText: tableLines.join("\n"),
    nextLineIndex: lineIndex,
  };
}

function isAssistantMarkdownCustomBlockStart(markdownLines: readonly string[], lineIndex: number): boolean {
  const markdownLine = markdownLines[lineIndex] ?? "";
  return (
    fencedCodeBlockStartPattern.test(markdownLine) ||
    markdownHeadingLinePattern.test(markdownLine) ||
    dashOnlyParagraphPattern.test(markdownLine.trim()) ||
    isAssistantMarkdownTableStart(markdownLines, lineIndex) ||
    markdownListLinePattern.test(markdownLine) ||
    markdownBlockquoteLinePattern.test(markdownLine) ||
    parseAssistantUnifiedDiffFileHeader(markdownLine) !== undefined ||
    isRawDiffSnippetLine(markdownLine)
  );
}

function readAssistantMarkdownParagraphBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownParagraphBlock | undefined {
  const firstParagraphLine = markdownLines[startLineIndex] ?? "";
  if (firstParagraphLine.trim().length === 0 || isAssistantMarkdownCustomBlockStart(markdownLines, startLineIndex)) {
    return undefined;
  }

  const paragraphLines: string[] = [];
  let lineIndex = startLineIndex;
  while (
    lineIndex < markdownLines.length &&
    (markdownLines[lineIndex] ?? "").trim().length > 0 &&
    !isAssistantMarkdownCustomBlockStart(markdownLines, lineIndex)
  ) {
    paragraphLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  return {
    paragraphText: formatAssistantMarkdownInlineTextForStyledText(paragraphLines.join(" ").trim()),
    nextLineIndex: lineIndex,
  };
}

function isRawDiffSnippetLine(markdownLine: string): boolean {
  return (
    parseAssistantUnifiedDiffFileHeader(markdownLine) !== undefined ||
    isUnifiedDiffMetadataLine(markdownLine) ||
    markdownLine.startsWith("@@") ||
    isUnifiedDiffHunkBodyLine(markdownLine)
  );
}

function hasValidAssistantUnifiedDiffHunkLineCounts(unifiedDiffLines: readonly string[]): boolean {
  let expectedHunkLineCounts: AssistantUnifiedDiffExpectedHunkLineCounts | undefined;
  let actualHunkLineCounts: AssistantUnifiedDiffActualHunkLineCounts = { oldLineCount: 0, newLineCount: 0 };
  let hasHunkHeader = false;

  const finishCurrentHunk = () => {
    if (!expectedHunkLineCounts) {
      return true;
    }
    const isValidHunk =
      actualHunkLineCounts.oldLineCount === expectedHunkLineCounts.oldLineCount &&
      actualHunkLineCounts.newLineCount === expectedHunkLineCounts.newLineCount;
    expectedHunkLineCounts = undefined;
    actualHunkLineCounts = { oldLineCount: 0, newLineCount: 0 };
    return isValidHunk;
  };

  for (const unifiedDiffLine of unifiedDiffLines) {
    const hunkHeaderLineCounts = parseAssistantUnifiedDiffHunkHeaderLineCounts(unifiedDiffLine);
    if (hunkHeaderLineCounts) {
      if (!finishCurrentHunk()) {
        return false;
      }
      expectedHunkLineCounts = hunkHeaderLineCounts;
      hasHunkHeader = true;
      continue;
    }

    if (parseAssistantUnifiedDiffFileHeader(unifiedDiffLine)) {
      if (!finishCurrentHunk()) {
        return false;
      }
      continue;
    }

    if (!expectedHunkLineCounts || unifiedDiffLine.startsWith("\\")) {
      continue;
    }
    if (unifiedDiffLine.startsWith(" ")) {
      actualHunkLineCounts.oldLineCount += 1;
      actualHunkLineCounts.newLineCount += 1;
      continue;
    }
    if (unifiedDiffLine.startsWith("-") && !unifiedDiffLine.startsWith("---")) {
      actualHunkLineCounts.oldLineCount += 1;
      continue;
    }
    if (unifiedDiffLine.startsWith("+") && !unifiedDiffLine.startsWith("+++")) {
      actualHunkLineCounts.newLineCount += 1;
    }
  }

  return hasHunkHeader && finishCurrentHunk();
}

function parseAssistantUnifiedDiffHunkHeaderLineCounts(
  unifiedDiffLine: string,
): AssistantUnifiedDiffExpectedHunkLineCounts | undefined {
  const hunkHeaderMatch = unifiedDiffHunkHeaderPattern.exec(unifiedDiffLine);
  if (!hunkHeaderMatch) {
    return undefined;
  }
  return {
    oldLineCount: hunkHeaderMatch[2] === undefined ? 1 : Number(hunkHeaderMatch[2]),
    newLineCount: hunkHeaderMatch[4] === undefined ? 1 : Number(hunkHeaderMatch[4]),
  };
}

function parseAssistantUnifiedDiffFileHeader(markdownLine: string): { beforePath: string; afterPath: string } | undefined {
  const unquotedFileHeaderMatch = unifiedDiffFileHeaderPattern.exec(markdownLine);
  if (unquotedFileHeaderMatch) {
    return {
      beforePath: unquotedFileHeaderMatch[1] ?? "",
      afterPath: unquotedFileHeaderMatch[2] ?? "",
    };
  }

  const quotedFileHeaderMatch = quotedUnifiedDiffFileHeaderPattern.exec(markdownLine);
  if (!quotedFileHeaderMatch) {
    return undefined;
  }
  return {
    beforePath: quotedFileHeaderMatch[1] ?? "",
    afterPath: quotedFileHeaderMatch[2] ?? "",
  };
}

function isUnifiedDiffMetadataLine(markdownLine: string): boolean {
  return unifiedDiffMetadataLinePrefixes.some((metadataLinePrefix) => markdownLine.startsWith(metadataLinePrefix));
}

function isUnifiedDiffHunkBodyLine(markdownLine: string): boolean {
  return markdownLine.startsWith(" ") || markdownLine.startsWith("+") || markdownLine.startsWith("-") || markdownLine.startsWith("\\");
}

function formatAssistantUnifiedDiffText(unifiedDiffLines: readonly string[]): string {
  return `${unifiedDiffLines.join("\n").replace(/\n*$/, "")}\n`;
}

function summarizeAssistantUnifiedDiffFiles(unifiedDiffText: string): AssistantUnifiedDiffFileSummary[] {
  const fileSummaries: AssistantUnifiedDiffFileSummary[] = [];
  let currentFileSummary: AssistantUnifiedDiffFileSummary | undefined;

  for (const unifiedDiffLine of unifiedDiffText.replace(/\n$/, "").split("\n")) {
    const fileHeader = parseAssistantUnifiedDiffFileHeader(unifiedDiffLine);
    if (fileHeader) {
      if (currentFileSummary) {
        fileSummaries.push(currentFileSummary);
      }
      currentFileSummary = {
        filePath: fileHeader.afterPath || fileHeader.beforePath,
        addedLineCount: 0,
        removedLineCount: 0,
      };
      continue;
    }

    if (!currentFileSummary) {
      continue;
    }
    if (unifiedDiffLine.startsWith("+") && !unifiedDiffLine.startsWith("+++")) {
      currentFileSummary.addedLineCount += 1;
      continue;
    }
    if (unifiedDiffLine.startsWith("-") && !unifiedDiffLine.startsWith("---")) {
      currentFileSummary.removedLineCount += 1;
    }
  }

  if (currentFileSummary) {
    fileSummaries.push(currentFileSummary);
  }
  return fileSummaries;
}

function summarizeAssistantDiffSnippet(input: {
  diffSnippetText: string;
  filePath?: string | undefined;
}): string {
  const { diffSnippetText } = input;
  const fileSummaries = summarizeAssistantUnifiedDiffFiles(diffSnippetText);
  if (fileSummaries.length === 1) {
    const fileSummary = fileSummaries[0]!;
    return `patch ${fileSummary.filePath} +${fileSummary.addedLineCount} -${fileSummary.removedLineCount}`;
  }

  if (fileSummaries.length > 1) {
    const addedLineCount = fileSummaries.reduce((sum, fileSummary) => sum + fileSummary.addedLineCount, 0);
    const removedLineCount = fileSummaries.reduce((sum, fileSummary) => sum + fileSummary.removedLineCount, 0);
    return `patch ${fileSummaries.length} files +${addedLineCount} -${removedLineCount}`;
  }

  const snippetLineCounts = countAssistantDiffSnippetChangedLines(diffSnippetText);
  const changedLineSummary = snippetLineCounts.addedLineCount > 0 || snippetLineCounts.removedLineCount > 0
    ? ` +${snippetLineCounts.addedLineCount} -${snippetLineCounts.removedLineCount}`
    : "";
  if (input.filePath) {
    return `patch ${input.filePath}${changedLineSummary}`;
  }
  return `patch snippet${changedLineSummary}`;
}

function countAssistantDiffSnippetChangedLines(diffSnippetText: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0;
  let removedLineCount = 0;
  for (const diffSnippetLine of diffSnippetText.replace(/\n$/, "").split("\n")) {
    if (diffSnippetLine.startsWith("+") && !diffSnippetLine.startsWith("+++")) {
      addedLineCount += 1;
      continue;
    }
    if (diffSnippetLine.startsWith("-") && !diffSnippetLine.startsWith("---")) {
      removedLineCount += 1;
    }
  }
  return { addedLineCount, removedLineCount };
}

function listVisibleAssistantDiffSnippetLines(diffSnippetText: string): string[] {
  return diffSnippetText
    .replace(/\n$/, "")
    .split("\n")
    .filter(shouldRenderAssistantDiffSnippetBodyLine);
}

function shouldRenderAssistantDiffSnippetBodyLine(diffSnippetLine: string): boolean {
  if (parseAssistantUnifiedDiffFileHeader(diffSnippetLine)) {
    return false;
  }
  if (isUnifiedDiffMetadataLine(diffSnippetLine)) {
    return false;
  }
  if (diffSnippetLine.trim() === "@@") {
    return false;
  }
  return true;
}

function resolveAssistantDiffSnippetLineColor(diffSnippetLine: string): string {
  if (diffSnippetLine.startsWith("+") && !diffSnippetLine.startsWith("+++")) {
    return githubLikeTerminalCodeColors.diffAddition;
  }
  if (diffSnippetLine.startsWith("-") && !diffSnippetLine.startsWith("---")) {
    return githubLikeTerminalCodeColors.diffRemoval;
  }
  if (diffSnippetLine.startsWith("@@")) {
    return githubLikeTerminalCodeColors.diffMetadata;
  }
  return githubLikeTerminalCodeColors.foreground;
}

function resolveAssistantDiffSnippetFilePath(diffSnippetText: string): string | undefined {
  for (const diffSnippetLine of diffSnippetText.replace(/\n$/, "").split("\n")) {
    const fileHeader = parseAssistantUnifiedDiffFileHeader(diffSnippetLine);
    if (fileHeader) {
      return fileHeader.afterPath || fileHeader.beforePath;
    }
  }
  return undefined;
}

function listAssistantDiffSnippetPatchBodyLines(diffSnippetText: string): string[] {
  return diffSnippetText
    .replace(/\n$/, "")
    .split("\n")
    .filter((diffSnippetLine) => {
      if (parseAssistantUnifiedDiffFileHeader(diffSnippetLine)) {
        return false;
      }
      if (isUnifiedDiffMetadataLine(diffSnippetLine)) {
        return false;
      }
      if (diffSnippetLine.startsWith("@@")) {
        return false;
      }
      return isUnifiedDiffHunkBodyLine(diffSnippetLine);
    });
}

function countAssistantDiffSnippetPatchBodyLineRanges(diffSnippetBodyLines: readonly string[]): {
  oldLineCount: number;
  newLineCount: number;
} {
  let oldLineCount = 0;
  let newLineCount = 0;
  for (const diffSnippetBodyLine of diffSnippetBodyLines) {
    if (diffSnippetBodyLine.startsWith("+") && !diffSnippetBodyLine.startsWith("+++")) {
      newLineCount += 1;
      continue;
    }
    if (diffSnippetBodyLine.startsWith("-") && !diffSnippetBodyLine.startsWith("---")) {
      oldLineCount += 1;
      continue;
    }
    oldLineCount += 1;
    newLineCount += 1;
  }
  return { oldLineCount, newLineCount };
}

function buildAssistantDiffSnippetUnifiedDiff(input: {
  diffSnippetText: string;
  filePath?: string | undefined;
}): { filePath: string; unifiedDiffText: string } | undefined {
  const filePath = input.filePath ?? resolveAssistantDiffSnippetFilePath(input.diffSnippetText);
  if (!filePath) {
    return undefined;
  }

  const diffSnippetBodyLines = listAssistantDiffSnippetPatchBodyLines(input.diffSnippetText);
  if (diffSnippetBodyLines.length === 0) {
    return undefined;
  }

  const { oldLineCount, newLineCount } = countAssistantDiffSnippetPatchBodyLineRanges(diffSnippetBodyLines);
  if (oldLineCount === 0 && newLineCount === 0) {
    return undefined;
  }

  const oldStartLineNumber = oldLineCount === 0 ? 0 : 1;
  const newStartLineNumber = newLineCount === 0 ? 0 : 1;
  return {
    filePath,
    unifiedDiffText: [
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      `@@ -${oldStartLineNumber},${oldLineCount} +${newStartLineNumber},${newLineCount} @@`,
      ...diffSnippetBodyLines,
      "",
    ].join("\n"),
  };
}

function AssistantMarkdownTextSection(props: {
  isStreaming: boolean;
  markdownText: string;
  renderNode: NonNullable<MarkdownOptions["renderNode"]>;
}): ReactNode {
  return (
    <markdown
      bg={chatScreenTheme.bg}
      conceal={true}
      concealCode={false}
      content={props.markdownText}
      fg={chatScreenTheme.textPrimary}
      internalBlockMode="top-level"
      renderNode={props.renderNode}
      streaming={props.isStreaming}
      syntaxStyle={assistantMarkdownSyntaxStyle}
      tableOptions={{
        borders: true,
        borderColor: chatScreenTheme.borderSubtle,
        borderStyle: "single",
        cellPadding: 0,
        columnFitter: "balanced",
        outerBorder: true,
        selectable: true,
        style: "grid",
        widthMode: "content",
        wrapMode: "word",
      }}
      treeSitterClient={openTuiSharedTreeSitterClient}
      width="100%"
    />
  );
}

function AssistantMarkdownParagraphBlock(props: { paragraphText: string }): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <text fg={chatScreenTheme.textPrimary} wrapMode="word">
        <AssistantMarkdownInlineText inlineText={props.paragraphText} />
      </text>
    </box>
  );
}

function resolveAssistantMarkdownHeadingForegroundColor(headingDepth: number): string {
  if (headingDepth === 1) return chatScreenTheme.accentCyan;
  if (headingDepth === 2) return chatScreenTheme.accentAmber;
  if (headingDepth === 3) return chatScreenTheme.accentPurple;
  return chatScreenTheme.textPrimary;
}

function formatAssistantMarkdownVisibleHeadingText(input: { headingDepth: number; headingText: string }): string {
  if (input.headingDepth === 1) {
    return `▌ ${input.headingText}`;
  }
  if (input.headingDepth === 2) {
    return `◆ ${input.headingText}`;
  }
  if (input.headingDepth === 3) {
    return input.headingText;
  }
  return `• ${input.headingText}`;
}

function AssistantMarkdownHeadingBlock(props: { headingDepth: number; headingText: string }): ReactNode {
  const headingForegroundColor = resolveAssistantMarkdownHeadingForegroundColor(props.headingDepth);
  return (
    <box marginBottom={1} width="100%">
      <text fg={headingForegroundColor} wrapMode="word">
        <AssistantMarkdownInlineText
          attributes={TextAttributes.BOLD}
          foregroundColor={headingForegroundColor}
          inlineText={formatAssistantMarkdownVisibleHeadingText(props)}
        />
      </text>
    </box>
  );
}

function AssistantMarkdownHorizontalRuleBlock(props: { horizontalRuleText: string; horizontalRuleColor: string }): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <text fg={props.horizontalRuleColor} wrapMode="none">
        {props.horizontalRuleText}
      </text>
    </box>
  );
}

function AssistantMarkdownTableBlock(props: {
  isStreaming: boolean;
  renderNode: NonNullable<MarkdownOptions["renderNode"]>;
  tableMarkdownText: string;
}): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <markdown
        bg={chatScreenTheme.bg}
        conceal={true}
        concealCode={false}
        content={props.tableMarkdownText}
        fg={chatScreenTheme.textPrimary}
        renderNode={props.renderNode}
        streaming={props.isStreaming}
        syntaxStyle={assistantMarkdownSyntaxStyle}
        tableOptions={{
          borders: true,
          borderColor: chatScreenTheme.borderSubtle,
          borderStyle: "single",
          cellPadding: 0,
          columnFitter: "balanced",
          outerBorder: true,
          selectable: true,
          style: "grid",
          widthMode: "content",
          wrapMode: "word",
        }}
        treeSitterClient={openTuiSharedTreeSitterClient}
        width="100%"
      />
    </box>
  );
}

function resolveAssistantMarkdownVisibleListMarkerColor(listItemMarkerText: string): string {
  const trimmedListItemMarkerText = listItemMarkerText.trim();
  if (trimmedListItemMarkerText === "☑") {
    return chatScreenTheme.accentGreen;
  }
  if (trimmedListItemMarkerText === "☐") {
    return chatScreenTheme.textDim;
  }
  if (/^\d+\.$/.test(trimmedListItemMarkerText)) {
    return chatScreenTheme.accentAmber;
  }

  const unorderedListMarkerIndex = assistantMarkdownUnorderedListMarkers.indexOf(
    trimmedListItemMarkerText as (typeof assistantMarkdownUnorderedListMarkers)[number],
  );
  return [
    chatScreenTheme.accentPrimaryMuted,
    chatScreenTheme.accentCyan,
    chatScreenTheme.accentAmber,
    chatScreenTheme.accentPurple,
  ][unorderedListMarkerIndex] ?? chatScreenTheme.textMuted;
}

function AssistantMarkdownListBlock(props: {
  listLines: readonly AssistantMarkdownVisibleListLine[];
  hasLeadingBlankLine: boolean;
}): ReactNode {
  return (
    <box flexDirection="column" marginBottom={1} {...(props.hasLeadingBlankLine ? { marginTop: 1 } : {})} width="100%">
      {props.listLines.map((listLine, index) => (
        <box key={`assistant-list-line-${index}`} width="100%">
          <text fg={chatScreenTheme.textPrimary} wrapMode="word">
            {listLine.listItemIndentText}
            <span
              attributes={TextAttributes.BOLD}
              fg={resolveAssistantMarkdownVisibleListMarkerColor(listLine.listItemMarkerText)}
            >
              {listLine.listItemMarkerText}
            </span>
            {" "}
            <AssistantMarkdownInlineText decorationProfile="prose" inlineText={listLine.listItemText} />
          </text>
        </box>
      ))}
    </box>
  );
}

function AssistantMarkdownQuoteBlock(props: { quoteText: string }): ReactNode {
  const assistantMarkdownCallout = parseAssistantMarkdownCallout(props.quoteText);
  if (assistantMarkdownCallout) {
    return <AssistantMarkdownCalloutBlock {...assistantMarkdownCallout} />;
  }

  return (
    <box
      border={["left"]}
      borderColor={chatScreenTheme.textDim}
      flexDirection="column"
      marginBottom={1}
      paddingX={1}
      width="100%"
    >
      {props.quoteText.trim().split("\n").map((quoteLine, index) => (
        <box key={`assistant-quote-line-${index}`} width="100%">
          <text fg={chatScreenTheme.textSecondary} wrapMode="word">
            <AssistantMarkdownInlineText
              foregroundColor={chatScreenTheme.textSecondary}
              inlineText={formatAssistantMarkdownInlineTextForStyledText(quoteLine)}
            />
          </text>
        </box>
      ))}
    </box>
  );
}

function AssistantMarkdownCalloutBlock(props: { calloutKind: AssistantMarkdownCalloutKind; bodyText: string }): ReactNode {
  const calloutForegroundColor = {
    NOTE: chatScreenTheme.accentCyan,
    TIP: chatScreenTheme.accentGreen,
    IMPORTANT: chatScreenTheme.accentPurple,
    WARNING: chatScreenTheme.accentAmber,
    CAUTION: chatScreenTheme.accentRed,
  }[props.calloutKind];
  const bodyLines = props.bodyText.trim().length > 0 ? props.bodyText.trim().split("\n") : [];

  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      <text fg={calloutForegroundColor}>
        <span attributes={TextAttributes.BOLD} fg={calloutForegroundColor}>{`▌ ${props.calloutKind}`}</span>
      </text>
      <text fg={calloutForegroundColor}>{"├" + "─".repeat(Math.max(12, props.calloutKind.length + 2))}</text>
      {bodyLines.map((bodyLine, index) => (
        <box key={`assistant-callout-line-${index}`} width="100%">
          <text fg={calloutForegroundColor} wrapMode="word">
            <span fg={calloutForegroundColor}>│ </span>
            <AssistantMarkdownInlineText
              foregroundColor={calloutForegroundColor}
              inlineText={formatAssistantMarkdownInlineTextForStyledText(bodyLine)}
            />
          </text>
        </box>
      ))}
    </box>
  );
}

function applyAssistantMarkdownFlowSpacing(defaultRenderable: CodeRenderable): void {
  defaultRenderable.marginBottom = 1;
}

function AssistantUnifiedDiffBlock(props: { unifiedDiffText: string }): ReactNode {
  const fileSummaries = summarizeAssistantUnifiedDiffFiles(props.unifiedDiffText);
  const singleDiffFilePath = fileSummaries.length === 1 ? fileSummaries[0]?.filePath : undefined;
  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      {fileSummaries.length > 0 ? (
        <box flexDirection="column" paddingX={1} width="100%">
          {fileSummaries.map((fileSummary) => (
            <box gap={1} key={fileSummary.filePath} width="100%">
              <text fg={chatScreenTheme.textMuted}>patch</text>
              <text fg={chatScreenTheme.accentCyan}>{fileSummary.filePath}</text>
              <text fg={chatScreenTheme.accentGreen}>{`+${fileSummary.addedLineCount}`}</text>
              <text fg={chatScreenTheme.accentRed}>{`-${fileSummary.removedLineCount}`}</text>
            </box>
          ))}
        </box>
      ) : null}
      <DiffBlock
        unifiedDiffText={props.unifiedDiffText}
        {...(singleDiffFilePath !== undefined ? { filePath: singleDiffFilePath } : {})}
      />
    </box>
  );
}

function AssistantSnippetFrame(props: {
  accentColor?: string | undefined;
  children: ReactNode;
  headerText?: string | undefined;
}): ReactNode {
  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      <box
        border={["left"]}
        borderColor={props.accentColor ?? chatScreenTheme.borderSubtle}
        flexDirection="column"
        paddingX={1}
        width="100%"
      >
        {props.headerText ? (
          <box width="100%">
            <text fg={chatScreenTheme.textDim}>{props.headerText}</text>
          </box>
        ) : null}
        {props.children}
      </box>
    </box>
  );
}

function AssistantDiffSnippetBlock(props: {
  diffSnippetText: string;
  filePath?: string | undefined;
}): ReactNode {
  const normalizedDiffSnippet = buildAssistantDiffSnippetUnifiedDiff(props);
  const headerText = summarizeAssistantDiffSnippet({
    diffSnippetText: props.diffSnippetText,
    filePath: props.filePath,
  });

  if (normalizedDiffSnippet) {
    return (
      <AssistantSnippetFrame accentColor={chatScreenTheme.accentPrimaryMuted} headerText={headerText}>
        <DiffBlock
          density="compact"
          filePath={normalizedDiffSnippet.filePath}
          unifiedDiffText={normalizedDiffSnippet.unifiedDiffText}
        />
      </AssistantSnippetFrame>
    );
  }

  const diffSnippetLines = listVisibleAssistantDiffSnippetLines(props.diffSnippetText);
  return (
    <AssistantSnippetFrame accentColor={chatScreenTheme.accentPrimaryMuted} headerText={headerText}>
      {diffSnippetLines.map((diffSnippetLine, index) => (
        <box key={`assistant-diff-snippet-line-${index}`} width="100%">
          <text fg={resolveAssistantDiffSnippetLineColor(diffSnippetLine)} wrapMode="none">
            {diffSnippetLine}
          </text>
        </box>
      ))}
    </AssistantSnippetFrame>
  );
}

function AssistantShellSnippetBlock(props: { shellSnippetText: string }): ReactNode {
  const shellSnippetLines = props.shellSnippetText.split("\n");
  return (
    <AssistantSnippetFrame accentColor={chatScreenTheme.accentGreen}>
      {shellSnippetLines.map((shellSnippetLine, index) => (
        <box key={`assistant-shell-snippet-line-${index}`} width="100%">
          <text wrapMode="none">
            {shellSnippetLine.trim().length > 0 ? (
              <>
                <span fg={chatScreenTheme.accentGreen}>$ </span>
                <span fg={githubLikeTerminalCodeColors.foreground}>{shellSnippetLine}</span>
              </>
            ) : ""}
          </text>
        </box>
      ))}
    </AssistantSnippetFrame>
  );
}

function AssistantCodeFenceBlock(props: {
  codeFenceInfo: AssistantMarkdownCodeFenceInfo;
  codeFenceText: string;
}): ReactNode {
  const codeFenceLines = props.codeFenceText.split("\n");
  const visibleCodeFenceLines = codeFenceLines.length === 1 && codeFenceLines[0] === "" ? [] : codeFenceLines;
  return (
    <AssistantSnippetFrame headerText={props.codeFenceInfo.codeFenceDisplayLabel}>
      <FencedCodeBlock
        variant="embedded"
        codeLines={visibleCodeFenceLines.map((lineText) => ({ lineText }))}
        {...(props.codeFenceInfo.codeFenceFilePath !== undefined ? { filePath: props.codeFenceInfo.codeFenceFilePath } : {})}
        languageLabel={props.codeFenceInfo.codeLanguageLabel}
        showLabel={false}
        wrapMode="none"
      />
    </AssistantSnippetFrame>
  );
}

const MemoizedAssistantCodeFenceBlock = memo(AssistantCodeFenceBlock, (previousProps, nextProps) => {
  return previousProps.codeFenceText === nextProps.codeFenceText &&
    areAssistantMarkdownCodeFenceInfoValuesEqual(previousProps.codeFenceInfo, nextProps.codeFenceInfo);
});
const MemoizedAssistantMarkdownParagraphBlock = memo(AssistantMarkdownParagraphBlock);
const MemoizedAssistantMarkdownHeadingBlock = memo(AssistantMarkdownHeadingBlock);
const MemoizedAssistantMarkdownHorizontalRuleBlock = memo(AssistantMarkdownHorizontalRuleBlock);
const MemoizedAssistantMarkdownTableBlock = memo(AssistantMarkdownTableBlock);
const MemoizedAssistantMarkdownListBlock = memo(AssistantMarkdownListBlock, (previousProps, nextProps) => {
  return previousProps.hasLeadingBlankLine === nextProps.hasLeadingBlankLine &&
    areAssistantMarkdownVisibleListLinesEqual(previousProps.listLines, nextProps.listLines);
});
const MemoizedAssistantMarkdownQuoteBlock = memo(AssistantMarkdownQuoteBlock);
const MemoizedAssistantUnifiedDiffBlock = memo(AssistantUnifiedDiffBlock);
const MemoizedAssistantDiffSnippetBlock = memo(AssistantDiffSnippetBlock);
const MemoizedAssistantShellSnippetBlock = memo(AssistantShellSnippetBlock);

export function AssistantMarkdownBlock(props: AssistantMarkdownBlockProps): ReactNode {
  const renderSectionCacheRef = useRef<AssistantMarkdownRenderSectionCache | undefined>(undefined);
  const terminalColumnCount = props.terminalColumnCount ?? defaultAssistantMarkdownTerminalColumnCount;
  const markdownChromeColumnCount = Math.max(20, terminalColumnCount - 4);
  const horizontalRuleText = useMemo(
    () => repeatAssistantMarkdownChromeRule({ availableColumnCount: markdownChromeColumnCount }),
    [markdownChromeColumnCount],
  );
  const assistantMarkdownRenderSections = useMemo(
    () => {
      const stableRenderSections = buildStableAssistantMarkdownRenderSections({
        markdownText: props.markdownText,
        isStreaming: props.isStreaming,
        previousCache: renderSectionCacheRef.current,
      });
      renderSectionCacheRef.current = stableRenderSections.nextCache;
      return stableRenderSections.renderSections;
    },
    [props.isStreaming, props.markdownText],
  );
  const horizontalRuleSyntaxStyle = useMemo(
    () => SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(props.horizontalRuleColor) } }),
    [props.horizontalRuleColor],
  );

  const renderMarkdownNodeWithBuliChromeEnhancements = useCallback<NonNullable<MarkdownOptions["renderNode"]>>((token, context) => {
    const defaultRenderable = context.defaultRender();

    if (defaultRenderable instanceof CodeRenderable) {
      defaultRenderable.drawUnstyledText = true;

      if (isAssistantMarkdownCodeToken(token)) {
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      if (isAssistantMarkdownHeadingToken(token)) {
        // Leading newline gives breathing room before each heading, including after an HR.
        defaultRenderable.content = formatAssistantMarkdownHeadingText(token.text, token.depth);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.syntaxStyle = resolveAssistantMarkdownHeadingSyntaxStyle(token.depth);
        return defaultRenderable;
      }

      if (isAssistantMarkdownBlockquoteToken(token)) {
        const assistantMarkdownCallout = parseAssistantMarkdownCallout(token.text);
        defaultRenderable.content = assistantMarkdownCallout
          ? formatAssistantMarkdownCalloutText(assistantMarkdownCallout)
          : formatAssistantMarkdownQuoteText(token.text);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.syntaxStyle = assistantMarkdownCallout
          ? assistantMarkdownCalloutSyntaxStyleByKind[assistantMarkdownCallout.calloutKind]
          : assistantMarkdownQuoteSyntaxStyle;
        return defaultRenderable;
      }

      if (isAssistantMarkdownListToken(token)) {
        defaultRenderable.content = formatAssistantMarkdownListText(token);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownListChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.syntaxStyle = assistantMarkdownTaskListSyntaxStyle;
        return defaultRenderable;
      }

      if (token.type === "hr" || isAssistantMarkdownDashOnlyParagraphToken(token)) {
        // Dash-only paragraphs slip through during streaming before the parser classifies
        // them as `hr`. Render both the same way to avoid raw `---` leaking on screen.
        defaultRenderable.content = horizontalRuleText;
        defaultRenderable.filetype = "text";
        defaultRenderable.syntaxStyle = horizontalRuleSyntaxStyle;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.wrapMode = "none";
        return defaultRenderable;
      }

      if (isAssistantMarkdownParagraphToken(token)) {
        defaultRenderable.content = formatAssistantMarkdownInlineTextForStyledText(token.text);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
    }

    return defaultRenderable;
  }, [horizontalRuleSyntaxStyle, horizontalRuleText]);

  return (
    <box flexDirection="column" width="100%">
      {assistantMarkdownRenderSections.map((assistantMarkdownRenderSection) => (
        assistantMarkdownRenderSection.sectionKind === "markdown" ? (
          <AssistantMarkdownTextSection
            isStreaming={props.isStreaming}
            key={assistantMarkdownRenderSection.sectionKey}
            markdownText={assistantMarkdownRenderSection.markdownText}
            renderNode={renderMarkdownNodeWithBuliChromeEnhancements}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "paragraph" ? (
          <MemoizedAssistantMarkdownParagraphBlock
            key={assistantMarkdownRenderSection.sectionKey}
            paragraphText={assistantMarkdownRenderSection.paragraphText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "heading" ? (
          <MemoizedAssistantMarkdownHeadingBlock
            headingDepth={assistantMarkdownRenderSection.headingDepth}
            headingText={assistantMarkdownRenderSection.headingText}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "horizontalRule" ? (
          <MemoizedAssistantMarkdownHorizontalRuleBlock
            horizontalRuleColor={props.horizontalRuleColor}
            horizontalRuleText={horizontalRuleText}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "table" ? (
          <MemoizedAssistantMarkdownTableBlock
            isStreaming={props.isStreaming}
            key={assistantMarkdownRenderSection.sectionKey}
            renderNode={renderMarkdownNodeWithBuliChromeEnhancements}
            tableMarkdownText={assistantMarkdownRenderSection.tableMarkdownText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "codeFence" ? (
          <MemoizedAssistantCodeFenceBlock
            codeFenceInfo={assistantMarkdownRenderSection.codeFenceInfo}
            codeFenceText={assistantMarkdownRenderSection.codeFenceText}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "list" ? (
          <MemoizedAssistantMarkdownListBlock
            hasLeadingBlankLine={assistantMarkdownRenderSection.hasLeadingBlankLine}
            key={assistantMarkdownRenderSection.sectionKey}
            listLines={assistantMarkdownRenderSection.listLines}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "blockquote" ? (
          <MemoizedAssistantMarkdownQuoteBlock
            key={assistantMarkdownRenderSection.sectionKey}
            quoteText={assistantMarkdownRenderSection.quoteText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "unifiedDiff" ? (
          <MemoizedAssistantUnifiedDiffBlock
            key={assistantMarkdownRenderSection.sectionKey}
            unifiedDiffText={assistantMarkdownRenderSection.unifiedDiffText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "shellSnippet" ? (
          <MemoizedAssistantShellSnippetBlock
            key={assistantMarkdownRenderSection.sectionKey}
            shellSnippetText={assistantMarkdownRenderSection.shellSnippetText}
          />
        ) : (
          <MemoizedAssistantDiffSnippetBlock
            diffSnippetText={assistantMarkdownRenderSection.diffSnippetText}
            {...(assistantMarkdownRenderSection.filePath !== undefined
              ? { filePath: assistantMarkdownRenderSection.filePath }
              : {})}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        )
      ))}
    </box>
  );
}
