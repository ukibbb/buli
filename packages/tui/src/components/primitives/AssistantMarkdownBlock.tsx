import { useCallback, useMemo, type ReactNode } from "react";
import {
  CodeRenderable,
  RGBA,
  SyntaxStyle,
  type MarkdownOptions,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  decorateAssistantMarkdownDiffFenceChunks,
  decorateAssistantMarkdownListChunks,
  decorateAssistantMarkdownProseChunks,
} from "./assistantMarkdownChunkDecorators.ts";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

export type AssistantMarkdownBlockProps = {
  markdownText: string;
  isStreaming: boolean;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
};

const assistantMarkdownSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  conceal: { fg: RGBA.fromHex(chatScreenTheme.borderSubtle) },

  "markup.heading": { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true },
  "markup.heading.1": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
  "markup.heading.2": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.heading.3": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "punctuation.definition.heading": { fg: RGBA.fromHex(chatScreenTheme.textDim), bold: true },
  "markup.italic": { fg: RGBA.fromHex(chatScreenTheme.textPrimary), italic: true },
  "markup.strong": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.strikethrough": { fg: RGBA.fromHex(chatScreenTheme.textDim), dim: true },
  "markup.link": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "markup.link.bracket.close": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "markup.link.label": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), underline: true },
  "markup.link.url": { fg: RGBA.fromHex(chatScreenTheme.textSecondary), dim: true },
  "markup.list": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.bullet": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.enumeration": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.marker": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.numbered": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.ordered": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.unordered": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "punctuation.definition.list": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.list.checked": { fg: RGBA.fromHex(chatScreenTheme.accentGreen) },
  "markup.list.unchecked": { fg: RGBA.fromHex(chatScreenTheme.textDim) },
  "markup.quote": { fg: RGBA.fromHex(chatScreenTheme.textSecondary), italic: true },
  "markup.quote.marker": { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted), bold: true },
  "punctuation.definition.quote": { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted), bold: true },
  "markup.raw": { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true },
  "markup.raw.block": { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  "markup.fenced_code.block": { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  "markup.table": { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  "markup.table.header": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
  "punctuation.separator.table": { fg: RGBA.fromHex(chatScreenTheme.borderSubtle) },
  "diff.plus": { fg: RGBA.fromHex(chatScreenTheme.accentGreen) },
  "diff.minus": { fg: RGBA.fromHex(chatScreenTheme.accentRed) },
  "diff.delta": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
  "punctuation.definition.inserted": { fg: RGBA.fromHex(chatScreenTheme.accentGreen) },
  "punctuation.definition.deleted": { fg: RGBA.fromHex(chatScreenTheme.accentRed) },

  character: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "character.special": { fg: RGBA.fromHex(chatScreenTheme.accentPink) },
  label: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  import: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },

  keyword: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.conditional": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.conditional.ternary": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.coroutine": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.directive": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.exception": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.function": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.import": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.modifier": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.operator": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.repeat": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.return": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.type": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },

  string: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "string.escape": { fg: RGBA.fromHex(chatScreenTheme.accentPink) },
  "string.regexp": { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "string.special": { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "string.special.url": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), underline: true },

  comment: { fg: RGBA.fromHex(chatScreenTheme.textDim), italic: true },
  "comment.documentation": { fg: RGBA.fromHex(chatScreenTheme.textDim), italic: true },

  number: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "number.float": { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  boolean: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  constant: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "constant.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },

  constructor: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  function: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.call": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.method": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.method.call": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },

  type: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "type.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },

  property: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  variable: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  "variable.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  "variable.member": { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  "variable.parameter": { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  parameter: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },

  operator: { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  punctuation: { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "punctuation.bracket": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "punctuation.delimiter": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "punctuation.special": { fg: RGBA.fromHex(chatScreenTheme.accentPink) },

  tag: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  attribute: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  decorator: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  namespace: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  module: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  "module.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },

  escape: { fg: RGBA.fromHex(chatScreenTheme.accentPink) },
});

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

const assistantMarkdownUnorderedListMarkers = ["•", "◦", "▪", "▫"] as const;

const minimumAssistantMarkdownChromeRuleLength = 8;
const maximumAssistantMarkdownChromeRuleLength = 120;
const defaultAssistantMarkdownTerminalColumnCount = 80;
const dashOnlyParagraphPattern = /^[-*_\s]{3,}$/;
const calloutMarkerPattern = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?([\s\S]*)$/i;
const codeFenceDiffLanguagePattern = /^(?:diff|patch)$/i;
const codeFenceFileLabelPattern = /(?:^|\s)(?:title|filename|file|path)=("[^"]+"|'[^']+'|[^\s]+)/i;
const codeFenceFallbackFileLabelPattern = /(?:^|\s)(\S+\/\S+\.\S+)/;
const incompleteStreamingFencePattern = /^\s*```[^`]*$/;
const incompleteStreamingListMarkerPattern = /^\s*(?:[-*+]\s*|\d+\.\s*)$/;
const incompleteStreamingHeadingPattern = /^\s*#{1,6}\s*$/;

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
  codeFenceDisplayLabel: string;
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

function resolveAssistantMarkdownHeadingSyntaxStyle(depth: number): SyntaxStyle {
  if (depth === 1) return assistantMarkdownHeadingSyntaxStyleByDepth[1];
  if (depth === 2) return assistantMarkdownHeadingSyntaxStyleByDepth[2];
  if (depth === 3) return assistantMarkdownHeadingSyntaxStyleByDepth[3];
  return assistantMarkdownHeadingSyntaxStyleByDepth.fallback;
}

function formatAssistantMarkdownHeadingText(headingText: string, depth: number): string {
  if (depth === 1) {
    return `\n▌ ${headingText}`;
  }

  if (depth === 2) {
    return `\n◆ ${headingText}`;
  }

  if (depth === 3) {
    return `\n${headingText}`;
  }

  return `\n• ${headingText}`;
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
  return quoteLines.map((quoteLine) => `│ ${quoteLine}`).join("\n");
}

function formatAssistantMarkdownCalloutText(input: { calloutKind: AssistantMarkdownCalloutKind; bodyText: string }): string {
  const bodyLines = input.bodyText.trim().length > 0 ? input.bodyText.trim().split("\n") : [];
  return [`▌ ${input.calloutKind}`, "├" + "─".repeat(Math.max(12, input.calloutKind.length + 2)), ...bodyLines.map((bodyLine) => `│ ${bodyLine}`)].join("\n");
}

function parseAssistantMarkdownCodeFenceInfo(codeFenceInfoString: string | undefined): AssistantMarkdownCodeFenceInfo {
  const normalizedCodeFenceInfoString = codeFenceInfoString?.trim() ?? "";
  const codeLanguageLabel = normalizedCodeFenceInfoString.split(/\s+/)[0] || "code";
  const codeFenceFileLabel = resolveAssistantMarkdownCodeFenceFileLabel(normalizedCodeFenceInfoString);
  return {
    codeLanguageLabel,
    codeFenceDisplayLabel: codeFenceFileLabel ? `${codeLanguageLabel} · ${codeFenceFileLabel}` : codeLanguageLabel,
  };
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

function formatAssistantMarkdownCodeFenceText(codeToken: AssistantMarkdownCodeToken, availableColumnCount: number): string {
  const codeFenceInfo = parseAssistantMarkdownCodeFenceInfo(codeToken.lang);
  if (codeFenceDiffLanguagePattern.test(codeFenceInfo.codeLanguageLabel)) {
    return formatAssistantMarkdownDiffFenceText(codeToken.text, codeFenceInfo, availableColumnCount);
  }

  const topBorderPrefix = `╭─ ${codeFenceInfo.codeFenceDisplayLabel} `;
  return [
    topBorderPrefix + repeatAssistantMarkdownChromeRule({
      availableColumnCount,
      occupiedColumnCount: topBorderPrefix.length,
    }),
    codeToken.text,
    "╰" + repeatAssistantMarkdownChromeRule({ availableColumnCount, occupiedColumnCount: 1 }),
  ].join("\n");
}

function formatAssistantMarkdownDiffFenceText(
  diffText: string,
  codeFenceInfo: AssistantMarkdownCodeFenceInfo,
  availableColumnCount: number,
): string {
  const diffLines = diffText.split("\n").map((diffLine) => `│ ${diffLine}`.trimEnd());
  const diffFenceLabel = `${codeFenceInfo.codeLanguageLabel} changes${
    codeFenceInfo.codeFenceDisplayLabel === codeFenceInfo.codeLanguageLabel
      ? ""
      : ` · ${codeFenceInfo.codeFenceDisplayLabel.replace(`${codeFenceInfo.codeLanguageLabel} · `, "")}`
  }`;
  const topBorderPrefix = `╭─ ${diffFenceLabel} `;
  return [
    topBorderPrefix + repeatAssistantMarkdownChromeRule({
      availableColumnCount,
      occupiedColumnCount: topBorderPrefix.length,
    }),
    ...diffLines,
    "╰" + repeatAssistantMarkdownChromeRule({ availableColumnCount, occupiedColumnCount: 1 }),
  ].join("\n");
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
  return (paragraphText ?? listItem.text ?? "").replace(/\n+/g, " ").trim();
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

export function AssistantMarkdownBlock(props: AssistantMarkdownBlockProps): ReactNode {
  const terminalColumnCount = props.terminalColumnCount ?? defaultAssistantMarkdownTerminalColumnCount;
  const markdownChromeColumnCount = Math.max(20, terminalColumnCount - 4);
  const horizontalRuleText = useMemo(
    () => repeatAssistantMarkdownChromeRule({ availableColumnCount: markdownChromeColumnCount }),
    [markdownChromeColumnCount],
  );
  const preparedMarkdownText = useMemo(
    () => prepareAssistantMarkdownTextForRendering(props.markdownText, props.isStreaming),
    [props.isStreaming, props.markdownText],
  );
  const horizontalRuleSyntaxStyle = useMemo(
    () => SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(props.horizontalRuleColor) } }),
    [props.horizontalRuleColor],
  );

  const renderMarkdownNodeWithImmediatePlainTextFallback = useCallback<NonNullable<MarkdownOptions["renderNode"]>>((token, context) => {
    const defaultRenderable = context.defaultRender();

    if (defaultRenderable instanceof CodeRenderable) {
      // OpenTUI renders prose through an internal markdown CodeRenderable. Keep that
      // default path, but avoid a blank first frame while Tree-sitter highlighting runs.
      defaultRenderable.drawUnstyledText = true;

      if (isAssistantMarkdownCodeToken(token)) {
        defaultRenderable.content = formatAssistantMarkdownCodeFenceText(token, markdownChromeColumnCount);
        if (codeFenceDiffLanguagePattern.test(token.lang?.trim().split(/\s+/)[0] ?? "")) {
          defaultRenderable.filetype = "text";
          defaultRenderable.onChunks = decorateAssistantMarkdownDiffFenceChunks;
        }
        defaultRenderable.wrapMode = "none";
        return defaultRenderable;
      }

      if (isAssistantMarkdownHeadingToken(token)) {
        // Leading newline gives breathing room before each heading, including after an HR.
        defaultRenderable.content = formatAssistantMarkdownHeadingText(token.text, token.depth);
        defaultRenderable.filetype = "text";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        defaultRenderable.syntaxStyle = resolveAssistantMarkdownHeadingSyntaxStyle(token.depth);
        return defaultRenderable;
      }

      if (isAssistantMarkdownBlockquoteToken(token)) {
        const assistantMarkdownCallout = parseAssistantMarkdownCallout(token.text);
        defaultRenderable.content = assistantMarkdownCallout
          ? formatAssistantMarkdownCalloutText(assistantMarkdownCallout)
          : formatAssistantMarkdownQuoteText(token.text);
        defaultRenderable.filetype = "text";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        defaultRenderable.syntaxStyle = assistantMarkdownCallout
          ? assistantMarkdownCalloutSyntaxStyleByKind[assistantMarkdownCallout.calloutKind]
          : assistantMarkdownQuoteSyntaxStyle;
        return defaultRenderable;
      }

      if (isAssistantMarkdownListToken(token)) {
        defaultRenderable.content = formatAssistantMarkdownListText(token);
        defaultRenderable.filetype = "text";
        defaultRenderable.onChunks = decorateAssistantMarkdownListChunks;
        defaultRenderable.syntaxStyle = assistantMarkdownTaskListSyntaxStyle;
        return defaultRenderable;
      }

      if (token.type === "hr" || isAssistantMarkdownDashOnlyParagraphToken(token)) {
        // Dash-only paragraphs slip through during streaming before the parser classifies
        // them as `hr`. Render both the same way to avoid raw `---` leaking on screen.
        defaultRenderable.content = horizontalRuleText;
        defaultRenderable.filetype = "text";
        defaultRenderable.syntaxStyle = horizontalRuleSyntaxStyle;
        defaultRenderable.wrapMode = "none";
        return defaultRenderable;
      }

      defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
    }

    return defaultRenderable;
  }, [horizontalRuleSyntaxStyle, horizontalRuleText, markdownChromeColumnCount]);

  return (
    <markdown
      bg={chatScreenTheme.bg}
      conceal={true}
      concealCode={false}
      content={preparedMarkdownText}
      fg={chatScreenTheme.textPrimary}
      renderNode={renderMarkdownNodeWithImmediatePlainTextFallback}
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
