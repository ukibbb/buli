import {
  createTextAttributes,
  RGBA,
  type TextChunk,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { githubLikeTerminalCodeColors } from "./codeRenderingTheme.ts";

type TeachingCommentCodeChunkStyle = {
  foregroundColor: RGBA;
  attributes?: number | undefined;
};

type TeachingCommentCodeRangeStyle = "commentMarker" | "label" | "separator" | "body";

type TeachingCommentCodeRange = {
  startOffset: number;
  endOffset: number;
  rangeStyle: TeachingCommentCodeRangeStyle;
};

const teachingCommentLinePattern = /^(\s*)((?:\/\/|#)\s*)(explain|plain pseudocode|example values|project model|library mechanics|language mechanics|not verified)(:\s?)(.*)$/gim;

const teachingCommentMarkerStyle: TeachingCommentCodeChunkStyle = {
  foregroundColor: RGBA.fromHex(githubLikeTerminalCodeColors.subtle),
  attributes: createTextAttributes({ italic: true }),
};

const teachingCommentLabelStyle: TeachingCommentCodeChunkStyle = {
  foregroundColor: RGBA.fromHex(chatScreenTheme.accentCyan),
  attributes: createTextAttributes({ bold: true }),
};

const teachingCommentSeparatorStyle: TeachingCommentCodeChunkStyle = {
  foregroundColor: RGBA.fromHex(githubLikeTerminalCodeColors.subtle),
  attributes: createTextAttributes({ italic: true }),
};

const teachingCommentBodyStyle: TeachingCommentCodeChunkStyle = {
  foregroundColor: RGBA.fromHex(githubLikeTerminalCodeColors.comment),
  attributes: createTextAttributes({ italic: true }),
};

const teachingCommentCodeChunkStyleByRangeStyle: Record<TeachingCommentCodeRangeStyle, TeachingCommentCodeChunkStyle> = {
  commentMarker: teachingCommentMarkerStyle,
  label: teachingCommentLabelStyle,
  separator: teachingCommentSeparatorStyle,
  body: teachingCommentBodyStyle,
};

export function decorateTeachingCommentCodeChunks(textChunks: TextChunk[]): TextChunk[] {
  const codeText = textChunks.map((textChunk) => textChunk.text).join("");
  const teachingCommentRanges = listTeachingCommentCodeRanges(codeText);
  if (teachingCommentRanges.length === 0) {
    return textChunks;
  }

  const decoratedTextChunks: TextChunk[] = [];
  let textChunkStartOffset = 0;
  let teachingCommentRangeIndex = 0;
  for (const textChunk of textChunks) {
    const textChunkEndOffset = textChunkStartOffset + textChunk.text.length;
    appendDecoratedTextChunkSegments({
      decoratedTextChunks,
      sourceTextChunk: textChunk,
      textChunkStartOffset,
      textChunkEndOffset,
      teachingCommentRanges,
      teachingCommentRangeIndex,
    });

    while (
      teachingCommentRangeIndex < teachingCommentRanges.length &&
      (teachingCommentRanges[teachingCommentRangeIndex]?.endOffset ?? 0) <= textChunkEndOffset
    ) {
      teachingCommentRangeIndex += 1;
    }
    textChunkStartOffset = textChunkEndOffset;
  }

  return decoratedTextChunks;
}

function listTeachingCommentCodeRanges(codeText: string): TeachingCommentCodeRange[] {
  const teachingCommentRanges: TeachingCommentCodeRange[] = [];
  for (const teachingCommentMatch of codeText.matchAll(teachingCommentLinePattern)) {
    const matchStartOffset = teachingCommentMatch.index;
    const leadingWhitespaceText = teachingCommentMatch[1] ?? "";
    const commentMarkerText = teachingCommentMatch[2] ?? "";
    const labelText = teachingCommentMatch[3] ?? "";
    const separatorText = teachingCommentMatch[4] ?? "";
    const bodyText = teachingCommentMatch[5] ?? "";
    if (matchStartOffset === undefined || commentMarkerText.length === 0 || labelText.length === 0) {
      continue;
    }

    const commentMarkerStartOffset = matchStartOffset + leadingWhitespaceText.length;
    const labelStartOffset = commentMarkerStartOffset + commentMarkerText.length;
    const separatorStartOffset = labelStartOffset + labelText.length;
    const bodyStartOffset = separatorStartOffset + separatorText.length;
    pushTeachingCommentCodeRange(teachingCommentRanges, {
      startOffset: commentMarkerStartOffset,
      endOffset: labelStartOffset,
      rangeStyle: "commentMarker",
    });
    pushTeachingCommentCodeRange(teachingCommentRanges, {
      startOffset: labelStartOffset,
      endOffset: separatorStartOffset,
      rangeStyle: "label",
    });
    pushTeachingCommentCodeRange(teachingCommentRanges, {
      startOffset: separatorStartOffset,
      endOffset: bodyStartOffset,
      rangeStyle: "separator",
    });
    pushTeachingCommentCodeRange(teachingCommentRanges, {
      startOffset: bodyStartOffset,
      endOffset: bodyStartOffset + bodyText.length,
      rangeStyle: "body",
    });
  }

  return teachingCommentRanges;
}

function pushTeachingCommentCodeRange(
  teachingCommentRanges: TeachingCommentCodeRange[],
  teachingCommentRange: TeachingCommentCodeRange,
): void {
  if (teachingCommentRange.endOffset <= teachingCommentRange.startOffset) {
    return;
  }

  teachingCommentRanges.push(teachingCommentRange);
}

function appendDecoratedTextChunkSegments(input: {
  decoratedTextChunks: TextChunk[];
  sourceTextChunk: TextChunk;
  textChunkStartOffset: number;
  textChunkEndOffset: number;
  teachingCommentRanges: readonly TeachingCommentCodeRange[];
  teachingCommentRangeIndex: number;
}): void {
  let textChunkLocalOffset = 0;
  let teachingCommentRangeIndex = input.teachingCommentRangeIndex;
  while (textChunkLocalOffset < input.sourceTextChunk.text.length) {
    while (
      teachingCommentRangeIndex < input.teachingCommentRanges.length &&
      (input.teachingCommentRanges[teachingCommentRangeIndex]?.endOffset ?? 0) <= input.textChunkStartOffset + textChunkLocalOffset
    ) {
      teachingCommentRangeIndex += 1;
    }

    const activeRange = input.teachingCommentRanges[teachingCommentRangeIndex];
    const currentGlobalOffset = input.textChunkStartOffset + textChunkLocalOffset;
    if (!activeRange || activeRange.startOffset >= input.textChunkEndOffset) {
      pushPlainTextChunkSegment(input.decoratedTextChunks, input.sourceTextChunk, textChunkLocalOffset, input.sourceTextChunk.text.length);
      return;
    }

    if (currentGlobalOffset < activeRange.startOffset) {
      const plainSegmentEndOffset = Math.min(activeRange.startOffset - input.textChunkStartOffset, input.sourceTextChunk.text.length);
      pushPlainTextChunkSegment(input.decoratedTextChunks, input.sourceTextChunk, textChunkLocalOffset, plainSegmentEndOffset);
      textChunkLocalOffset = plainSegmentEndOffset;
      continue;
    }

    const styledSegmentEndOffset = Math.min(activeRange.endOffset - input.textChunkStartOffset, input.sourceTextChunk.text.length);
    pushStyledTextChunkSegment({
      decoratedTextChunks: input.decoratedTextChunks,
      sourceTextChunk: input.sourceTextChunk,
      segmentStartOffset: textChunkLocalOffset,
      segmentEndOffset: styledSegmentEndOffset,
      rangeStyle: activeRange.rangeStyle,
    });
    textChunkLocalOffset = styledSegmentEndOffset;
  }
}

function pushPlainTextChunkSegment(
  decoratedTextChunks: TextChunk[],
  sourceTextChunk: TextChunk,
  segmentStartOffset: number,
  segmentEndOffset: number,
): void {
  if (segmentEndOffset <= segmentStartOffset) {
    return;
  }

  decoratedTextChunks.push({
    ...sourceTextChunk,
    text: sourceTextChunk.text.slice(segmentStartOffset, segmentEndOffset),
  });
}

function pushStyledTextChunkSegment(input: {
  decoratedTextChunks: TextChunk[];
  sourceTextChunk: TextChunk;
  segmentStartOffset: number;
  segmentEndOffset: number;
  rangeStyle: TeachingCommentCodeRangeStyle;
}): void {
  if (input.segmentEndOffset <= input.segmentStartOffset) {
    return;
  }

  const style = teachingCommentCodeChunkStyleByRangeStyle[input.rangeStyle];
  input.decoratedTextChunks.push({
    ...input.sourceTextChunk,
    text: input.sourceTextChunk.text.slice(input.segmentStartOffset, input.segmentEndOffset),
    fg: style.foregroundColor,
    ...(style.attributes !== undefined ? { attributes: style.attributes } : {}),
  });
}
