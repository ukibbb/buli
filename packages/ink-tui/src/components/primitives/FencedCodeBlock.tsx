import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { SyntaxHighlightSpan, SyntaxHighlightSpanStyle } from "@buli/contracts";
import { chatScreenTheme } from "../../chatScreenTheme.ts";

// Fenced code blocks in the design render as a surface-1 box with an optional
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
    <Box
      backgroundColor={chatScreenTheme.surfaceOne}
      borderColor={chatScreenTheme.borderSubtle}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      {props.languageLabel ? (
        <Box width="100%">
          <Text color={chatScreenTheme.textDim}>{`// ${props.languageLabel}`}</Text>
        </Box>
      ) : null}
      {props.codeLines.map((fencedCodeBlockLine, index) => (
        <Box key={`code-line-${index}`} width="100%">
          <Box flexShrink={0} marginRight={1} width={gutterWidth}>
            <Text color={chatScreenTheme.textDim}>
              {fencedCodeBlockLine.lineNumber === undefined
                ? " ".repeat(gutterWidth)
                : String(fencedCodeBlockLine.lineNumber).padStart(gutterWidth, " ")}
            </Text>
          </Box>
          <Box flexShrink={1}>
            <FencedCodeBlockLineContent fencedCodeBlockLine={fencedCodeBlockLine} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function FencedCodeBlockLineContent(props: { fencedCodeBlockLine: FencedCodeBlockLine }): ReactNode {
  const { fencedCodeBlockLine } = props;
  if (!fencedCodeBlockLine.syntaxHighlightSpans || fencedCodeBlockLine.syntaxHighlightSpans.length === 0) {
    return <Text color={chatScreenTheme.textPrimary}>{fencedCodeBlockLine.lineText}</Text>;
  }
  return (
    <Text>
      {fencedCodeBlockLine.syntaxHighlightSpans.map((syntaxHighlightSpan, index) => (
        <Text color={syntaxStyleColors[syntaxHighlightSpan.spanStyle]} key={index}>
          {syntaxHighlightSpan.spanText}
        </Text>
      ))}
    </Text>
  );
}
