import type { ReactNode } from "react";
import { TextAttributes } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import type { InlineSpan } from "@buli/contracts";

// Inline-span vocabulary matches the pen file's inline components
// (InlineBold, InlineItalic, InlineStrike, InlineLink, InlineCode). Keeping
// them explicit rather than a generic "styled string" means rendering can
// apply the right style per span and OpenTUI's nested-span model can
// compose them into a single line without fighting the transform chain.
export type InlineMarkdownSpan = InlineSpan;

export type InlineMarkdownTextProps = {
  spans: InlineMarkdownSpan[];
};

export function InlineMarkdownText(props: InlineMarkdownTextProps): ReactNode {
  return (
    <text>
      {props.spans.map((inlineMarkdownSpan, index) => (
        <InlineMarkdownSpanView inlineMarkdownSpan={inlineMarkdownSpan} key={index} />
      ))}
    </text>
  );
}

function InlineMarkdownSpanView(props: { inlineMarkdownSpan: InlineMarkdownSpan }): ReactNode {
  const { inlineMarkdownSpan } = props;
  if (inlineMarkdownSpan.spanKind === "plain") {
    return <span fg={chatScreenTheme.textPrimary}>{inlineMarkdownSpan.spanText}</span>;
  }
  if (inlineMarkdownSpan.spanKind === "bold") {
    return (
      <b fg={chatScreenTheme.textPrimary}>
        {inlineMarkdownSpan.spanText}
      </b>
    );
  }
  if (inlineMarkdownSpan.spanKind === "italic") {
    return (
      <i fg={chatScreenTheme.textPrimary}>
        {inlineMarkdownSpan.spanText}
      </i>
    );
  }
  if (inlineMarkdownSpan.spanKind === "strike") {
    // strikethrough has no shorthand tag; set attributes manually
    return (
      <span fg={chatScreenTheme.textMuted} attributes={TextAttributes.STRIKETHROUGH}>
        {inlineMarkdownSpan.spanText}
      </span>
    );
  }
  if (inlineMarkdownSpan.spanKind === "code") {
    return (
      <span bg={chatScreenTheme.surfaceTwo} fg={chatScreenTheme.accentCyan}>
        {`\u2009${inlineMarkdownSpan.spanText}\u2009`}
      </span>
    );
  }
  if (inlineMarkdownSpan.spanKind === "highlight") {
    return <span fg={chatScreenTheme.accentAmber}>{inlineMarkdownSpan.spanText}</span>;
  }
  if (inlineMarkdownSpan.spanKind === "subscript") {
    return <span fg={chatScreenTheme.textSecondary}>{inlineMarkdownSpan.spanText}</span>;
  }
  if (inlineMarkdownSpan.spanKind === "superscript") {
    return <span fg={chatScreenTheme.textSecondary}>{inlineMarkdownSpan.spanText}</span>;
  }
  // Remaining arm: link. OSC 8 hyperlink sequence so terminals that support
  // it make the text clickable; terminals that do not still render the text.
  const hyperlinkStart = `\u001b]8;;${inlineMarkdownSpan.hrefUrl}\u001b\\`;
  const hyperlinkEnd = "\u001b]8;;\u001b\\";
  return (
    <u fg={chatScreenTheme.accentCyan}>
      {`${hyperlinkStart}${inlineMarkdownSpan.spanText}${hyperlinkEnd}`}
    </u>
  );
}
