import type { AssistantContentPart, CalloutSeverity, ChecklistItem, InlineSpan } from "@buli/contracts";

// Parses the assistant's streamed markdown text into a typed block tree that
// the renderer turns into primitives. We support the subset of CommonMark
// that the design actually uses (paragraphs, ATX headings, fenced code,
// bulleted / numbered / checklist, GitHub-style admonitions, horizontal
// rules) plus inline bold / italic / strike / code / link spans. Keeping
// block kinds explicit — rather than shuttling a generic "node" — means the
// renderer can dispatch straight to the matching component without guessing.

export function parseAssistantResponseIntoContentParts(assistantResponseText: string): readonly AssistantContentPart[] {
  const blocks: AssistantContentPart[] = [];
  const responseLines = assistantResponseText.replace(/\r\n?/g, "\n").split("\n");

  let cursorLineIndex = 0;
  while (cursorLineIndex < responseLines.length) {
    const currentLine = responseLines[cursorLineIndex] ?? "";

    if (currentLine.trim() === "") {
      cursorLineIndex += 1;
      continue;
    }

    const fencedCodeBlock = tryParseFencedCodeBlock(responseLines, cursorLineIndex);
    if (fencedCodeBlock) {
      blocks.push(fencedCodeBlock.block);
      cursorLineIndex = fencedCodeBlock.nextLineIndex;
      continue;
    }

    const calloutBlock = tryParseCalloutBlock(responseLines, cursorLineIndex);
    if (calloutBlock) {
      blocks.push(calloutBlock.block);
      cursorLineIndex = calloutBlock.nextLineIndex;
      continue;
    }

    const headingBlock = tryParseHeadingBlock(currentLine);
    if (headingBlock) {
      blocks.push(headingBlock);
      cursorLineIndex += 1;
      continue;
    }

    if (isHorizontalRuleLine(currentLine)) {
      blocks.push({ kind: "horizontal_rule" });
      cursorLineIndex += 1;
      continue;
    }

    const checklistBlock = tryParseChecklistBlock(responseLines, cursorLineIndex);
    if (checklistBlock) {
      blocks.push(checklistBlock.block);
      cursorLineIndex = checklistBlock.nextLineIndex;
      continue;
    }

    const bulletedListBlock = tryParseBulletedListBlock(responseLines, cursorLineIndex);
    if (bulletedListBlock) {
      blocks.push(bulletedListBlock.block);
      cursorLineIndex = bulletedListBlock.nextLineIndex;
      continue;
    }

    const numberedListBlock = tryParseNumberedListBlock(responseLines, cursorLineIndex);
    if (numberedListBlock) {
      blocks.push(numberedListBlock.block);
      cursorLineIndex = numberedListBlock.nextLineIndex;
      continue;
    }

    const paragraphBlock = parseParagraphBlock(responseLines, cursorLineIndex);
    blocks.push(paragraphBlock.block);
    cursorLineIndex = paragraphBlock.nextLineIndex;
  }

  return blocks;
}

function tryParseFencedCodeBlock(
  responseLines: string[],
  startLineIndex: number,
): { block: AssistantContentPart; nextLineIndex: number } | undefined {
  const openingLine = responseLines[startLineIndex] ?? "";
  const openingFenceMatch = openingLine.match(/^```(\w+)?\s*$/);
  if (!openingFenceMatch) {
    return undefined;
  }
  const rawLanguageLabel = openingFenceMatch[1];
  const codeLines: string[] = [];
  let scanningLineIndex = startLineIndex + 1;
  while (scanningLineIndex < responseLines.length) {
    const currentLine = responseLines[scanningLineIndex] ?? "";
    if (currentLine.match(/^```\s*$/)) {
      return {
        block: {
          kind: "fenced_code_block",
          ...(rawLanguageLabel ? { languageLabel: rawLanguageLabel } : {}),
          codeLines,
        },
        nextLineIndex: scanningLineIndex + 1,
      };
    }
    codeLines.push(currentLine);
    scanningLineIndex += 1;
  }
  // Unterminated fence: treat the rest of the stream as code so in-progress
  // streams render sensibly.
  return {
    block: {
      kind: "fenced_code_block",
      ...(rawLanguageLabel ? { languageLabel: rawLanguageLabel } : {}),
      codeLines,
    },
    nextLineIndex: scanningLineIndex,
  };
}

const calloutSeverityByAdmonitionTag: Record<string, CalloutSeverity> = {
  NOTE: "info",
  INFO: "info",
  TIP: "success",
  SUCCESS: "success",
  IMPORTANT: "info",
  WARNING: "warning",
  WARN: "warning",
  CAUTION: "error",
  ERROR: "error",
  DANGER: "error",
};

