import { areAssistantMarkdownCodeFenceInfoValuesEqual, parseAssistantMarkdownCodeFenceInfo } from "./assistantMarkdownCodeFenceInfo.ts";
import {
  formatAssistantUnifiedDiffText,
  readAssistantMarkdownRawDiffSnippetBlock,
  readAssistantMarkdownUnifiedDiffBlock,
} from "./assistantMarkdownDiffSections.ts";
import {
  areAssistantMarkdownVisibleListLinesEqual,
  readAssistantMarkdownListBlock,
} from "./assistantMarkdownListSections.ts";
import type {
  AssistantMarkdownRenderSection,
  AssistantMarkdownRenderSectionCache,
} from "./assistantMarkdownRenderSectionTypes.ts";
import {
  formatAssistantMarkdownInlineTextForStyledText,
  formatStreamingAssistantMarkdownInlineTextForStyledText,
} from "./assistantMarkdownTextFormatting.ts";

const codeFenceDiffLanguagePattern = /^(?:diff|patch)$/i;
const codeFenceShellLanguagePattern = /^(?:bash|sh|shell|zsh)$/i;
const fencedCodeBlockStartPattern = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const incompleteStreamingFencePattern = /^\s*(?:`{3,}[^`]*|~{3,}[^~]*)$/;
const incompleteStreamingListMarkerPattern = /^\s*(?:[-*+]\s*(?:\[[ xX]?\]?)?|\d+\.)\s*$/;
const incompleteStreamingHeadingPattern = /^\s*#{1,6}\s*$/;
const markdownBlockquoteLinePattern = /^\s*>\s?(.*)$/;

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

type AppendOnlyAssistantMarkdownRenderSectionBuildCandidate = {
  renderSections: AssistantMarkdownRenderSection[];
  firstReparsedSectionIndex: number;
  renderSectionStartOffsetByKey: ReadonlyMap<string, number>;
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
  return {
    renderSections: [],
    preparedMarkdownText: "",
    isStreaming: false,
    renderSectionStartOffsetByKey: new Map<string, number>(),
  };
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
  const shouldRenderActiveStreamingTailConservatively = input.isStreaming && preparedMarkdownText === input.markdownText;
  if (
    input.previousCache?.preparedMarkdownText === preparedMarkdownText &&
    input.previousCache.isStreaming === input.isStreaming
  ) {
    return {
      renderSections: input.previousCache.renderSections,
      nextCache: input.previousCache,
    };
  }

  const appendBuildCandidate = createAppendOnlyAssistantMarkdownRenderSections({
    preparedMarkdownText,
    isStreaming: input.isStreaming,
    shouldRenderActiveStreamingTailConservatively,
    previousCache: input.previousCache,
  });
  const nextRenderSections = appendBuildCandidate?.renderSections ?? splitAssistantMarkdownTextIntoRenderSections(
    preparedMarkdownText,
    input.isStreaming,
    0,
    { shouldRenderActiveStreamingTailConservatively },
  );
  const previousRenderSections = input.previousCache?.renderSections ?? [];
  const stableRenderSections = appendBuildCandidate
    ? stabilizeAppendOnlyAssistantMarkdownRenderSections({ appendBuildCandidate, previousRenderSections })
    : stabilizeAssistantMarkdownRenderSections({ nextRenderSections, previousRenderSections });

  return {
    renderSections: stableRenderSections,
    nextCache: {
      renderSections: stableRenderSections,
      preparedMarkdownText,
      isStreaming: input.isStreaming,
      renderSectionStartOffsetByKey: appendBuildCandidate?.renderSectionStartOffsetByKey ?? createRenderSectionStartOffsetByKey({
        markdownText: preparedMarkdownText,
        renderSections: stableRenderSections,
        firstLineIndex: 0,
        firstLineStartOffset: 0,
      }),
    },
  };
}

