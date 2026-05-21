import { useCallback, useMemo, type ReactNode } from "react";
import type { SyntaxHighlightSpan } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  infoStringToFiletype,
  pathToFiletype,
  type TextChunk,
} from "@opentui/core";
import {
  codeBlockSyntaxStyle,
  codeLineNumberGutterForegroundColor,
  githubLikeTerminalCodeColors,
  syntaxHighlightSpanForegroundColors,
} from "./codeRenderingTheme.ts";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

export type FencedCodeBlockLine = {
  lineNumber?: number;
  lineText: string;
  syntaxHighlightSpans?: SyntaxHighlightSpan[];
};

// "standalone" wraps the code in a surface-1 / borderSubtle card; "embedded"
// drops the chrome because an outer SurfaceCard already provides it.
export type FencedCodeBlockVariant = "standalone" | "embedded";

export type FencedCodeBlockProps = {
  variant?: FencedCodeBlockVariant;
  languageLabel?: string;
  displayLabel?: string;
  showLabel?: boolean;
  filePath?: string;
  codeLines: FencedCodeBlockLine[];
  wrapMode?: "char" | "none" | "word";
};

export function FencedCodeBlock(props: FencedCodeBlockProps): ReactNode {
  const variant: FencedCodeBlockVariant = props.variant ?? "standalone";
  const isStandalone = variant === "standalone";
  const codeWrapMode = props.wrapMode ?? "none";
  const visibleLabel = props.showLabel === false ? undefined : props.displayLabel ?? props.languageLabel;
  const hasAnyPreSuppliedSyntaxHighlightSpans = props.codeLines.some(
    (codeLine) => codeLine.syntaxHighlightSpans && codeLine.syntaxHighlightSpans.length > 0,
  );
  return (
    <box
      {...(isStandalone
        ? {
            backgroundColor: githubLikeTerminalCodeColors.canvas,
            borderColor: chatScreenTheme.borderSubtle,
            borderStyle: "rounded" as const,
            border: true,
          }
        : {})}
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      {visibleLabel ? (
        <box width="100%">
          <text fg={chatScreenTheme.textDim}>{`// ${visibleLabel}`}</text>
        </box>
      ) : null}
      {hasAnyPreSuppliedSyntaxHighlightSpans ? (
        <FencedCodeBlockPreSuppliedSpanContent codeLines={props.codeLines} wrapMode={codeWrapMode} />
      ) : (
        <OpenTuiFencedCodeContent
          codeLines={props.codeLines}
          filePath={props.filePath}
          languageLabel={props.languageLabel}
          wrapMode={codeWrapMode}
        />
      )}
    </box>
  );
}

function OpenTuiFencedCodeContent(props: {
  codeLines: FencedCodeBlockLine[];
  filePath: string | undefined;
  languageLabel: string | undefined;
  wrapMode: "char" | "none" | "word";
}): ReactNode {
  const codeText = props.codeLines.map((codeLine) => codeLine.lineText).join("\n");
  const codeFiletype = resolveOpenTuiCodeFiletype(props.filePath, props.languageLabel);
  const hasAnyLineNumber = props.codeLines.some((codeLine) => codeLine.lineNumber !== undefined);
  // Compute a primitive cache key over the line-number column so memoised
  // gutter state remains stable across parent re-renders that hand us a new
  // `codeLines` array with identical line numbers. OpenTUI treats any
  // `onChunks` identity change as a highlights-invalidation signal and would
  // otherwise re-run tree-sitter on every chat re-render.
  const lineNumberSequenceSignature = props.codeLines
    .map((codeLine) => codeLine.lineNumber ?? "")
    .join(",");
  const gutterChunkTexts = useMemo(
    () => buildGutterChunkTextsForLineNumbers(props.codeLines),
    // Intentionally keyed on the signature rather than the codeLines array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineNumberSequenceSignature],
  );
  const handleOpenTuiCodeChunks = useCallback(
    (treeSitterChunks: TextChunk[]) =>
      injectGutterChunksBeforeEachSourceLine(treeSitterChunks, gutterChunkTexts),
    [gutterChunkTexts],
  );
  if (!hasAnyLineNumber) {
    return (
      <code
        content={codeText}
        bg={githubLikeTerminalCodeColors.canvas}
        drawUnstyledText={true}
        filetype={codeFiletype}
        selectable={true}
        syntaxStyle={codeBlockSyntaxStyle}
        treeSitterClient={openTuiSharedTreeSitterClient}
        width="100%"
        wrapMode={props.wrapMode}
      />
    );
  }
  return (
    <code
      content={codeText}
      bg={githubLikeTerminalCodeColors.canvas}
      drawUnstyledText={true}
      filetype={codeFiletype}
      onChunks={handleOpenTuiCodeChunks}
      selectable={true}
      syntaxStyle={codeBlockSyntaxStyle}
      treeSitterClient={openTuiSharedTreeSitterClient}
      width="100%"
      wrapMode={props.wrapMode}
    />
  );
}

// Prefer the file path when it's available — `pathToFiletype` handles both
// extensions ("foo.ts") and special basenames ("Dockerfile"). Markdown fence
// info strings only show up for assistant code blocks, where the path is
// unknown.
export function resolveOpenTuiCodeFiletype(
  filePath: string | undefined,
  languageLabel: string | undefined,
): string {
  if (filePath) {
    const filetypeFromPath = pathToFiletype(filePath);
    if (filetypeFromPath) {
      return filetypeFromPath;
    }
  }
  const normalizedLanguageLabel = languageLabel?.trim();
  if (!normalizedLanguageLabel) {
    return "text";
  }
  return infoStringToFiletype(normalizedLanguageLabel) || "text";
}

