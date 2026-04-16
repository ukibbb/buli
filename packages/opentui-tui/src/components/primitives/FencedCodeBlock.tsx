import type { ReactNode } from "react";
import type { SyntaxHighlightSpan, SyntaxHighlightSpanStyle } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

// Fenced code blocks render as a surface-1 rounded-border box with an optional
// language label, then one row per code line. When the caller supplies
// syntaxHighlightSpans we render colourised per-span runs; otherwise we
// fall back to plain primary-colour text.
export type FencedCodeBlockLine = {
  lineNumber?: number;
  lineText: string;
  syntaxHighlightSpans?: SyntaxHighlightSpan[];
};

export type FencedCodeBlockProps = {
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

export function FencedCodeBlock(props: FencedCodeBlockProps): ReactNode {
  const gutterWidth = Math.max(
    2,
    String(props.codeLines.at(-1)?.lineNumber ?? props.codeLines.length).length,
  );
  return (
    <box
      backgroundColor={chatScreenTheme.surfaceOne}
      borderColor={chatScreenTheme.borderSubtle}
      borderStyle="rounded"
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
      {props.codeLines.map((fencedCodeBlockLine, index) => (
        <box key={`code-line-${index}`} width="100%">
          <box flexShrink={0} marginRight={1} width={gutterWidth}>
            <text fg={chatScreenTheme.textDim}>
              {fencedCodeBlockLine.lineNumber === undefined
                ? " ".repeat(gutterWidth)
                : String(fencedCodeBlockLine.lineNumber).padStart(gutterWidth, " ")}
            </text>
          </box>
          <box flexShrink={1}>
            <FencedCodeBlockLineContent fencedCodeBlockLine={fencedCodeBlockLine} />
          </box>
        </box>
      ))}
    </box>
  );
}

function FencedCodeBlockLineContent(props: { fencedCodeBlockLine: FencedCodeBlockLine }): ReactNode {
  const { fencedCodeBlockLine } = props;
  if (!fencedCodeBlockLine.syntaxHighlightSpans || fencedCodeBlockLine.syntaxHighlightSpans.length === 0) {
    return <text fg={chatScreenTheme.textPrimary}>{fencedCodeBlockLine.lineText}</text>;
  }
  return (
    <text>
      {fencedCodeBlockLine.syntaxHighlightSpans.map((syntaxHighlightSpan, index) => (
        <span fg={syntaxStyleColors[syntaxHighlightSpan.spanStyle]} key={index}>
          {syntaxHighlightSpan.spanText}
        </span>
      ))}
    </text>
  );
}