function createAppendOnlyAssistantMarkdownRenderSections(input: {
  preparedMarkdownText: string;
  isStreaming: boolean;
  shouldRenderActiveStreamingTailConservatively: boolean;
  previousCache: AssistantMarkdownRenderSectionCache | undefined;
}): AppendOnlyAssistantMarkdownRenderSectionBuildCandidate | undefined {
  const previousPreparedMarkdownText = input.previousCache?.preparedMarkdownText;
  const previousRenderSections = input.previousCache?.renderSections ?? [];
  const previousRenderSectionStartOffsetByKey = input.previousCache?.renderSectionStartOffsetByKey;
  if (
    !input.isStreaming ||
    input.previousCache?.isStreaming !== input.isStreaming ||
    previousPreparedMarkdownText === undefined ||
    previousRenderSections.length === 0 ||
    !input.preparedMarkdownText.startsWith(previousPreparedMarkdownText) ||
    !previousRenderSectionStartOffsetByKey
  ) {
    return undefined;
  }

  const firstReparsedSectionIndex = previousRenderSections.length - 1;
  const firstReparsedSection = previousRenderSections[firstReparsedSectionIndex];
  if (!firstReparsedSection) {
    return undefined;
  }

  const firstReparsedLineIndex = readRenderSectionStartLineIndex(firstReparsedSection);
  const firstReparsedOffset = previousRenderSectionStartOffsetByKey.get(firstReparsedSection.sectionKey);
  if (firstReparsedLineIndex === undefined || firstReparsedOffset === undefined) {
    return undefined;
  }

  const stablePrefixSections = previousRenderSections.slice(0, firstReparsedSectionIndex);
  const reparsedMarkdownText = input.preparedMarkdownText.slice(firstReparsedOffset);
  const reparsedRenderSections = splitAssistantMarkdownTextIntoRenderSections(
    reparsedMarkdownText,
    input.isStreaming,
    firstReparsedLineIndex,
    { shouldRenderActiveStreamingTailConservatively: input.shouldRenderActiveStreamingTailConservatively },
  );
  const renderSections = [...stablePrefixSections, ...reparsedRenderSections];
  return {
    renderSections,
    firstReparsedSectionIndex,
    renderSectionStartOffsetByKey: createAppendOnlyRenderSectionStartOffsetByKey({
      reparsedMarkdownText,
      stablePrefixSections,
      reparsedRenderSections,
      firstReparsedLineIndex,
      firstReparsedOffset,
      previousRenderSectionStartOffsetByKey,
    }),
  };
}

function stabilizeAssistantMarkdownRenderSections(input: {
  nextRenderSections: readonly AssistantMarkdownRenderSection[];
  previousRenderSections: readonly AssistantMarkdownRenderSection[];
}): AssistantMarkdownRenderSection[] {
  let previousRenderSectionsByKey: Map<string, AssistantMarkdownRenderSection> | undefined;
  const readPreviousRenderSectionByKey = (sectionKey: string): AssistantMarkdownRenderSection | undefined => {
    if (input.previousRenderSections.length === 0) {
      return undefined;
    }

    previousRenderSectionsByKey ??= new Map(
      input.previousRenderSections.map((renderSection) => [renderSection.sectionKey, renderSection]),
    );
    return previousRenderSectionsByKey.get(sectionKey);
  };

  return input.nextRenderSections.map((nextRenderSection, sectionIndex) => {
    const previousRenderSectionAtIndex = input.previousRenderSections[sectionIndex];
    const previousRenderSection = previousRenderSectionAtIndex?.sectionKey === nextRenderSection.sectionKey
      ? previousRenderSectionAtIndex
      : readPreviousRenderSectionByKey(nextRenderSection.sectionKey);
    return previousRenderSection && areAssistantMarkdownRenderSectionsEqual(previousRenderSection, nextRenderSection)
      ? previousRenderSection
      : nextRenderSection;
  });
}

function stabilizeAppendOnlyAssistantMarkdownRenderSections(input: {
  appendBuildCandidate: AppendOnlyAssistantMarkdownRenderSectionBuildCandidate;
  previousRenderSections: readonly AssistantMarkdownRenderSection[];
}): AssistantMarkdownRenderSection[] {
  const stableRenderSections = input.appendBuildCandidate.renderSections;

  for (
    let sectionIndex = input.appendBuildCandidate.firstReparsedSectionIndex;
    sectionIndex < stableRenderSections.length;
    sectionIndex += 1
  ) {
    const nextRenderSection = stableRenderSections[sectionIndex];
    if (!nextRenderSection) {
      continue;
    }

    const previousRenderSectionAtIndex = input.previousRenderSections[sectionIndex];
    if (
      previousRenderSectionAtIndex?.sectionKey === nextRenderSection.sectionKey &&
      areAssistantMarkdownRenderSectionsEqual(previousRenderSectionAtIndex, nextRenderSection)
    ) {
      stableRenderSections[sectionIndex] = previousRenderSectionAtIndex;
    }
  }

  return stableRenderSections;
}

