import { Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../../chatScreenTheme.ts";

// Inline-span vocabulary matches the pen file's inline components
// (InlineBold, InlineItalic, InlineStrike, InlineLink, InlineCode). Keeping
// them explicit rather than a generic "styled string" means rendering can
// apply the right chalk style per span and Ink's nested-Text model can
// compose them into a single line without fighting the transform chain.
export type InlineMarkdownSpan =
  | { spanKind: "plain"; spanText: string }
  | { spanKind: "bold"; spanText: string }
  | { spanKind: "italic"; spanText: string }
  | { spanKind: "strike"; spanText: string }
  | { spanKind: "code"; spanText: string }
  | { spanKind: "link"; spanText: string; hrefUrl: string };

export type InlineMarkdownTextProps = {
  spans: InlineMarkdownSpan[];
};

export function InlineMarkdownText(props: InlineMarkdownTextProps): ReactNode {
  return (
    <Text>
      {props.spans.map((inlineMarkdownSpan, index) => (
        <InlineMarkdownSpanView inlineMarkdownSpan={inlineMarkdownSpan} key={index} />
      ))}
    </Text>
  );
}

function InlineMarkdownSpanView(props: { inlineMarkdownSpan: InlineMarkdownSpan }): ReactNode {
  const { inlineMarkdownSpan } = props;
  if (inlineMarkdownSpan.spanKind === "plain") {
    return <Text color={chatScreenTheme.textPrimary}>{inlineMarkdownSpan.spanText}</Text>;
  }
  if (inlineMarkdownSpan.spanKind === "bold") {
    return (
      <Text bold color={chatScreenTheme.textPrimary}>
        {inlineMarkdownSpan.spanText}
      </Text>
    );
  }
  if (inlineMarkdownSpan.spanKind === "italic") {
    return (
      <Text color={chatScreenTheme.textPrimary} italic>
        {inlineMarkdownSpan.spanText}
      </Text>
    );
  }
  if (inlineMarkdownSpan.spanKind === "strike") {
    return (
      <Text color={chatScreenTheme.textMuted} strikethrough>
        {inlineMarkdownSpan.spanText}
      </Text>
    );
  }
  if (inlineMarkdownSpan.spanKind === "code") {
    return (
      <Text backgroundColor={chatScreenTheme.surfaceTwo} color={chatScreenTheme.accentCyan}>
        {`\u2009${inlineMarkdownSpan.spanText}\u2009`}
      </Text>
    );
  }
  // Remaining arm: link. The url is embedded via OSC 8 so terminals that
  // support the sequence make it clickable; terminals that do not still
  // render the visible text thanks to Ink's ANSI sanitizer preserving OSC.
  const hyperlinkStart = `\u001b]8;;${inlineMarkdownSpan.hrefUrl}\u001b\\`;
  const hyperlinkEnd = "\u001b]8;;\u001b\\";
  return (
    <Text color={chatScreenTheme.accentCyan} underline>
      {`${hyperlinkStart}${inlineMarkdownSpan.spanText}${hyperlinkEnd}`}
    </Text>
  );
}
