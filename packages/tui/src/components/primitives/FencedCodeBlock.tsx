import type { ReactNode } from "react";
import type { SyntaxHighlightSpan, SyntaxHighlightSpanStyle } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { RGBA, SyntaxStyle } from "@opentui/core";

// Fenced code blocks render as a surface-1 rounded-border box with an optional
// language label, then one row per code line. When the caller supplies
// syntaxHighlightSpans we render colourised per-span runs; otherwise we
// fall back to plain primary-colour text.
export type FencedCodeBlockLine = {
  lineNumber?: number;
  lineText: string;
  syntaxHighlightSpans?: SyntaxHighlightSpan[];
};

// "standalone" is the pen-file FencedCodeBlock card — surface-1 background
// inside a rounded subtle border (used when the code is a first-class block
// of assistant prose). "embedded" is the pen-file Read tool card's code body
// (ZDqFx) — flush against the card's bg with no second border, used when an
// outer SurfaceCard already provides the chrome.
export type FencedCodeBlockVariant = "standalone" | "embedded";

export type FencedCodeBlockProps = {
  variant?: FencedCodeBlockVariant;
  languageLabel?: string;
  codeLines: FencedCodeBlockLine[];
};

const syntaxStyleColors: Record<SyntaxHighlightSpanStyle, string> = {
  keyword: chatScreenTheme.accentPurple,
  identifier: chatScreenTheme.textPrimary,
  string: chatScreenTheme.accentAmber,
  comment: chatScreenTheme.textDim,
  module: chatScreenTheme.accentPrimaryMuted,
  type: chatScreenTheme.accentCyan,
  number: chatScreenTheme.accentAmber,
  symbol: chatScreenTheme.textSecondary,
  self: chatScreenTheme.accentPrimaryMuted,
  decorator: chatScreenTheme.accentAmber,
};

const openTuiCodeSyntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.import": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  string: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  comment: { fg: RGBA.fromHex(chatScreenTheme.textDim), italic: true },
  number: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  boolean: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  function: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.call": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  type: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  property: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  variable: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  operator: { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  punctuation: { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
});

const openTuiCodeFiletypesByLanguageLabel: Record<string, string> = {
  bash: "bash",
  css: "css",
  dockerfile: "dockerfile",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "javascriptreact",
  markdown: "markdown",
  md: "markdown",
  py: "python",
  python: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "typescriptreact",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

export function FencedCodeBlock(props: FencedCodeBlockProps): ReactNode {
  const gutterWidth = Math.max(
    2,
    String(props.codeLines.at(-1)?.lineNumber ?? props.codeLines.length).length,
  );
  const variant: FencedCodeBlockVariant = props.variant ?? "standalone";
  const isStandalone = variant === "standalone";
  const canUseOpenTuiCodeRenderable = isStandalone && props.codeLines.every(
    (fencedCodeBlockLine) => fencedCodeBlockLine.lineNumber === undefined &&
      (!fencedCodeBlockLine.syntaxHighlightSpans || fencedCodeBlockLine.syntaxHighlightSpans.length === 0),
  );
  return (
    <box
      {...(isStandalone
        ? {
            backgroundColor: chatScreenTheme.surfaceOne,
            borderColor: chatScreenTheme.borderSubtle,
            borderStyle: "rounded" as const,
            border: true,
          }
        : {})}
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      {props.languageLabel ? (
        <box width="100%">
          <text fg={chatScreenTheme.textDim}>{`// ${props.languageLabel}`}</text>
        </box>
      ) : null}
      {canUseOpenTuiCodeRenderable ? (
        <OpenTuiFencedCodeContent
          codeText={props.codeLines.map((fencedCodeBlockLine) => fencedCodeBlockLine.lineText).join("\n")}
          languageLabel={props.languageLabel}
        />
      ) : (
        props.codeLines.map((fencedCodeBlockLine, index) => (
          <box key={`code-line-${index}`} flexDirection="row" alignItems="center" overflow="hidden" width="100%">
            <box flexShrink={0} marginRight={1} width={gutterWidth}>
              <text fg={chatScreenTheme.textDim}>
                {fencedCodeBlockLine.lineNumber === undefined
                  ? " ".repeat(gutterWidth)
                  : String(fencedCodeBlockLine.lineNumber).padStart(gutterWidth, " ")}
              </text>
            </box>
            <box flexShrink={1} minWidth={0} overflow="hidden" width="100%">
              <FencedCodeBlockLineContent fencedCodeBlockLine={fencedCodeBlockLine} />
            </box>
          </box>
        ))
      )}
    </box>
  );
}

function OpenTuiFencedCodeContent(props: { codeText: string; languageLabel: string | undefined }): ReactNode {
  return (
    <code
      content={props.codeText}
      drawUnstyledText={true}
      filetype={resolveOpenTuiCodeFiletype(props.languageLabel)}
      selectable={true}
      syntaxStyle={openTuiCodeSyntaxStyle}
      width="100%"
      wrapMode="none"
    />
  );
}

function resolveOpenTuiCodeFiletype(languageLabel: string | undefined): string {
  const normalizedLanguageLabel = languageLabel?.trim().toLowerCase();
  if (!normalizedLanguageLabel) {
    return "text";
  }

  return openTuiCodeFiletypesByLanguageLabel[normalizedLanguageLabel] ?? normalizedLanguageLabel;
}

function FencedCodeBlockLineContent(props: { fencedCodeBlockLine: FencedCodeBlockLine }): ReactNode {
  const { fencedCodeBlockLine } = props;
  if (!fencedCodeBlockLine.syntaxHighlightSpans || fencedCodeBlockLine.syntaxHighlightSpans.length === 0) {
    return <text fg={chatScreenTheme.textPrimary} truncate={true} wrapMode="none" width="100%">{fencedCodeBlockLine.lineText}</text>;
  }
  return (
    <text truncate={true} wrapMode="none" width="100%">
      {fencedCodeBlockLine.syntaxHighlightSpans.map((syntaxHighlightSpan, index) => (
        <span fg={syntaxStyleColors[syntaxHighlightSpan.spanStyle]} key={index}>
          {syntaxHighlightSpan.spanText}
        </span>
      ))}
    </text>
  );
}
