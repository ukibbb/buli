import { CodeRenderable, type MarkdownOptions, type RenderContext, type Renderable } from "@opentui/core";
import { decorateAssistantMarkdownProseChunks } from "./assistantMarkdownChunkDecorators.ts";
import {
  isAssistantMarkdownCodeToken,
  isAssistantMarkdownDashOnlyParagraphToken,
  isAssistantMarkdownHeadingToken,
  isAssistantMarkdownParagraphToken,
} from "./assistantMarkdownTextFormatting.ts";
import { assistantMarkdownSyntaxStyle } from "./codeRenderingTheme.ts";

function applyAssistantMarkdownFlowSpacing(defaultRenderable: CodeRenderable): void {
  defaultRenderable.marginBottom = 1;
}

function createHiddenAssistantMarkdownBreakRenderable(renderContext: RenderContext): CodeRenderable {
  return new CodeRenderable(renderContext, {
    content: "",
    drawUnstyledText: true,
    filetype: "text",
    marginBottom: 1,
    streaming: true,
    syntaxStyle: assistantMarkdownSyntaxStyle,
    width: "100%",
  });
}

function enableImmediateTextDrawingOnNestedCodeRenderables(renderable: Renderable): void {
  if (renderable instanceof CodeRenderable) {
    renderable.drawUnstyledText = true;
  }
  for (const childRenderable of renderable.getChildren()) {
    enableImmediateTextDrawingOnNestedCodeRenderables(childRenderable);
  }
}

export function createAssistantMarkdownChromeRenderNode(): NonNullable<MarkdownOptions["renderNode"]> {
  return (token, context) => {
    const defaultRenderable = context.defaultRender();

    if (token.type === "hr") {
      return defaultRenderable ? createHiddenAssistantMarkdownBreakRenderable(defaultRenderable.ctx) : defaultRenderable;
    }

    if (defaultRenderable instanceof CodeRenderable) {
      defaultRenderable.drawUnstyledText = true;

      if (isAssistantMarkdownCodeToken(token)) {
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      if (isAssistantMarkdownHeadingToken(token)) {
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      if (isAssistantMarkdownDashOnlyParagraphToken(token)) {
        // Dash-only paragraphs slip through during streaming before the parser classifies
        // them as `hr`. Hide both so raw `---` does not leak, without drawing a divider.
        defaultRenderable.content = "";
        defaultRenderable.filetype = "text";
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
