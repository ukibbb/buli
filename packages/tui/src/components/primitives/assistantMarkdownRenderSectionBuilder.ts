import { areAssistantMarkdownCodeFenceInfoValuesEqual, parseAssistantMarkdownCodeFenceInfo } from "./assistantMarkdownCodeFenceInfo.ts";
import {
  formatAssistantUnifiedDiffText,
  isAssistantMarkdownDiffLikeLine,
  readAssistantMarkdownRawDiffSnippetBlock,
  readAssistantMarkdownUnifiedDiffBlock,
} from "./assistantMarkdownDiffSections.ts";
import {
  areAssistantMarkdownVisibleListLinesEqual,
  assistantMarkdownListLinePattern,
  readAssistantMarkdownListBlock,
} from "./assistantMarkdownListSections.ts";
import type {
  AssistantMarkdownRenderSection,
  AssistantMarkdownRenderSectionCache,
} from "./assistantMarkdownRenderSectionTypes.ts";
import {
  assistantMarkdownDashOnlyParagraphPattern,
  formatAssistantMarkdownInlineTextForStyledText,
  formatStreamingAssistantMarkdownInlineTextForStyledText,
} from "./assistantMarkdownTextFormatting.ts";

const codeFenceDiffLanguagePattern = /^(?:diff|patch)$/i;
const codeFenceShellLanguagePattern = /^(?:bash|sh|shell|zsh)$/i;
const fencedCodeBlockStartPattern = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const incompleteStreamingFencePattern = /^\s*(?:`{3,}[^`]*|~{3,}[^~]*)$/;
const incompleteStreamingListMarkerPattern = /^\s*(?:[-*+]\s*(?:\[[ xX]?\]?)?|\d+\.)\s*$/;
const incompleteStreamingHeadingPattern = /^\s*#{1,6}\s*$/;
const markdownHeadingLinePattern = /^(#{1,6})\s+(.+)$/;
const markdownBlockquoteLinePattern = /^\s*>\s?(.*)$/;
const markdownTableSeparatorLinePattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

type AssistantMarkdownFencedCodeBlock = {
  fenceInfoString: string;
  fencedContentLines: string[];
  hasClosingFence: boolean;
  nextLineIndex: number;
};

type AssistantMarkdownBlockquoteBlock = {
  quoteText: string;
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

export type AssistantMarkdownRenderSectionBuildRequest = {
  markdownText: string;
  isStreaming: boolean;
  previousCache: AssistantMarkdownRenderSectionCache | undefined;
};

export type AssistantMarkdownRenderSectionBuildResult = {
  renderSections: readonly AssistantMarkdownRenderSection[];
  nextCache: AssistantMarkdownRenderSectionCache;
};

export interface AssistantMarkdownRenderSectionBuilder {
  buildStableAssistantMarkdownRenderSections(
    input: AssistantMarkdownRenderSectionBuildRequest,
  ): AssistantMarkdownRenderSectionBuildResult;
}

export class TypeScriptAssistantMarkdownRenderSectionBuilder implements AssistantMarkdownRenderSectionBuilder {
  buildStableAssistantMarkdownRenderSections(
    input: AssistantMarkdownRenderSectionBuildRequest,
  ): AssistantMarkdownRenderSectionBuildResult {
    return buildStableAssistantMarkdownRenderSectionsWithTypeScriptBuilder(input);
  }
}

const defaultAssistantMarkdownRenderSectionBuilder = new TypeScriptAssistantMarkdownRenderSectionBuilder();

export function createAssistantMarkdownRenderSectionCache(): AssistantMarkdownRenderSectionCache {
  return { renderSections: [] };
}

export function buildStableAssistantMarkdownRenderSections(
  input: AssistantMarkdownRenderSectionBuildRequest,
): AssistantMarkdownRenderSectionBuildResult {
  return defaultAssistantMarkdownRenderSectionBuilder.buildStableAssistantMarkdownRenderSections(input);
}

function buildStableAssistantMarkdownRenderSectionsWithTypeScriptBuilder(
  input: AssistantMarkdownRenderSectionBuildRequest,
): AssistantMarkdownRenderSectionBuildResult {
  const preparedMarkdownText = prepareAssistantMarkdownTextForRendering(input.markdownText, input.isStreaming);
  const nextRenderSections = splitAssistantMarkdownTextIntoRenderSections(preparedMarkdownText, input.isStreaming);
  const previousRenderSections = input.previousCache?.renderSections ?? [];
  let previousRenderSectionsByKey: Map<string, AssistantMarkdownRenderSection> | undefined;
  const readPreviousRenderSectionByKey = (sectionKey: string): AssistantMarkdownRenderSection | undefined => {
    if (previousRenderSections.length === 0) {
      return undefined;
    }

    previousRenderSectionsByKey ??= new Map(
      previousRenderSections.map((renderSection) => [renderSection.sectionKey, renderSection]),
    );
    return previousRenderSectionsByKey.get(sectionKey);
  };
  const stableRenderSections = nextRenderSections.map((nextRenderSection, sectionIndex) => {
    const previousRenderSectionAtIndex = previousRenderSections[sectionIndex];
    const previousRenderSection = previousRenderSectionAtIndex?.sectionKey === nextRenderSection.sectionKey
      ? previousRenderSectionAtIndex
      : readPreviousRenderSectionByKey(nextRenderSection.sectionKey);
    return previousRenderSection && areAssistantMarkdownRenderSectionsEqual(previousRenderSection, nextRenderSection)
      ? previousRenderSection
      : nextRenderSection;
  });

  return {
    renderSections: stableRenderSections,
    nextCache: { renderSections: stableRenderSections },
  };
}

function prepareAssistantMarkdownTextForRendering(markdownText: string, isStreaming: boolean): string {
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

  return markdownText;
}

function splitAssistantMarkdownTextIntoRenderSections(
  markdownText: string,
  isStreaming: boolean,
): AssistantMarkdownRenderSection[] {
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
        headingText: formatAssistantMarkdownInlineTextForRender(headingLineMatch[2] ?? "", isStreaming),
      });
      lineIndex += 1;
      continue;
    }

    if (assistantMarkdownDashOnlyParagraphPattern.test((markdownLines[lineIndex] ?? "").trim())) {
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

    const listBlock = readAssistantMarkdownListBlock(markdownLines, lineIndex, isStreaming);
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

    const blockquoteBlock = readAssistantMarkdownBlockquoteBlock(markdownLines, lineIndex, isStreaming);
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

    const paragraphBlock = readAssistantMarkdownParagraphBlock(markdownLines, lineIndex, isStreaming);
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

function isAssistantMarkdownDiffFence(fencedCodeBlock: AssistantMarkdownFencedCodeBlock): boolean {
  return codeFenceDiffLanguagePattern.test(fencedCodeBlock.fenceInfoString.split(/\s+/)[0] ?? "");
}

function isAssistantMarkdownShellFence(fencedCodeBlock: AssistantMarkdownFencedCodeBlock): boolean {
  return codeFenceShellLanguagePattern.test(fencedCodeBlock.fenceInfoString.split(/\s+/)[0] ?? "");
}

function formatAssistantCodeFenceText(codeFenceLines: readonly string[]): string {
  return codeFenceLines.join("\n").replace(/\n*$/, "");
}

function trimAssistantMarkdownSectionBoundaryBlankLines(markdownLines: readonly string[]): string[] {
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

function formatAssistantMarkdownInlineTextForRender(inlineMarkdownText: string, isStreaming: boolean): string {
  return isStreaming
    ? formatStreamingAssistantMarkdownInlineTextForStyledText(inlineMarkdownText)
    : formatAssistantMarkdownInlineTextForStyledText(inlineMarkdownText);
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

function readAssistantMarkdownBlockquoteBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
  isStreaming: boolean,
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
    quoteLines.push(formatAssistantMarkdownInlineTextForRender(blockquoteLineMatch[1] ?? "", isStreaming));
    lineIndex += 1;
  }

  return { quoteText: quoteLines.join("\n"), nextLineIndex: lineIndex };
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
  while (lineIndex < markdownLines.length && isAssistantMarkdownTableRowLine(markdownLines[lineIndex] ?? "")) {
    tableLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  return {
    tableMarkdownText: tableLines.join("\n"),
    nextLineIndex: lineIndex,
  };
}

function isAssistantMarkdownTableRowLine(markdownLine: string): boolean {
  return markdownLine.trim().length > 0 && markdownLine.includes("|");
}

function isAssistantMarkdownCustomBlockStart(markdownLines: readonly string[], lineIndex: number): boolean {
  const markdownLine = markdownLines[lineIndex] ?? "";
  return (
    fencedCodeBlockStartPattern.test(markdownLine) ||
    markdownHeadingLinePattern.test(markdownLine) ||
    assistantMarkdownDashOnlyParagraphPattern.test(markdownLine.trim()) ||
    isAssistantMarkdownTableStart(markdownLines, lineIndex) ||
    assistantMarkdownListLinePattern.test(markdownLine) ||
    markdownBlockquoteLinePattern.test(markdownLine) ||
    isAssistantMarkdownDiffLikeLine(markdownLine)
  );
}

function readAssistantMarkdownParagraphBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
  isStreaming: boolean,
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
    paragraphText: formatAssistantMarkdownInlineTextForRender(paragraphLines.join(" ").trim(), isStreaming),
    nextLineIndex: lineIndex,
  };
}
