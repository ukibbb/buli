import {
  assistantMarkdownUnorderedListMarkers,
  type AssistantMarkdownVisibleListLine,
} from "./assistantMarkdownRenderSectionTypes.ts";
import {
  formatAssistantMarkdownInlineTextForStyledText,
  formatStreamingAssistantMarkdownInlineTextForStyledText,
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
