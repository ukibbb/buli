import type { ReactNode } from "react";
import { CodeRenderable, RGBA, SyntaxStyle, type MarkdownOptions } from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

export type AssistantMarkdownBlockProps = {
  markdownText: string;
  isStreaming: boolean;
};

const assistantMarkdownSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  emphasis: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), italic: true },
  strong: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true },
  link: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), underline: true },
  "markup.heading.1": { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true },
  "markup.heading.2": { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true },
  "markup.heading.3": { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true },
  "markup.heading": { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true },
  "markup.list": { fg: RGBA.fromHex(chatScreenTheme.textSecondary) },
  "markup.quote": { fg: RGBA.fromHex(chatScreenTheme.textSecondary), italic: true },
  "markup.raw": { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
  string: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  keyword: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true },
  comment: { fg: RGBA.fromHex(chatScreenTheme.textDim), italic: true },
  number: { fg: RGBA.fromHex(chatScreenTheme.accentAmber) },
  type: { fg: RGBA.fromHex(chatScreenTheme.accentCyan) },
});

const renderMarkdownNodeWithImmediatePlainTextFallback: NonNullable<MarkdownOptions["renderNode"]> = (
  _token,
  context,
) => {
  const defaultRenderable = context.defaultRender();

  if (defaultRenderable instanceof CodeRenderable) {
    // OpenTUI renders prose through an internal markdown CodeRenderable. Keep that
    // default path, but avoid a blank first frame while Tree-sitter highlighting runs.
    defaultRenderable.drawUnstyledText = true;
  }

  return defaultRenderable;
};

export function AssistantMarkdownBlock(props: AssistantMarkdownBlockProps): ReactNode {
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
        borderColor: chatScreenTheme.borderSubtle,
        borders: true,
        cellPadding: 1,
        outerBorder: true,
        selectable: true,
        widthMode: "full",
        wrapMode: "word",
      }}
      treeSitterClient={openTuiSharedTreeSitterClient}
      width="100%"
    />
  );
}
