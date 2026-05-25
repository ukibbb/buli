import {
  assistantMarkdownUnorderedListMarkers,
  type AssistantMarkdownListItemToken,
  type AssistantMarkdownListToken,
  type AssistantMarkdownVisibleListLine,
} from "./assistantMarkdownRenderSectionTypes.ts";
import {
  formatAssistantMarkdownInlineTextForStyledText,
  formatStreamingAssistantMarkdownInlineTextForStyledText,
  isAssistantMarkdownListToken,
  isAssistantMarkdownParagraphToken,
} from "./assistantMarkdownTextFormatting.ts";

export const assistantMarkdownListLinePattern = /^(\s*)(?:([-*+])\s+(?:\[([ xX])\]\s+)?|(\d+\.)\s+)(.*)$/;

type AssistantMarkdownListBlock = {
  listLines: AssistantMarkdownVisibleListLine[];
  nextLineIndex: number;
};

type ParsedAssistantMarkdownListLine = {
  listItemDepth: number;
  listItemMarkerText: string;
  listItemText: string;
};

export function formatAssistantMarkdownListText(listToken: AssistantMarkdownListToken, depth = 0): string {
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

export function readAssistantMarkdownListBlock(
  markdownLines: readonly string[],
  startLineIndex: number,
  isStreaming = false,
): AssistantMarkdownListBlock | undefined {
  if (!assistantMarkdownListLinePattern.test(markdownLines[startLineIndex] ?? "")) {
    return undefined;
  }

  const listMarkdownLines: string[] = [];
  let lineIndex = startLineIndex;
  while (lineIndex < markdownLines.length && assistantMarkdownListLinePattern.test(markdownLines[lineIndex] ?? "")) {
    listMarkdownLines.push(markdownLines[lineIndex] ?? "");
    lineIndex += 1;
  }

  return {
    listLines: formatAssistantMarkdownVisibleListLines(listMarkdownLines, isStreaming),
    nextLineIndex: lineIndex,
  };
}

export function areAssistantMarkdownVisibleListLinesEqual(
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

function parseAssistantMarkdownListLine(
  markdownListLine: string,
  isStreaming: boolean,
): ParsedAssistantMarkdownListLine | undefined {
  const listLineMatch = assistantMarkdownListLinePattern.exec(markdownListLine);
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
    listItemText: formatAssistantMarkdownListItemText((listLineMatch[5] ?? "").trim(), isStreaming),
  };
}

function formatAssistantMarkdownVisibleListLines(
  markdownListLines: readonly string[],
  isStreaming: boolean,
): AssistantMarkdownVisibleListLine[] {
  const parsedListLines = markdownListLines
    .map((markdownListLine) => parseAssistantMarkdownListLine(markdownListLine, isStreaming))
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

function formatAssistantMarkdownListItemText(listItemText: string, isStreaming: boolean): string {
  return isStreaming
    ? formatStreamingAssistantMarkdownInlineTextForStyledText(listItemText)
    : formatAssistantMarkdownInlineTextForStyledText(listItemText);
}
