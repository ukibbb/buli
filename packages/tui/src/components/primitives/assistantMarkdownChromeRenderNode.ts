import { CodeRenderable, type MarkdownOptions, type Renderable, type SyntaxStyle } from "@opentui/core";
import { decorateAssistantMarkdownProseChunks } from "./assistantMarkdownChunkDecorators.ts";
import {
  formatAssistantMarkdownHeadingText,
  isAssistantMarkdownCodeToken,
  isAssistantMarkdownDashOnlyParagraphToken,
  isAssistantMarkdownHeadingToken,
  isAssistantMarkdownParagraphToken,
} from "./assistantMarkdownTextFormatting.ts";
import { resolveAssistantMarkdownHeadingSyntaxStyle } from "./assistantMarkdownTerminalTheme.ts";

export type AssistantMarkdownChromeRenderNodeOptions = Readonly<{
  horizontalRuleText: string;
  horizontalRuleSyntaxStyle: SyntaxStyle;
}>;

function applyAssistantMarkdownFlowSpacing(defaultRenderable: CodeRenderable): void {
  defaultRenderable.marginBottom = 1;
}

function enableImmediateTextDrawingOnNestedCodeRenderables(renderable: Renderable): void {
  if (renderable instanceof CodeRenderable) {
    renderable.drawUnstyledText = true;
  }
  for (const childRenderable of renderable.getChildren()) {
    enableImmediateTextDrawingOnNestedCodeRenderables(childRenderable);
  }
}

export function createAssistantMarkdownChromeRenderNode(
  options: AssistantMarkdownChromeRenderNodeOptions,
): NonNullable<MarkdownOptions["renderNode"]> {
  return (token, context) => {
    const defaultRenderable = context.defaultRender();

    if (defaultRenderable instanceof CodeRenderable) {
      defaultRenderable.drawUnstyledText = true;

      if (isAssistantMarkdownCodeToken(token)) {
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      if (isAssistantMarkdownHeadingToken(token)) {
        // A mutated default would be updated in place when the heading grows during
        // streaming, resetting content to the raw `## …` text and dropping the glyph
        // formatting. Returning a fresh renderable marks the block canUpdateInPlace=false,
        // so renderNode runs again on every change and reapplies the formatting.
        return new CodeRenderable(defaultRenderable.ctx, {
          // Leading newline gives breathing room before each heading, including after an HR.
          content: formatAssistantMarkdownHeadingText(token.text, token.depth),
          conceal: context.conceal,
          drawUnstyledText: true,
          filetype: "markdown",
          marginBottom: 1,
          onChunks: decorateAssistantMarkdownProseChunks,
          streaming: true,
          syntaxStyle: resolveAssistantMarkdownHeadingSyntaxStyle(token.depth),
          ...(context.treeSitterClient ? { treeSitterClient: context.treeSitterClient } : {}),
          width: "100%",
        });
      }

      if (token.type === "hr" || isAssistantMarkdownDashOnlyParagraphToken(token)) {
        // Dash-only paragraphs slip through during streaming before the parser classifies
        // them as `hr`. Render both the same way to avoid raw `---` leaking on screen.
        defaultRenderable.content = options.horizontalRuleText;
        defaultRenderable.filetype = "text";
        defaultRenderable.syntaxStyle = options.horizontalRuleSyntaxStyle;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.wrapMode = "none";
        return defaultRenderable;
      }

      if (isAssistantMarkdownParagraphToken(token)) {
        // Keep the raw markdown content: OpenTUI conceal+linkify renders links as
        // clickable "text (url)" and strikethrough natively; rewriting the content
        // here would drop the URL and diverge from the in-place block update path,
        // which always re-applies the raw token text.
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
      return defaultRenderable;
    }

    if (defaultRenderable) {
      // OpenTUI builds list and blockquote children with drawUnstyledText=false, which
      // keeps their text invisible until tree-sitter highlighting completes (or forever
      // when it never does). Force immediate drawing on every nested code renderable.
      enableImmediateTextDrawingOnNestedCodeRenderables(defaultRenderable);
    }

    return defaultRenderable;
  };
}