function createAppendOnlyRenderSectionStartOffsetByKey(input: {
  reparsedMarkdownText: string;
  stablePrefixSections: readonly AssistantMarkdownRenderSection[];
  reparsedRenderSections: readonly AssistantMarkdownRenderSection[];
  firstReparsedLineIndex: number;
  firstReparsedOffset: number;
  previousRenderSectionStartOffsetByKey: ReadonlyMap<string, number>;
}): ReadonlyMap<string, number> {
  const renderSectionStartOffsetByKey = new Map<string, number>();
  for (const stablePrefixSection of input.stablePrefixSections) {
    const previousSectionStartOffset = input.previousRenderSectionStartOffsetByKey.get(stablePrefixSection.sectionKey);
    if (previousSectionStartOffset !== undefined) {
      renderSectionStartOffsetByKey.set(stablePrefixSection.sectionKey, previousSectionStartOffset);
    }
  }

  const lineStartOffsets = listMarkdownLineStartOffsets(input.reparsedMarkdownText);
  for (const reparsedRenderSection of input.reparsedRenderSections) {
    const sectionStartLineIndex = readRenderSectionStartLineIndex(reparsedRenderSection);
    if (sectionStartLineIndex === undefined) {
      continue;
    }

    const localSectionStartLineIndex = sectionStartLineIndex - input.firstReparsedLineIndex;
    renderSectionStartOffsetByKey.set(
      reparsedRenderSection.sectionKey,
      input.firstReparsedOffset + (lineStartOffsets[localSectionStartLineIndex] ?? input.reparsedMarkdownText.length),
    );
  }

  return renderSectionStartOffsetByKey;
}

function createRenderSectionStartOffsetByKey(input: {
  markdownText: string;
  renderSections: readonly AssistantMarkdownRenderSection[];
  firstLineIndex: number;
  firstLineStartOffset: number;
  previousRenderSectionStartOffsetByKey?: ReadonlyMap<string, number> | undefined;
}): ReadonlyMap<string, number> {
  const renderSectionStartOffsetByKey = new Map<string, number>();
  const lineStartOffsets = listMarkdownLineStartOffsets(input.markdownText);
  for (const renderSection of input.renderSections) {
    const sectionStartLineIndex = readRenderSectionStartLineIndex(renderSection);
    if (sectionStartLineIndex === undefined) {
      continue;
    }

    if (sectionStartLineIndex < input.firstLineIndex) {
      const previousSectionStartOffset = input.previousRenderSectionStartOffsetByKey?.get(renderSection.sectionKey);
      if (previousSectionStartOffset !== undefined) {
        renderSectionStartOffsetByKey.set(renderSection.sectionKey, previousSectionStartOffset);
      }
      continue;
    }

    const localSectionStartLineIndex = sectionStartLineIndex - input.firstLineIndex;
    renderSectionStartOffsetByKey.set(
      renderSection.sectionKey,
      input.firstLineStartOffset + (lineStartOffsets[localSectionStartLineIndex] ?? input.markdownText.length),
    );
  }

  return renderSectionStartOffsetByKey;
}

function listMarkdownLineStartOffsets(markdownText: string): number[] {
  const lineStartOffsets = [0];
  for (let characterIndex = 0; characterIndex < markdownText.length; characterIndex += 1) {
    if (markdownText[characterIndex] === "\n") {
      lineStartOffsets.push(characterIndex + 1);
    }
  }

  return lineStartOffsets;
}