function tryParseCalloutBlock(
  responseLines: string[],
  startLineIndex: number,
): { block: AssistantContentPart; nextLineIndex: number } | undefined {
  const openingLine = responseLines[startLineIndex] ?? "";
  const admonitionMatch = openingLine.match(/^>\s*\[!(\w+)](.*)$/);
  if (!admonitionMatch) {
    return undefined;
  }
  const rawAdmonitionTag = admonitionMatch[1] ?? "";
  const severity = calloutSeverityByAdmonitionTag[rawAdmonitionTag.toUpperCase()];
  if (!severity) {
    return undefined;
  }
  const rawTitleText = (admonitionMatch[2] ?? "").trim();

  const bodyLines: string[] = [];
  let scanningLineIndex = startLineIndex + 1;
  while (scanningLineIndex < responseLines.length) {
    const currentLine = responseLines[scanningLineIndex] ?? "";
    const quotedLineMatch = currentLine.match(/^>\s?(.*)$/);
    if (!quotedLineMatch) {
      break;
    }
    bodyLines.push(quotedLineMatch[1] ?? "");
    scanningLineIndex += 1;
  }
  const bodyText = bodyLines.join(" ").trim();
  return {
    block: {
      kind: "callout",
      severity,
      ...(rawTitleText ? { titleText: rawTitleText } : {}),
      inlineSpans: parseInlineMarkdownSpans(bodyText),
    },
    nextLineIndex: scanningLineIndex,
  };
}

function tryParseHeadingBlock(currentLine: string): AssistantContentPart | undefined {
  const headingMatch = currentLine.match(/^(#{1,3})\s+(.+)$/);
  if (!headingMatch) {
    return undefined;
  }
  const headingLevel = (headingMatch[1] ?? "#").length as 1 | 2 | 3;
  return {
    kind: "heading",
    headingLevel,
    inlineSpans: parseInlineMarkdownSpans(headingMatch[2] ?? ""),
  };
}

function isHorizontalRuleLine(currentLine: string): boolean {
  return /^(?:-{3,}|_{3,}|\*{3,})\s*$/.test(currentLine.trim());
}

function tryParseChecklistBlock(
  responseLines: string[],
  startLineIndex: number,
): { block: AssistantContentPart; nextLineIndex: number } | undefined {
  const firstLine = responseLines[startLineIndex] ?? "";
  if (!/^\s*[-*]\s+\[[ xX]]\s+/.test(firstLine)) {
    return undefined;
  }
  const items: ChecklistItem[] = [];
  let scanningLineIndex = startLineIndex;
  while (scanningLineIndex < responseLines.length) {
    const currentLine = responseLines[scanningLineIndex] ?? "";
    const checklistLineMatch = currentLine.match(/^\s*[-*]\s+\[([ xX])]\s+(.*)$/);
    if (!checklistLineMatch) {
      break;
    }
    const itemStatus = (checklistLineMatch[1] ?? " ").toLowerCase() === "x" ? "completed" : "pending";
    items.push({
      itemTitle: (checklistLineMatch[2] ?? "").trim(),
      itemStatus,
    });
    scanningLineIndex += 1;
  }
  return {
    block: { kind: "checklist", items },
    nextLineIndex: scanningLineIndex,
  };
}

function tryParseBulletedListBlock(
  responseLines: string[],
  startLineIndex: number,
): { block: AssistantContentPart; nextLineIndex: number } | undefined {
  const firstLine = responseLines[startLineIndex] ?? "";
  if (!/^\s*[-*]\s+/.test(firstLine) || /^\s*[-*]\s+\[[ xX]]\s+/.test(firstLine)) {
    return undefined;
  }
  const itemSpanArrays: InlineSpan[][] = [];
  let scanningLineIndex = startLineIndex;
  while (scanningLineIndex < responseLines.length) {
    const currentLine = responseLines[scanningLineIndex] ?? "";
    const bulletedLineMatch = currentLine.match(/^\s*[-*]\s+(.*)$/);
    if (!bulletedLineMatch || /^\s*[-*]\s+\[[ xX]]\s+/.test(currentLine)) {
      break;
    }
    itemSpanArrays.push(parseInlineMarkdownSpans((bulletedLineMatch[1] ?? "").trim()));
    scanningLineIndex += 1;
  }
  return {
    block: { kind: "bulleted_list", itemSpanArrays },
    nextLineIndex: scanningLineIndex,
  };
}

function tryParseNumberedListBlock(
  responseLines: string[],
  startLineIndex: number,
): { block: AssistantContentPart; nextLineIndex: number } | undefined {
  const firstLine = responseLines[startLineIndex] ?? "";
  if (!/^\s*\d+[.)]\s+/.test(firstLine)) {
    return undefined;
  }
  const itemSpanArrays: InlineSpan[][] = [];
  let scanningLineIndex = startLineIndex;
  while (scanningLineIndex < responseLines.length) {
    const currentLine = responseLines[scanningLineIndex] ?? "";
    const numberedLineMatch = currentLine.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!numberedLineMatch) {
      break;
    }
    itemSpanArrays.push(parseInlineMarkdownSpans((numberedLineMatch[1] ?? "").trim()));
    scanningLineIndex += 1;
  }
  return {
    block: { kind: "numbered_list", itemSpanArrays },
    nextLineIndex: scanningLineIndex,
  };
}

