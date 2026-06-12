import type { MarkdownOptions } from "@opentui/core";

export const assistantMarkdownUnorderedListMarkers = ["-"] as const;

export type AssistantMarkdownToken = Parameters<NonNullable<MarkdownOptions["renderNode"]>>[0];
export type AssistantMarkdownCodeToken = AssistantMarkdownToken & { type: "code"; text: string; lang?: string };
export type AssistantMarkdownHeadingToken = AssistantMarkdownToken & { type: "heading"; text: string; depth: number };
export type AssistantMarkdownParagraphToken = AssistantMarkdownToken & { type: "paragraph"; text: string };

export type AssistantMarkdownCalloutKind = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";
export type AssistantMarkdownCallout = {
  calloutKind: AssistantMarkdownCalloutKind;
  bodyText: string;
};

export type AssistantMarkdownSourceLineRange = {
  sourceStartLineNumber: number;
  sourceEndLineNumber: number;
};

export type AssistantMarkdownCodeFenceInfo = {
  codeLanguageLabel: string;
  codeFenceDisplayLabel?: string | undefined;
  codeFenceFilePath?: string | undefined;
  sourceLineRange?: AssistantMarkdownSourceLineRange | undefined;
};

type AssistantMarkdownRenderSectionBase = {
  sectionKey: string;
};

export type AssistantMarkdownRenderSection =
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "markdown"; markdownText: string })
  | (AssistantMarkdownRenderSectionBase & { sectionKind: "streamingTail"; streamingTailText: string })
  | (AssistantMarkdownRenderSectionBase & {
    sectionKind: "codeFence";
    codeFenceText: string;
    codeFenceInfo: AssistantMarkdownCodeFenceInfo;
    isStreamingOpenCodeFence: boolean;
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
  preparedMarkdownText?: string | undefined;
  isStreaming?: boolean | undefined;
  renderSectionStartOffsetByKey?: ReadonlyMap<string, number> | undefined;
};

export type AssistantMarkdownVisibleListLine = {
  listItemIndentText: string;
  listItemMarkerText: string;
  listItemText: string;
};

export type AssistantUnifiedDiffFileSummary = {
  filePath: string;
  addedLineCount: number;
  removedLineCount: number;
};
