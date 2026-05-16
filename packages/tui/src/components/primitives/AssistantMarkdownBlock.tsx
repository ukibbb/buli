import type { ReactNode } from "react";
import { CodeRenderable, RGBA, SyntaxStyle, type MarkdownOptions } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

export type AssistantMarkdownBlockProps = {
  markdownText: string;
  isStreaming: boolean;
  horizontalRuleColor: string;
};

const assistantMarkdownSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  conceal: { fg: RGBA.fromHex(chatScreenTheme.borderSubtle) },

  "markup.heading": { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true },
  "markup.italic": { fg: RGBA.fromHex(chatScreenTheme.textPrimary), italic: true },
  "markup.strong": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.strikethrough": { fg: RGBA.fromHex(chatScreenTheme.textDim), dim: true },
  "markup.link": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "markup.link.label": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), underline: true },
  "markup.link.url": { fg: RGBA.fromHex(chatScreenTheme.textSecondary), dim: true },
  "markup.raw": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "markup.raw.block": { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },

  keyword: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.import": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.export": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.control": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  "keyword.return": { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  string: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "string.special": { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  escape: { fg: RGBA.fromHex(chatScreenTheme.accentPink) },
  comment: { fg: RGBA.fromHex(chatScreenTheme.textDim), italic: true },
  number: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  boolean: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  constant: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  "constant.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  function: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.call": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.method": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "function.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  type: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  "type.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  property: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  variable: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  "variable.builtin": { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  parameter: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  operator: { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  punctuation: { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "punctuation.bracket": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "punctuation.delimiter": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  tag: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  attribute: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  decorator: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  namespace: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
  module: { fg: RGBA.fromHex(chatScreenTheme.accentPrimaryMuted) },
});

const assistantMarkdownHeadingSyntaxStyleByDepth = {
  1: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  2: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  3: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  fallback: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true } }),
} as const;

const assistantMarkdownHorizontalRuleText = "─".repeat(300);
const dashOnlyParagraphPattern = /^[-*_\s]{3,}$/;

type AssistantMarkdownToken = Parameters<NonNullable<MarkdownOptions["renderNode"]>>[0];
type AssistantMarkdownHeadingToken = AssistantMarkdownToken & { type: "heading"; text: string; depth: number };
type AssistantMarkdownParagraphToken = AssistantMarkdownToken & { type: "paragraph"; text: string };

function isAssistantMarkdownHeadingToken(token: AssistantMarkdownToken): token is AssistantMarkdownHeadingToken {
  return (
    token.type === "heading" &&
    "text" in token &&
    typeof token.text === "string" &&
    "depth" in token &&
    typeof token.depth === "number"
  );
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

export function AssistantMarkdownBlock(props: AssistantMarkdownBlockProps): ReactNode {
  const horizontalRuleSyntaxStyle = SyntaxStyle.fromStyles({
    default: { fg: RGBA.fromHex(props.horizontalRuleColor) },
  });

  const renderMarkdownNodeWithImmediatePlainTextFallback: NonNullable<MarkdownOptions["renderNode"]> = (
    token,
    context,
  ) => {
    const defaultRenderable = context.defaultRender();

    if (defaultRenderable instanceof CodeRenderable) {
      // OpenTUI renders prose through an internal markdown CodeRenderable. Keep that
      // default path, but avoid a blank first frame while Tree-sitter highlighting runs.
      defaultRenderable.drawUnstyledText = true;

      if (isAssistantMarkdownHeadingToken(token)) {
        // Leading newline gives breathing room before each heading, including after an HR.
        defaultRenderable.content = `\n${token.text}`;
        defaultRenderable.filetype = "text";
        defaultRenderable.syntaxStyle = resolveAssistantMarkdownHeadingSyntaxStyle(token.depth);
        return defaultRenderable;
      }

      if (token.type === "hr" || isAssistantMarkdownDashOnlyParagraphToken(token)) {
        // Dash-only paragraphs slip through during streaming before the parser classifies
        // them as `hr`. Render both the same way to avoid raw `---` leaking on screen.
        defaultRenderable.content = assistantMarkdownHorizontalRuleText;
        defaultRenderable.filetype = "text";
        defaultRenderable.syntaxStyle = horizontalRuleSyntaxStyle;
        defaultRenderable.wrapMode = "none";
        return defaultRenderable;
      }
    }

    return defaultRenderable;
  };

  return (
    <markdown
      bg={chatScreenTheme.bg}
      conceal={true}
      concealCode={false}
      content={props.markdownText}
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