function readRenderSectionStartLineIndex(renderSection: AssistantMarkdownRenderSection): number | undefined {
  const sectionKeySeparatorIndex = renderSection.sectionKey.lastIndexOf(":");
  if (sectionKeySeparatorIndex === -1) {
    return undefined;
  }

  const sectionStartLineIndex = Number(renderSection.sectionKey.slice(sectionKeySeparatorIndex + 1));
  return Number.isInteger(sectionStartLineIndex) && sectionStartLineIndex >= 0 ? sectionStartLineIndex : undefined;
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
  startingLineIndex = 0,
  options: { shouldRenderActiveStreamingTailConservatively?: boolean | undefined } = {},
): AssistantMarkdownRenderSection[] {
  const markdownLines = markdownText.split("\n");
  const renderSections: AssistantMarkdownRenderSection[] = [];
  const activeStreamingTailStartLineIndex = options.shouldRenderActiveStreamingTailConservatively
    ? readActiveStreamingTailStartLineIndex(markdownLines)
    : undefined;
  let pendingMarkdownLines: string[] = [];
  let pendingMarkdownStartLineIndex: number | undefined;

  const flushPendingMarkdownLines = () => {
    const trimmedMarkdownSection = trimAssistantMarkdownSectionBoundaryBlankLinesWithLineOffset(pendingMarkdownLines);
    const markdownSectionStartLineIndex = (pendingMarkdownStartLineIndex ?? 0) + trimmedMarkdownSection.leadingBlankLineCount;
    pendingMarkdownLines = [];
    pendingMarkdownStartLineIndex = undefined;
    if (trimmedMarkdownSection.markdownLines.length === 0) {
      return;
    }

    renderSections.push({
      sectionKind: "markdown",
      sectionKey: `markdown:${markdownSectionStartLineIndex}`,
      markdownText: trimmedMarkdownSection.markdownLines.join("\n"),
    });
  };

  let lineIndex = 0;
  while (lineIndex < markdownLines.length) {
    const sectionStartLineIndex = startingLineIndex + lineIndex;
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
          isStreamingOpenCodeFence: isStreaming && !fencedCodeBlock.hasClosingFence,
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

    if (lineIndex === activeStreamingTailStartLineIndex) {
      const streamingTailText = formatAssistantMarkdownStreamingTailText(markdownLines.slice(lineIndex), isStreaming);
      flushPendingMarkdownLines();
      if (streamingTailText.trim().length > 0) {
        renderSections.push({
          sectionKind: "streamingTail",
          sectionKey: `streamingTail:${sectionStartLineIndex}`,
          streamingTailText,
        });
      }
      break;
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

    if (pendingMarkdownStartLineIndex === undefined) {
      pendingMarkdownStartLineIndex = startingLineIndex + lineIndex;
    }
    pendingMarkdownLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  flushPendingMarkdownLines();
  return renderSections;
}

function readActiveStreamingTailStartLineIndex(markdownLines: readonly string[]): number | undefined {
  const lastLineIndex = markdownLines.length - 1;
  if (lastLineIndex < 0 || (markdownLines[lastLineIndex] ?? "").trim().length === 0) {
    return undefined;
  }

  let activeStreamingTailStartLineIndex = lastLineIndex;
  while (
    activeStreamingTailStartLineIndex > 0 &&
    (markdownLines[activeStreamingTailStartLineIndex - 1] ?? "").trim().length > 0
  ) {
    activeStreamingTailStartLineIndex -= 1;
  }

  return activeStreamingTailStartLineIndex;
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
  if (previousRenderSection.sectionKind === "streamingTail" && nextRenderSection.sectionKind === "streamingTail") {
    return previousRenderSection.streamingTailText === nextRenderSection.streamingTailText;
  }
  if (previousRenderSection.sectionKind === "codeFence" && nextRenderSection.sectionKind === "codeFence") {
    return previousRenderSection.codeFenceText === nextRenderSection.codeFenceText &&
      previousRenderSection.isStreamingOpenCodeFence === nextRenderSection.isStreamingOpenCodeFence &&
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
  return trimAssistantMarkdownSectionBoundaryBlankLinesWithLineOffset(markdownLines).markdownLines;
}

function trimAssistantMarkdownSectionBoundaryBlankLinesWithLineOffset(markdownLines: readonly string[]): {
  markdownLines: string[];
  leadingBlankLineCount: number;
} {
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
  return {
    markdownLines: markdownLines.slice(firstNonBlankLineIndex, lastNonBlankLineExclusiveIndex),
    leadingBlankLineCount: firstNonBlankLineIndex,
  };
}

function formatAssistantMarkdownInlineTextForRender(inlineMarkdownText: string, isStreaming: boolean): string {
  return isStreaming
    ? formatStreamingAssistantMarkdownInlineTextForStyledText(inlineMarkdownText)
    : formatAssistantMarkdownInlineTextForStyledText(inlineMarkdownText);
}

function formatAssistantMarkdownStreamingTailText(markdownLines: readonly string[], isStreaming: boolean): string {
  return trimAssistantMarkdownSectionBoundaryBlankLines(markdownLines)
    .map((markdownLine) => formatAssistantMarkdownInlineTextForRender(markdownLine, isStreaming))
    .join("\n");
}

function readAssistantMarkdownFencedCodeBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
): AssistantMarkdownFencedCodeBlock | undefined {
  const openingFenceLine = markdownLines[startLineIndex] ?? "";
  if (!openingFenceLine.includes("```") && !openingFenceLine.includes("~~~")) {
    return undefined;
  }

  const openingFenceMatch = fencedCodeBlockStartPattern.exec(openingFenceLine);
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
  let leadingSpaceCount = 0;
  while (markdownLine[leadingSpaceCount] === " ") {
    leadingSpaceCount += 1;
  }
  if (leadingSpaceCount > 3) {
    return false;
  }

  let fenceLength = 0;
  while (markdownLine[leadingSpaceCount + fenceLength] === fenceCharacter) {
    fenceLength += 1;
  }
  if (fenceLength < minimumFenceLength) {
    return false;
  }

  return markdownLine.slice(leadingSpaceCount + fenceLength).trim().length === 0;
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
