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
  emphasis: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), italic: true },
  strong: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  link: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), underline: true },
  "markup.list": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "markup.quote": { fg: RGBA.fromHex(chatScreenTheme.textSecondary), italic: true },
  "markup.raw": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  string: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  keyword: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  comment: { fg: RGBA.fromHex(chatScreenTheme.textDim), italic: true },
  number: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  type: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
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
