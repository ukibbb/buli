import type { MarkdownOptions } from "@opentui/core";

export type AssistantMarkdownToken = Parameters<NonNullable<MarkdownOptions["renderNode"]>>[0];
export type AssistantMarkdownCodeToken = AssistantMarkdownToken & { type: "code"; text: string; lang?: string };
export type AssistantMarkdownHeadingToken = AssistantMarkdownToken & { type: "heading"; text: string; depth: number };
export type AssistantMarkdownParagraphToken = AssistantMarkdownToken & { type: "paragraph"; text: string };
export type AssistantMarkdownBlockquoteToken = AssistantMarkdownToken & { type: "blockquote"; text: string };

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

export type AssistantUnifiedDiffFileSummary = {
  filePath: string;
  addedLineCount: number;
  removedLineCount: number;
};
