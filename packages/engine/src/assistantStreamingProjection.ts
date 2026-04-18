import {
  AssistantStreamingProjectionSchema,
  StreamingFencedCodeBlockContentPartSchema,
  StreamingMarkdownTextContentPartSchema,
  type AssistantContentPart,
  type AssistantStreamingProjection,
  type StreamingAssistantContentPart,
} from "@buli/contracts";
import { parseAssistantResponseIntoContentParts } from "./assistantContentPartParser.ts";

type AssistantStreamingProjectorState = {
  projection: AssistantStreamingProjection;
  openMarkdownBufferText: string;
};

type CompletedLine = {
  text: string;
  startOffset: number;
  lineEndOffset: number;
  nextLineStartOffset: number;
};

type CompletedBlockParseResult = {
  blockText: string;
  nextLineIndex: number;
  consumedOffset: number;
};

function normalizeAssistantTextDeltaText(assistantTextDeltaText: string): string {
  return assistantTextDeltaText.replace(/\r\n?/g, "\n");
}

function isBlankLineText(lineText: string): boolean {
  return lineText.trim() === "";
}

function isFencedCodeFenceLineText(lineText: string): boolean {
  return /^```(\w+)?\s*$/.test(lineText);
}

function isHeadingLineText(lineText: string): boolean {
  return /^(#{1,3})\s+.+$/.test(lineText);
}

function isHorizontalRuleLineText(lineText: string): boolean {
  return /^(?:-{3,}|_{3,}|\*{3,})\s*$/.test(lineText.trim());
}

function isChecklistLineText(lineText: string): boolean {
  return /^\s*[-*]\s+\[[ xX]]\s+/.test(lineText);
}

function isBulletedListLineText(lineText: string): boolean {
  return /^\s*[-*]\s+/.test(lineText) && !isChecklistLineText(lineText);
}

function isNumberedListLineText(lineText: string): boolean {
  return /^\s*\d+[.)]\s+/.test(lineText);
}

function isCalloutLeadLineText(lineText: string): boolean {
  return /^>\s*\[!\w+]/.test(lineText);
}

function isCalloutBodyLineText(lineText: string): boolean {
  return /^>\s?(.*)$/.test(lineText);
}

function startsNewMarkdownBlock(lineText: string): boolean {
  return (
    isHeadingLineText(lineText) ||
    isFencedCodeFenceLineText(lineText) ||
    isCalloutLeadLineText(lineText) ||
    isChecklistLineText(lineText) ||
    isBulletedListLineText(lineText) ||
    isNumberedListLineText(lineText) ||
    isHorizontalRuleLineText(lineText)
  );
}

function buildCompletedLines(markdownBufferText: string): { completedLines: CompletedLine[]; trailingPartialText: string } {
  const completedLines: CompletedLine[] = [];
  let lineStartOffset = 0;

  while (lineStartOffset < markdownBufferText.length) {
    const lineEndOffset = markdownBufferText.indexOf("\n", lineStartOffset);
    if (lineEndOffset === -1) {
      break;
    }

    completedLines.push({
      text: markdownBufferText.slice(lineStartOffset, lineEndOffset),
      startOffset: lineStartOffset,
      lineEndOffset,
      nextLineStartOffset: lineEndOffset + 1,
    });
    lineStartOffset = lineEndOffset + 1;
  }

  return {
    completedLines,
    trailingPartialText: markdownBufferText.slice(lineStartOffset),
  };
}

function consumeBlankLineSeparators(completedLines: readonly CompletedLine[], startLineIndex: number): CompletedBlockParseResult {
  let nextLineIndex = startLineIndex;
  let consumedOffset = completedLines[startLineIndex - 1]?.nextLineStartOffset ?? 0;

  while (nextLineIndex < completedLines.length && isBlankLineText(completedLines[nextLineIndex]?.text ?? "")) {
    consumedOffset = completedLines[nextLineIndex]?.nextLineStartOffset ?? consumedOffset;
    nextLineIndex += 1;
  }

  return {
    blockText: "",
    nextLineIndex,
    consumedOffset,
  };
}

function tryParseCompletedFencedCodeBlock(
  completedLines: readonly CompletedLine[],
  startLineIndex: number,
  markdownBufferText: string,
): CompletedBlockParseResult | undefined {
  if (!isFencedCodeFenceLineText(completedLines[startLineIndex]?.text ?? "")) {
    return undefined;
  }

  for (let lineIndex = startLineIndex + 1; lineIndex < completedLines.length; lineIndex += 1) {
    if (!isFencedCodeFenceLineText(completedLines[lineIndex]?.text ?? "")) {
      continue;
    }

    return {
      blockText: markdownBufferText.slice(
        completedLines[startLineIndex]?.startOffset ?? 0,
        completedLines[lineIndex]?.lineEndOffset,
      ),
      nextLineIndex: lineIndex + 1,
      consumedOffset: completedLines[lineIndex]?.nextLineStartOffset ?? 0,
    };
  }

  return undefined;
}

function tryParseCompletedSingleLineBlock(
  completedLines: readonly CompletedLine[],
  startLineIndex: number,
  markdownBufferText: string,
): CompletedBlockParseResult | undefined {
  const lineText = completedLines[startLineIndex]?.text ?? "";
  if (!isHeadingLineText(lineText) && !isHorizontalRuleLineText(lineText)) {
    return undefined;
  }

  return {
    blockText: markdownBufferText.slice(
      completedLines[startLineIndex]?.startOffset ?? 0,
      completedLines[startLineIndex]?.lineEndOffset,
    ),
    nextLineIndex: startLineIndex + 1,
    consumedOffset: completedLines[startLineIndex]?.nextLineStartOffset ?? 0,
  };
}

function tryParseCompletedCalloutBlock(
  completedLines: readonly CompletedLine[],
  startLineIndex: number,
  markdownBufferText: string,
): CompletedBlockParseResult | undefined {
  if (!isCalloutLeadLineText(completedLines[startLineIndex]?.text ?? "")) {
    return undefined;
  }

  let lastQuotedLineIndex = startLineIndex;
  let nextLineIndex = startLineIndex + 1;
  while (nextLineIndex < completedLines.length && isCalloutBodyLineText(completedLines[nextLineIndex]?.text ?? "")) {
    lastQuotedLineIndex = nextLineIndex;
    nextLineIndex += 1;
  }

  if (nextLineIndex >= completedLines.length) {
    return undefined;
  }

  return {
    blockText: markdownBufferText.slice(
      completedLines[startLineIndex]?.startOffset ?? 0,
      completedLines[lastQuotedLineIndex]?.lineEndOffset,
    ),
    nextLineIndex,
    consumedOffset: completedLines[lastQuotedLineIndex]?.nextLineStartOffset ?? 0,
  };
}

function tryParseCompletedListBlock(
  completedLines: readonly CompletedLine[],
  startLineIndex: number,
  markdownBufferText: string,
): CompletedBlockParseResult | undefined {
  const lineText = completedLines[startLineIndex]?.text ?? "";
  const matchesCurrentListLine = isChecklistLineText(lineText)
    ? isChecklistLineText
    : isBulletedListLineText(lineText)
      ? isBulletedListLineText
      : isNumberedListLineText(lineText)
        ? isNumberedListLineText
        : undefined;
  if (!matchesCurrentListLine) {
    return undefined;
  }

  let lastListLineIndex = startLineIndex;
  let nextLineIndex = startLineIndex + 1;
  while (nextLineIndex < completedLines.length && matchesCurrentListLine(completedLines[nextLineIndex]?.text ?? "")) {
    lastListLineIndex = nextLineIndex;
    nextLineIndex += 1;
  }

  if (nextLineIndex >= completedLines.length) {
    return undefined;
  }

  return {
    blockText: markdownBufferText.slice(
      completedLines[startLineIndex]?.startOffset ?? 0,
      completedLines[lastListLineIndex]?.lineEndOffset,
    ),
    nextLineIndex,
    consumedOffset: completedLines[lastListLineIndex]?.nextLineStartOffset ?? 0,
  };
}

function tryParseCompletedParagraphBlock(
  completedLines: readonly CompletedLine[],
  startLineIndex: number,
  markdownBufferText: string,
): CompletedBlockParseResult | undefined {
  let lastParagraphLineIndex = startLineIndex;
  let nextLineIndex = startLineIndex + 1;

  while (nextLineIndex < completedLines.length) {
    const nextLineText = completedLines[nextLineIndex]?.text ?? "";
    if (isBlankLineText(nextLineText) || startsNewMarkdownBlock(nextLineText)) {
      return {
        blockText: markdownBufferText.slice(
          completedLines[startLineIndex]?.startOffset ?? 0,
          completedLines[lastParagraphLineIndex]?.lineEndOffset,
        ),
        nextLineIndex,
        consumedOffset: completedLines[lastParagraphLineIndex]?.nextLineStartOffset ?? 0,
      };
    }

    lastParagraphLineIndex = nextLineIndex;
    nextLineIndex += 1;
  }

  return undefined;
}

function extractCompletedMarkdownBlocks(markdownBufferText: string): {
  completedBlockTexts: string[];
  remainingMarkdownBufferText: string;
} {
  const { completedLines } = buildCompletedLines(markdownBufferText);
  const completedBlockTexts: string[] = [];
  let lineIndex = 0;
  let consumedOffset = 0;

  while (lineIndex < completedLines.length) {
    const currentLineText = completedLines[lineIndex]?.text ?? "";

    if (isBlankLineText(currentLineText)) {
      const blankLineConsumption = consumeBlankLineSeparators(completedLines, lineIndex);
      lineIndex = blankLineConsumption.nextLineIndex;
      consumedOffset = blankLineConsumption.consumedOffset;
      continue;
    }

    const completedBlockParseResult =
      tryParseCompletedFencedCodeBlock(completedLines, lineIndex, markdownBufferText) ??
      tryParseCompletedCalloutBlock(completedLines, lineIndex, markdownBufferText) ??
      tryParseCompletedSingleLineBlock(completedLines, lineIndex, markdownBufferText) ??
      tryParseCompletedListBlock(completedLines, lineIndex, markdownBufferText) ??
      tryParseCompletedParagraphBlock(completedLines, lineIndex, markdownBufferText);

    if (!completedBlockParseResult) {
      break;
    }

    if (completedBlockParseResult.blockText.trim().length > 0) {
      completedBlockTexts.push(completedBlockParseResult.blockText);
    }

    lineIndex = completedBlockParseResult.nextLineIndex;
    consumedOffset = completedBlockParseResult.consumedOffset;

    if (lineIndex < completedLines.length && isBlankLineText(completedLines[lineIndex]?.text ?? "")) {
      const blankLineConsumption = consumeBlankLineSeparators(completedLines, lineIndex);
      lineIndex = blankLineConsumption.nextLineIndex;
      consumedOffset = blankLineConsumption.consumedOffset;
    }
  }

  return {
    completedBlockTexts,
    remainingMarkdownBufferText: markdownBufferText.slice(consumedOffset),
  };
}

function buildOpenStreamingContentPart(markdownBufferText: string): StreamingAssistantContentPart | undefined {
  if (markdownBufferText.length === 0 || markdownBufferText.trim().length === 0) {
    return undefined;
  }

  const fencedCodeBlockMatch = markdownBufferText.match(/^```(\w+)?\n([\s\S]*)$/);
  if (fencedCodeBlockMatch && !/\n```\s*$/.test(markdownBufferText)) {
    return StreamingFencedCodeBlockContentPartSchema.parse({
      kind: "streaming_fenced_code_block",
      ...(fencedCodeBlockMatch[1] ? { languageLabel: fencedCodeBlockMatch[1] } : {}),
      codeLines: (fencedCodeBlockMatch[2] ?? "").split("\n"),
    });
  }

  return StreamingMarkdownTextContentPartSchema.parse({
    kind: "streaming_markdown_text",
    text: markdownBufferText,
  });
}

function appendCompletedBlockTextsToProjection(input: {
  projection: AssistantStreamingProjection;
  completedBlockTexts: readonly string[];
  fullResponseText: string;
  openContentPart: StreamingAssistantContentPart | undefined;
}): AssistantStreamingProjection {
  const newlyCompletedContentParts = input.completedBlockTexts.flatMap((completedBlockText) =>
    parseAssistantResponseIntoContentParts(completedBlockText),
  );

  return AssistantStreamingProjectionSchema.parse({
    fullResponseText: input.fullResponseText,
    completedContentParts: [...input.projection.completedContentParts, ...newlyCompletedContentParts],
    ...(input.openContentPart ? { openContentPart: input.openContentPart } : {}),
  });
}

export function createInitialAssistantStreamingProjectorState(): AssistantStreamingProjectorState {
  return {
    projection: AssistantStreamingProjectionSchema.parse({
      fullResponseText: "",
      completedContentParts: [],
    }),
    openMarkdownBufferText: "",
  };
}

export function appendAssistantTextDeltaToStreamingProjectorState(
  assistantStreamingProjectorState: AssistantStreamingProjectorState,
  assistantTextDeltaText: string,
): AssistantStreamingProjectorState {
  const normalizedAssistantTextDeltaText = normalizeAssistantTextDeltaText(assistantTextDeltaText);
  const nextOpenMarkdownBufferText =
    assistantStreamingProjectorState.openMarkdownBufferText + normalizedAssistantTextDeltaText;
  const { completedBlockTexts, remainingMarkdownBufferText } = extractCompletedMarkdownBlocks(nextOpenMarkdownBufferText);

  return {
    projection: appendCompletedBlockTextsToProjection({
      projection: assistantStreamingProjectorState.projection,
      completedBlockTexts,
      fullResponseText: assistantStreamingProjectorState.projection.fullResponseText + normalizedAssistantTextDeltaText,
      openContentPart: buildOpenStreamingContentPart(remainingMarkdownBufferText),
    }),
    openMarkdownBufferText: remainingMarkdownBufferText,
  };
}

export function finalizeAssistantStreamingProjectorState(
  assistantStreamingProjectorState: AssistantStreamingProjectorState,
): AssistantStreamingProjection {
  if (assistantStreamingProjectorState.openMarkdownBufferText.length === 0) {
    return AssistantStreamingProjectionSchema.parse({
      fullResponseText: assistantStreamingProjectorState.projection.fullResponseText,
      completedContentParts: assistantStreamingProjectorState.projection.completedContentParts,
    });
  }

  return appendCompletedBlockTextsToProjection({
    projection: assistantStreamingProjectorState.projection,
    completedBlockTexts: [assistantStreamingProjectorState.openMarkdownBufferText],
    fullResponseText: assistantStreamingProjectorState.projection.fullResponseText,
    openContentPart: undefined,
  });
}

export function createLegacyStreamingProjectionFromText(assistantResponseText: string): AssistantStreamingProjection {
  const normalizedAssistantResponseText = normalizeAssistantTextDeltaText(assistantResponseText);
  return AssistantStreamingProjectionSchema.parse({
    fullResponseText: normalizedAssistantResponseText,
    completedContentParts: [],
    ...(buildOpenStreamingContentPart(normalizedAssistantResponseText)
      ? { openContentPart: buildOpenStreamingContentPart(normalizedAssistantResponseText) }
      : {}),
  });
}
