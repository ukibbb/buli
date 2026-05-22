import type { ReactNode } from "react";
import type { ToolCallReadPreviewLine } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { pathToFiletype } from "@opentui/core";
import { AssistantMarkdownBlock } from "./AssistantMarkdownBlock.tsx";
import { FencedCodeBlock } from "./FencedCodeBlock.tsx";

export type ReadFilePreviewRenderKind = "renderedMarkdownDocument" | "sourceText";

export type ReadFilePreviewRenderKindInput = {
  readFilePath: string;
  readLineCount?: number | undefined;
  returnedLineCount?: number | undefined;
  previewLines: readonly ToolCallReadPreviewLine[];
  wasLineCountTruncated?: boolean | undefined;
};

export type ReadFilePreviewBlockProps = ReadFilePreviewRenderKindInput;

const markdownFilePathExtensionPattern = /\.(?:md|markdown|mdown|mkd|mkdn|mdx)$/i;

export function ReadFilePreviewBlock(props: ReadFilePreviewBlockProps): ReactNode {
  const readFilePreviewRenderKind = resolveReadFilePreviewRenderKind(props);
  if (readFilePreviewRenderKind === "renderedMarkdownDocument") {
    return <ReadMarkdownDocumentPreview previewLines={props.previewLines} />;
  }

  return (
    <FencedCodeBlock
      variant="embedded"
      conceal={false}
      filePath={props.readFilePath}
      wrapMode="char"
      codeLines={props.previewLines.map((previewLine) => ({
        lineNumber: previewLine.lineNumber,
        lineText: previewLine.lineText,
        ...(previewLine.syntaxHighlightSpans
          ? { syntaxHighlightSpans: previewLine.syntaxHighlightSpans }
          : {}),
      }))}
    />
  );
}

export function resolveReadFilePreviewRenderKind(
  input: ReadFilePreviewRenderKindInput,
): ReadFilePreviewRenderKind {
  if (isMarkdownDocumentReadFilePath(input.readFilePath) && isCompleteReadPreviewDocument(input)) {
    return "renderedMarkdownDocument";
  }

  return "sourceText";
}

export function isMarkdownDocumentReadFilePath(readFilePath: string): boolean {
  return pathToFiletype(readFilePath) === "markdown" || markdownFilePathExtensionPattern.test(readFilePath);
}

function isCompleteReadPreviewDocument(input: ReadFilePreviewRenderKindInput): boolean {
  if (input.wasLineCountTruncated === true || input.readLineCount === undefined) {
    return false;
  }

  const firstPreviewLineNumber = input.previewLines.at(0)?.lineNumber;
  if (firstPreviewLineNumber !== 1) {
    return false;
  }

  const returnedLineCount = input.returnedLineCount ?? input.previewLines.length;
  return returnedLineCount === input.readLineCount && input.previewLines.length === input.readLineCount;
}

function ReadMarkdownDocumentPreview(props: {
  previewLines: readonly ToolCallReadPreviewLine[];
}): ReactNode {
  const markdownDocumentText = props.previewLines.map((previewLine) => previewLine.lineText).join("\n");
  return (
    <AssistantMarkdownBlock
      horizontalRuleColor={chatScreenTheme.borderSubtle}
      isStreaming={false}
      markdownText={markdownDocumentText}
    />
  );
}