function computeLineNumberGutterWidth(codeLines: FencedCodeBlockLine[]): number {
  return Math.max(2, String(codeLines.at(-1)?.lineNumber ?? codeLines.length).length);
}

function formatLineNumberGutterCell(
  lineNumber: number | undefined,
  lineNumberGutterWidth: number,
): string {
  return lineNumber === undefined
    ? " ".repeat(lineNumberGutterWidth)
    : String(lineNumber).padStart(lineNumberGutterWidth, " ");
}

// Trailing separator space keeps the code column aligned regardless of how
// tree-sitter splits a source line across chunks.
function buildGutterChunkTextsForLineNumbers(codeLines: FencedCodeBlockLine[]): string[] {
  const lineNumberGutterWidth = computeLineNumberGutterWidth(codeLines);
  return codeLines.map(
    (codeLine) => `${formatLineNumberGutterCell(codeLine.lineNumber, lineNumberGutterWidth)} `,
  );
}

// The gutter lives inside the same buffer as the syntax-highlighted code, so
// row counts and code column alignment are guaranteed by construction.
function injectGutterChunksBeforeEachSourceLine(
  treeSitterChunks: TextChunk[],
  gutterChunkTexts: string[],
): TextChunk[] {
  const transformedChunks: TextChunk[] = [];
  let currentSourceLineIndex = 0;
  let currentSourceLineNeedsGutterChunk = true;

  const pushGutterChunkIfNeeded = () => {
    if (!currentSourceLineNeedsGutterChunk) {
      return;
    }
    const gutterChunkText = gutterChunkTexts[currentSourceLineIndex] ?? "";
    if (gutterChunkText.length > 0) {
      transformedChunks.push({
        __isChunk: true,
        text: gutterChunkText,
        fg: codeLineNumberGutterForegroundColor,
      });
    }
    currentSourceLineNeedsGutterChunk = false;
  };

  for (const treeSitterChunk of treeSitterChunks) {
    let remainingChunkText = treeSitterChunk.text;
    while (remainingChunkText.length > 0) {
      const nextNewlineIndex = remainingChunkText.indexOf("\n");
      if (nextNewlineIndex === -1) {
        pushGutterChunkIfNeeded();
        transformedChunks.push({ ...treeSitterChunk, text: remainingChunkText });
        remainingChunkText = "";
      } else {
        pushGutterChunkIfNeeded();
        transformedChunks.push({
          ...treeSitterChunk,
          text: remainingChunkText.slice(0, nextNewlineIndex + 1),
        });
        remainingChunkText = remainingChunkText.slice(nextNewlineIndex + 1);
        currentSourceLineIndex += 1;
        currentSourceLineNeedsGutterChunk = true;
      }
    }
  }
  return transformedChunks;
}

// Engine-supplied per-line spans bypass tree-sitter entirely; we render with
// a flex-row gutter + text fallback to preserve the existing contract.
function FencedCodeBlockPreSuppliedSpanContent(props: {
  codeLines: FencedCodeBlockLine[];
  wrapMode: "char" | "none" | "word";
}): ReactNode {
  const lineNumberGutterWidth = computeLineNumberGutterWidth(props.codeLines);
  return (
    <>
      {props.codeLines.map((codeLine, index) => (
        <box
          key={`code-line-${index}`}
          flexDirection="row"
          alignItems="center"
          overflow="hidden"
          width="100%"
        >
          <box flexShrink={0} marginRight={1} width={lineNumberGutterWidth}>
            <text fg={githubLikeTerminalCodeColors.muted}>
              {formatLineNumberGutterCell(codeLine.lineNumber, lineNumberGutterWidth)}
            </text>
          </box>
          <box flexShrink={1} minWidth={0} overflow="hidden" width="100%">
            <FencedCodeBlockLineContent fencedCodeBlockLine={codeLine} wrapMode={props.wrapMode} />
          </box>
        </box>
      ))}
    </>
  );
}

function FencedCodeBlockLineContent(props: {
  fencedCodeBlockLine: FencedCodeBlockLine;
  wrapMode: "char" | "none" | "word";
}): ReactNode {
  const { fencedCodeBlockLine } = props;
  const shouldTruncateLine = props.wrapMode === "none";
  if (!fencedCodeBlockLine.syntaxHighlightSpans || fencedCodeBlockLine.syntaxHighlightSpans.length === 0) {
    return (
      <text
        fg={githubLikeTerminalCodeColors.foreground}
        truncate={shouldTruncateLine}
        wrapMode={props.wrapMode}
        width="100%"
      >
        {fencedCodeBlockLine.lineText}
      </text>
    );
  }
  return (
    <text truncate={shouldTruncateLine} wrapMode={props.wrapMode} width="100%">
      {fencedCodeBlockLine.syntaxHighlightSpans.map((syntaxHighlightSpan, index) => (
        <span fg={syntaxHighlightSpanForegroundColors[syntaxHighlightSpan.spanStyle]} key={index}>
          {syntaxHighlightSpan.spanText}
        </span>
      ))}
    </text>
  );
}