function parseParagraphBlock(
  responseLines: string[],
  startLineIndex: number,
): { block: AssistantContentPart; nextLineIndex: number } {
  const paragraphLines: string[] = [];
  let scanningLineIndex = startLineIndex;
  while (scanningLineIndex < responseLines.length) {
    const currentLine = responseLines[scanningLineIndex] ?? "";
    if (currentLine.trim() === "") {
      break;
    }
    if (lineStartsANewBlock(currentLine)) {
      break;
    }
    paragraphLines.push(currentLine);
    scanningLineIndex += 1;
  }
  const paragraphText = paragraphLines.join(" ").trim();
  return {
    block: { kind: "paragraph", inlineSpans: parseInlineMarkdownSpans(paragraphText) },
    nextLineIndex: scanningLineIndex,
  };
}

function lineStartsANewBlock(currentLine: string): boolean {
  if (currentLine.match(/^#{1,3}\s+/)) {
    return true;
  }
  if (currentLine.match(/^```/)) {
    return true;
  }
  if (currentLine.match(/^>\s*\[!\w+]/)) {
    return true;
  }
  if (currentLine.match(/^\s*[-*]\s+/) || currentLine.match(/^\s*\d+[.)]\s+/)) {
    return true;
  }
  if (isHorizontalRuleLine(currentLine)) {
    return true;
  }
  return false;
}

// Inline parser. Scans left-to-right and greedily consumes the longest
// recognised marker at each position. Unrecognised markers fall through as
// plain text so odd inputs degrade gracefully rather than throwing.
export function parseInlineMarkdownSpans(inlineMarkdownText: string): InlineSpan[] {
  const inlineSpans: InlineSpan[] = [];
  let pendingPlainText = "";
  let cursorCharIndex = 0;

  const flushPlainText = () => {
    if (pendingPlainText.length === 0) {
      return;
    }
    inlineSpans.push({ spanKind: "plain", spanText: pendingPlainText });
    pendingPlainText = "";
  };

  while (cursorCharIndex < inlineMarkdownText.length) {
    const currentCharacter = inlineMarkdownText[cursorCharIndex] ?? "";

    if (currentCharacter === "`") {
      const closingBacktickIndex = inlineMarkdownText.indexOf("`", cursorCharIndex + 1);
      if (closingBacktickIndex !== -1) {
        flushPlainText();
        inlineSpans.push({
          spanKind: "code",
          spanText: inlineMarkdownText.slice(cursorCharIndex + 1, closingBacktickIndex),
        });
        cursorCharIndex = closingBacktickIndex + 1;
        continue;
      }
    }

    if (
      currentCharacter === "*" &&
      inlineMarkdownText[cursorCharIndex + 1] === "*" &&
      inlineMarkdownText[cursorCharIndex + 2] !== "*"
    ) {
      const closingDoubleAsteriskIndex = inlineMarkdownText.indexOf("**", cursorCharIndex + 2);
      if (closingDoubleAsteriskIndex !== -1) {
        flushPlainText();
        inlineSpans.push({
          spanKind: "bold",
          spanText: inlineMarkdownText.slice(cursorCharIndex + 2, closingDoubleAsteriskIndex),
        });
        cursorCharIndex = closingDoubleAsteriskIndex + 2;
        continue;
      }
    }

    if (
      (currentCharacter === "*" || currentCharacter === "_") &&
      inlineMarkdownText[cursorCharIndex + 1] !== currentCharacter
    ) {
      const closingItalicMarkerIndex = inlineMarkdownText.indexOf(currentCharacter, cursorCharIndex + 1);
      if (closingItalicMarkerIndex !== -1) {
        flushPlainText();
        inlineSpans.push({
          spanKind: "italic",
          spanText: inlineMarkdownText.slice(cursorCharIndex + 1, closingItalicMarkerIndex),
        });
        cursorCharIndex = closingItalicMarkerIndex + 1;
        continue;
      }
    }

    if (currentCharacter === "~" && inlineMarkdownText[cursorCharIndex + 1] === "~") {
      const closingDoubleTildeIndex = inlineMarkdownText.indexOf("~~", cursorCharIndex + 2);
      if (closingDoubleTildeIndex !== -1) {
        flushPlainText();
        inlineSpans.push({
          spanKind: "strike",
          spanText: inlineMarkdownText.slice(cursorCharIndex + 2, closingDoubleTildeIndex),
        });
        cursorCharIndex = closingDoubleTildeIndex + 2;
        continue;
      }
    }

    if (currentCharacter === "[") {
      const linkMatch = inlineMarkdownText.slice(cursorCharIndex).match(/^\[([^\]]+)]\(([^)\s]+)\)/);
      if (linkMatch) {
        flushPlainText();
        inlineSpans.push({
          spanKind: "link",
          spanText: linkMatch[1] ?? "",
          hrefUrl: linkMatch[2] ?? "",
        });
        cursorCharIndex += linkMatch[0].length;
        continue;
      }
    }

    pendingPlainText += currentCharacter;
    cursorCharIndex += 1;
  }

  flushPlainText();
  return inlineSpans;
}
