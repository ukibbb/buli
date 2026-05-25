import type { ReactNode } from "react";
import type { SyntaxHighlightSpan } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  infoStringToFiletype,
  pathToFiletype,
} from "@opentui/core";
import {
  codeBlockSyntaxStyle,
  codeLineNumberGutterForegroundColor,
  githubLikeTerminalCodeColors,
  syntaxHighlightSpanForegroundColors,
} from "./codeRenderingTheme.ts";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";
import { decorateTeachingCommentCodeChunks } from "./teachingCommentCodeChunks.ts";

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
  conceal?: boolean;
  decorateTeachingComments?: boolean;
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
      paddingX={isStandalone ? 1 : 0}
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
          conceal={props.conceal}
          decorateTeachingComments={props.decorateTeachingComments}
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
  conceal: boolean | undefined;
  decorateTeachingComments: boolean | undefined;
  filePath: string | undefined;
  languageLabel: string | undefined;
  wrapMode: "char" | "none" | "word";
}): ReactNode {
  const codeText = props.codeLines.map((codeLine) => codeLine.lineText).join("\n");
  const codeFiletype = resolveOpenTuiCodeFiletype(props.filePath, props.languageLabel);
  const hasAnyLineNumber = props.codeLines.some((codeLine) => codeLine.lineNumber !== undefined);
  if (!hasAnyLineNumber) {
    return (
      <code
        content={codeText}
        bg={githubLikeTerminalCodeColors.canvas}
        {...(props.conceal !== undefined ? { conceal: props.conceal } : {})}
        drawUnstyledText={true}
        filetype={codeFiletype}
        {...(props.decorateTeachingComments ? { onChunks: decorateTeachingCommentCodeChunks } : {})}
        selectable={true}
        syntaxStyle={codeBlockSyntaxStyle}
        treeSitterClient={openTuiSharedTreeSitterClient}
        width="100%"
        wrapMode={props.wrapMode}
      />
    );
  }

  return (
    <line-number
      bg={githubLikeTerminalCodeColors.canvas}
      fg={codeLineNumberGutterForegroundColor}
      hideLineNumbers={buildHiddenLineNumberSetForCodeLines(props.codeLines)}
      lineNumbers={buildLineNumberOverrideMapForCodeLines(props.codeLines)}
      minWidth={computeLineNumberGutterWidth(props.codeLines)}
      paddingRight={1}
      width="100%"
    >
      <code
        content={codeText}
        bg={githubLikeTerminalCodeColors.canvas}
        {...(props.conceal !== undefined ? { conceal: props.conceal } : {})}
        drawUnstyledText={true}
        filetype={codeFiletype}
        {...(props.decorateTeachingComments ? { onChunks: decorateTeachingCommentCodeChunks } : {})}
        selectable={true}
        syntaxStyle={codeBlockSyntaxStyle}
        treeSitterClient={openTuiSharedTreeSitterClient}
        width="100%"
        wrapMode={props.wrapMode}
      />
    </line-number>
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
    const filetypeFromPath = pathToFiletype(removeSourceLineRangeSuffix(filePath));
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

function removeSourceLineRangeSuffix(filePath: string): string {
  return filePath.replace(/:\d+(?:-\d+)?$/, "");
}

function computeLineNumberGutterWidth(codeLines: FencedCodeBlockLine[]): number {
  const largestLineNumber = Math.max(
    codeLines.length,
    ...codeLines.map((codeLine) => codeLine.lineNumber ?? 0),
  );
  return Math.max(2, String(largestLineNumber).length);
}

function buildLineNumberOverrideMapForCodeLines(codeLines: FencedCodeBlockLine[]): Map<number, number> {
  const lineNumberOverrideByLogicalLineIndex = new Map<number, number>();
  codeLines.forEach((codeLine, logicalLineIndex) => {
    if (codeLine.lineNumber !== undefined) {
      lineNumberOverrideByLogicalLineIndex.set(logicalLineIndex, codeLine.lineNumber);
    }
  });
  return lineNumberOverrideByLogicalLineIndex;
}

function buildHiddenLineNumberSetForCodeLines(codeLines: FencedCodeBlockLine[]): Set<number> {
  const hiddenLogicalLineIndexes = new Set<number>();
  codeLines.forEach((codeLine, logicalLineIndex) => {
    if (codeLine.lineNumber === undefined) {
      hiddenLogicalLineIndexes.add(logicalLineIndex);
    }
  });
  return hiddenLogicalLineIndexes;
}

function formatLineNumberGutterCell(
  lineNumber: number | undefined,
  lineNumberGutterWidth: number,
): string {
  return lineNumber === undefined
    ? " ".repeat(lineNumberGutterWidth)
    : String(lineNumber).padStart(lineNumberGutterWidth, " ");
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
