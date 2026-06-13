import {
  BoxRenderable,
  CodeRenderable,
  DiffRenderable,
  RGBA,
  StyledText,
  TextAttributes,
  TextRenderable,
  createMarkdownCodeBlockRenderer,
  type MarkdownOptions,
  type RenderContext,
  type RenderNodeContext,
  type Renderable,
  type TextChunk,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { createAssistantMarkdownChromeRenderNode } from "./assistantMarkdownChromeRenderNode.ts";
import { decorateAssistantMarkdownInlineTextChunks } from "./assistantMarkdownChunkDecorators.ts";
import { parseAssistantMarkdownCodeFenceInfo } from "./assistantMarkdownCodeFenceInfo.ts";
import {
  buildAssistantDiffSnippetUnifiedDiff,
  formatAssistantUnifiedDiffText,
  listVisibleAssistantDiffSnippetLines,
  readAssistantMarkdownRawDiffSnippetBlock,
  readAssistantMarkdownUnifiedDiffBlock,
  summarizeAssistantDiffSnippet,
  summarizeAssistantUnifiedDiffFiles,
} from "./assistantMarkdownDiffSections.ts";
import type {
  AssistantMarkdownBlockquoteToken,
  AssistantMarkdownCallout,
  AssistantMarkdownCodeToken,
  AssistantMarkdownParagraphToken,
} from "./assistantMarkdownTypes.ts";
import {
  formatAssistantMarkdownInlineTextForStyledText,
  parseAssistantMarkdownCallout,
  trimAssistantMarkdownBoundaryBlankLines,
} from "./assistantMarkdownTextFormatting.ts";
import {
  codeBlockSyntaxStyle,
  githubLikeTerminalCodeColors,
  terminalDiffColors,
} from "./codeRenderingTheme.ts";
import { buildVisibleUnifiedDiffContent, resolveOpenTuiDiffFiletype } from "./DiffBlock.tsx";
import { resolveOpenTuiCodeFiletype } from "./FencedCodeBlock.tsx";
import { decorateTeachingCommentCodeChunks } from "./teachingCommentCodeChunks.ts";

// Buli chrome for the assistant markdown renderable. Inside `renderNode` only OpenTUI
// renderables can be returned (not React elements), so fence, diff, callout, and
// blockquote chrome is built imperatively with BoxRenderable/TextRenderable/
// DiffRenderable. Dispatch for shell and diff fences goes through OpenTUI's
// `createMarkdownCodeBlockRenderer`, which keys on `infoStringToFiletype(token.lang)`:
// bash/sh/zsh resolve to "bash", shell to "shell", diff/patch to "diff".
const closingFenceLinePattern = /^\s{0,3}(?:`{3,}|~{3,})\s*$/;

const assistantMarkdownCalloutForegroundColors = {
  NOTE: chatScreenTheme.accentCyan,
  TIP: chatScreenTheme.accentGreen,
  IMPORTANT: chatScreenTheme.accentPurple,
  WARNING: chatScreenTheme.accentAmber,
  CAUTION: chatScreenTheme.accentRed,
} as const;

function isClosedAssistantMarkdownCodeFence(codeToken: AssistantMarkdownCodeToken): boolean {
  const rawFenceLines = codeToken.raw.trimEnd().split("\n");
  return rawFenceLines.length >= 2 && closingFenceLinePattern.test(rawFenceLines[rawFenceLines.length - 1] ?? "");
}

function createAssistantStyledTextChunk(input: {
  text: string;
  foregroundColor: string;
  attributes?: number | undefined;
}): TextChunk {
  return {
    __isChunk: true,
    text: input.text,
    fg: RGBA.fromHex(input.foregroundColor),
    attributes: input.attributes ?? 0,
  };
}

function createDecoratedAssistantInlineTextChunks(input: {
  inlineText: string;
  foregroundColor: string;
}): TextChunk[] {
  return [
    ...decorateAssistantMarkdownInlineTextChunks({
      profile: "prose",
      textChunks: [createAssistantStyledTextChunk({ text: input.inlineText, foregroundColor: input.foregroundColor })],
    }),
  ];
}

// `defaultRender()` is the only access to a RenderContext inside renderNode; the
// default renderable is destroyed by MarkdownRenderable afterwards unless it gained a
// parent, so borrowing its ctx for replacement chrome is safe.
function borrowRenderContextFromDefaultRender(context: RenderNodeContext): RenderContext | undefined {
  return context.defaultRender()?.ctx;
}

function createAssistantFenceFlowContainer(renderContext: RenderContext): BoxRenderable {
  return new BoxRenderable(renderContext, { flexDirection: "column", marginBottom: 1, width: "100%" });
}

function createAssistantSnippetFrame(input: {
  renderContext: RenderContext;
  accentColor: string;
  headerText?: string | undefined;
}): { outerContainer: BoxRenderable; frameContainer: BoxRenderable } {
  const outerContainer = createAssistantFenceFlowContainer(input.renderContext);
  const frameContainer = new BoxRenderable(input.renderContext, {
    border: ["left"],
    borderColor: input.accentColor,
    flexDirection: "column",
    paddingX: 1,
    width: "100%",
  });
  if (input.headerText) {
    frameContainer.add(
      new TextRenderable(input.renderContext, { content: input.headerText, fg: chatScreenTheme.textDim }),
    );
  }
  outerContainer.add(frameContainer);
  return { outerContainer, frameContainer };
}

function createAssistantDiffRenderable(input: {
  renderContext: RenderContext;
  parentContainer: BoxRenderable;
  unifiedDiffText: string;
  filePath: string | undefined;
  density: "normal" | "compact";
  context: RenderNodeContext;
}): void {
  const visibleUnifiedDiffContent = buildVisibleUnifiedDiffContent(input.unifiedDiffText);
  if (visibleUnifiedDiffContent.visibleRenderableRowCount < visibleUnifiedDiffContent.totalRenderableRowCount) {
    input.parentContainer.add(
      new TextRenderable(input.renderContext, {
        content:
          `showing first ${visibleUnifiedDiffContent.visibleRenderableRowCount} of ` +
          `${visibleUnifiedDiffContent.totalRenderableRowCount} diff lines`,
        fg: chatScreenTheme.textDim,
        width: "100%",
        wrapMode: "word",
      }),
    );
  }

  const isCompact = input.density === "compact";
  input.parentContainer.add(
    new DiffRenderable(input.renderContext, {
      addedBg: terminalDiffColors.addedBackground,
      addedContentBg: terminalDiffColors.addedContentBackground,
      addedLineNumberBg: isCompact ? githubLikeTerminalCodeColors.canvas : terminalDiffColors.addedLineNumberBackground,
      addedSignColor: terminalDiffColors.addedSignForeground,
      contextBg: terminalDiffColors.contextBackground,
      contextContentBg: terminalDiffColors.contextContentBackground,
      diff: visibleUnifiedDiffContent.visibleUnifiedDiffText,
      fg: githubLikeTerminalCodeColors.foreground,
      filetype: resolveOpenTuiDiffFiletype(input.filePath),
      lineNumberBg: isCompact ? githubLikeTerminalCodeColors.canvas : terminalDiffColors.lineNumberBackground,
      lineNumberFg: terminalDiffColors.lineNumberForeground,
      removedBg: terminalDiffColors.removedBackground,
      removedContentBg: terminalDiffColors.removedContentBackground,
      removedLineNumberBg: isCompact
        ? githubLikeTerminalCodeColors.canvas
        : terminalDiffColors.removedLineNumberBackground,
      removedSignColor: terminalDiffColors.removedSignForeground,
      selectionBg: chatScreenTheme.accentPrimary,
      selectionFg: chatScreenTheme.textPrimary,
      showLineNumbers: true,
      syntaxStyle: codeBlockSyntaxStyle,
      ...(input.context.treeSitterClient ? { treeSitterClient: input.context.treeSitterClient } : {}),
      view: "unified",
      width: "100%",
      wrapMode: "char",
    }),
  );
}

export function resolveAssistantDiffSnippetLineColor(diffSnippetLine: string): string {
  if (diffSnippetLine.startsWith("+") && !diffSnippetLine.startsWith("+++")) {
    return githubLikeTerminalCodeColors.diffAddition;
  }
  if (diffSnippetLine.startsWith("-") && !diffSnippetLine.startsWith("---")) {
    return githubLikeTerminalCodeColors.diffRemoval;
  }
  if (diffSnippetLine.startsWith("@@")) {
    return githubLikeTerminalCodeColors.diffMetadata;
  }
  return githubLikeTerminalCodeColors.foreground;
}

function renderAssistantDiffSnippetChrome(input: {
  renderContext: RenderContext;
  diffSnippetText: string;
  filePath: string | undefined;
  context: RenderNodeContext;
}): Renderable {
  const { outerContainer, frameContainer } = createAssistantSnippetFrame({
    renderContext: input.renderContext,
    accentColor: chatScreenTheme.accentPrimaryMuted,
    headerText: summarizeAssistantDiffSnippet({
      diffSnippetText: input.diffSnippetText,
      filePath: input.filePath,
    }),
  });

  const normalizedDiffSnippet = buildAssistantDiffSnippetUnifiedDiff({
    diffSnippetText: input.diffSnippetText,
    filePath: input.filePath,
  });
  if (normalizedDiffSnippet) {
    createAssistantDiffRenderable({
      renderContext: input.renderContext,
      parentContainer: frameContainer,
      unifiedDiffText: normalizedDiffSnippet.unifiedDiffText,
      filePath: normalizedDiffSnippet.filePath,
      density: "compact",
      context: input.context,
    });
    return outerContainer;
  }

  for (const diffSnippetLine of listVisibleAssistantDiffSnippetLines(input.diffSnippetText)) {
    frameContainer.add(
      new TextRenderable(input.renderContext, {
        content: diffSnippetLine,
        fg: resolveAssistantDiffSnippetLineColor(diffSnippetLine),
        width: "100%",
        wrapMode: "char",
      }),
    );
  }
  return outerContainer;
}

function renderAssistantShellSnippetFence(
  codeToken: AssistantMarkdownCodeToken,
  context: RenderNodeContext,
): Renderable | undefined {
  const renderContext = borrowRenderContextFromDefaultRender(context);
  if (!renderContext) {
    return undefined;
  }

  const { outerContainer, frameContainer } = createAssistantSnippetFrame({
    renderContext,
    accentColor: chatScreenTheme.accentGreen,
  });
  const shellSnippetText = codeToken.text.replace(/\n*$/, "");
  for (const shellSnippetLine of shellSnippetText.split("\n")) {
    frameContainer.add(
      new TextRenderable(renderContext, {
        content: shellSnippetLine.trim().length > 0
          ? new StyledText([
              createAssistantStyledTextChunk({ text: "$ ", foregroundColor: chatScreenTheme.accentGreen }),
              createAssistantStyledTextChunk({
                text: shellSnippetLine,
                foregroundColor: githubLikeTerminalCodeColors.foreground,
              }),
            ])
          : "",
        width: "100%",
        wrapMode: "char",
      }),
    );
  }
  return outerContainer;
}

function renderAssistantDiffFence(
  codeToken: AssistantMarkdownCodeToken,
  context: RenderNodeContext,
): Renderable | undefined {
  const renderContext = borrowRenderContextFromDefaultRender(context);
  if (!renderContext) {
    return undefined;
  }

  const fencedContentLines = codeToken.text.split("\n");
  const completeUnifiedDiffText = resolveCompleteUnifiedDiffText(codeToken, fencedContentLines);
  if (completeUnifiedDiffText) {
    return renderAssistantUnifiedDiffChrome({ renderContext, unifiedDiffText: completeUnifiedDiffText, context });
  }

  const codeFenceInfo = parseAssistantMarkdownCodeFenceInfo(codeToken.lang);
  return renderAssistantDiffSnippetChrome({
    renderContext,
    diffSnippetText: formatAssistantUnifiedDiffText(fencedContentLines),
    filePath: codeFenceInfo.codeFenceFilePath,
    context,
  });
}

function resolveCompleteUnifiedDiffText(
  codeToken: AssistantMarkdownCodeToken,
  fencedContentLines: readonly string[],
): string | undefined {
  if (!isClosedAssistantMarkdownCodeFence(codeToken)) {
    return undefined;
  }

  const candidateUnifiedDiffLines = trimAssistantMarkdownBoundaryBlankLines(fencedContentLines);
  const unifiedDiffBlock = readAssistantMarkdownUnifiedDiffBlock(candidateUnifiedDiffLines, 0);
  if (!unifiedDiffBlock || unifiedDiffBlock.nextLineIndex !== candidateUnifiedDiffLines.length) {
    return undefined;
  }

  return formatAssistantUnifiedDiffText(unifiedDiffBlock.unifiedDiffLines);
}

function renderAssistantUnifiedDiffChrome(input: {
  renderContext: RenderContext;
  unifiedDiffText: string;
  context: RenderNodeContext;
}): Renderable {
  const outerContainer = createAssistantFenceFlowContainer(input.renderContext);
  const fileSummaries = summarizeAssistantUnifiedDiffFiles(input.unifiedDiffText);
  if (fileSummaries.length > 0) {
    const fileSummaryContainer = new BoxRenderable(input.renderContext, {
      flexDirection: "column",
      paddingX: 1,
      width: "100%",
    });
    for (const fileSummary of fileSummaries) {
      fileSummaryContainer.add(
        new TextRenderable(input.renderContext, {
          content: new StyledText([
            createAssistantStyledTextChunk({ text: "patch ", foregroundColor: chatScreenTheme.textMuted }),
            createAssistantStyledTextChunk({ text: fileSummary.filePath, foregroundColor: chatScreenTheme.accentCyan }),
            createAssistantStyledTextChunk({
              text: ` +${fileSummary.addedLineCount}`,
              foregroundColor: chatScreenTheme.accentGreen,
            }),
            createAssistantStyledTextChunk({
              text: ` -${fileSummary.removedLineCount}`,
              foregroundColor: chatScreenTheme.accentRed,
            }),
          ]),
          width: "100%",
        }),
      );
    }
    outerContainer.add(fileSummaryContainer);
  }

  createAssistantDiffRenderable({
    renderContext: input.renderContext,
    parentContainer: outerContainer,
    unifiedDiffText: input.unifiedDiffText,
    filePath: fileSummaries.length === 1 ? fileSummaries[0]?.filePath : undefined,
    density: "normal",
    context: input.context,
  });
  return outerContainer;
}

function renderAssistantGenericCodeFence(
  codeToken: AssistantMarkdownCodeToken,
  context: RenderNodeContext,
): Renderable | undefined {
  const defaultRenderable = context.defaultRender();
  if (!(defaultRenderable instanceof CodeRenderable)) {
    return defaultRenderable ?? undefined;
  }

  const codeFenceInfo = parseAssistantMarkdownCodeFenceInfo(codeToken.lang);
  defaultRenderable.bg = RGBA.fromHex(githubLikeTerminalCodeColors.canvas);
  defaultRenderable.drawUnstyledText = true;
  defaultRenderable.filetype = resolveOpenTuiCodeFiletype(codeFenceInfo.codeFenceFilePath, codeFenceInfo.codeLanguageLabel);
  defaultRenderable.onChunks = decorateTeachingCommentCodeChunks;
  defaultRenderable.selectable = true;
  // An unclosed fence is still receiving streamed content, so the code renderable must
  // keep its incremental tree-sitter parse state; the closing fence changes token.raw,
  // which rebuilds this block with streaming=false and finalizes the highlight.
  defaultRenderable.streaming = !isClosedAssistantMarkdownCodeFence(codeToken);
  defaultRenderable.syntaxStyle = codeBlockSyntaxStyle;
  defaultRenderable.wrapMode = "char";

  const renderContext = defaultRenderable.ctx;
  const fenceContainer = createAssistantFenceFlowContainer(renderContext);
  if (codeFenceInfo.codeFenceDisplayLabel) {
    fenceContainer.add(
      new TextRenderable(renderContext, {
        content: codeFenceInfo.codeFenceDisplayLabel,
        fg: chatScreenTheme.accentCyan,
      }),
    );
  }
  fenceContainer.add(defaultRenderable);
  return fenceContainer;
}

function renderAssistantCalloutChrome(input: {
  renderContext: RenderContext;
  callout: AssistantMarkdownCallout;
}): Renderable {
  const calloutForegroundColor = assistantMarkdownCalloutForegroundColors[input.callout.calloutKind];
  const calloutContainer = createAssistantFenceFlowContainer(input.renderContext);
  calloutContainer.add(
    new TextRenderable(input.renderContext, {
      content: new StyledText([
        createAssistantStyledTextChunk({
          text: `▌ ${input.callout.calloutKind}`,
          foregroundColor: calloutForegroundColor,
          attributes: TextAttributes.BOLD,
        }),
      ]),
      fg: calloutForegroundColor,
    }),
  );
  calloutContainer.add(
    new TextRenderable(input.renderContext, {
      content: "├" + "─".repeat(Math.max(12, input.callout.calloutKind.length + 2)),
      fg: calloutForegroundColor,
    }),
  );
  const calloutBodyText = input.callout.bodyText.trim();
  for (const calloutBodyLine of calloutBodyText.length > 0 ? calloutBodyText.split("\n") : []) {
    calloutContainer.add(
      new TextRenderable(input.renderContext, {
        content: new StyledText([
          createAssistantStyledTextChunk({ text: "│ ", foregroundColor: calloutForegroundColor }),
          ...createDecoratedAssistantInlineTextChunks({
            inlineText: formatAssistantMarkdownInlineTextForStyledText(calloutBodyLine),
            foregroundColor: calloutForegroundColor,
          }),
        ]),
        fg: calloutForegroundColor,
        width: "100%",
        wrapMode: "word",
      }),
    );
  }
  return calloutContainer;
}

function renderAssistantBlockquote(
  blockquoteToken: AssistantMarkdownBlockquoteToken,
  context: RenderNodeContext,
): Renderable | undefined {
  const renderContext = borrowRenderContextFromDefaultRender(context);
  if (!renderContext) {
    return undefined;
  }

  const callout = parseAssistantMarkdownCallout(blockquoteToken.text);
  if (callout) {
    return renderAssistantCalloutChrome({ renderContext, callout });
  }

  const quoteContainer = new BoxRenderable(renderContext, {
    border: ["left"],
    borderColor: chatScreenTheme.textDim,
    flexDirection: "column",
    marginBottom: 1,
    paddingX: 1,
    width: "100%",
  });
  for (const quoteLine of blockquoteToken.text.trim().split("\n")) {
    quoteContainer.add(
      new TextRenderable(renderContext, {
        content: new StyledText(
          createDecoratedAssistantInlineTextChunks({
            inlineText: formatAssistantMarkdownInlineTextForStyledText(quoteLine),
            foregroundColor: chatScreenTheme.textSecondary,
          }),
        ),
        fg: chatScreenTheme.textSecondary,
        width: "100%",
        wrapMode: "word",
      }),
    );
  }
  return quoteContainer;
}

// Bare unified diffs and raw diff snippets are plain prose to the markdown parser; the
// section builder detects them by line scanning, so the unified path mirrors that on
// paragraph tokens. Both readers anchor on a `diff --git` file header and stop at
// blank lines, which is exactly a paragraph boundary — only a diff immediately
// adjoining further prose inside one paragraph falls back to plain text rendering.
function renderAssistantProseDiffParagraph(
  paragraphToken: AssistantMarkdownParagraphToken,
  context: RenderNodeContext,
): Renderable | undefined {
  const paragraphLines = trimAssistantMarkdownBoundaryBlankLines(paragraphToken.raw.split("\n"));
  const unifiedDiffBlock = readAssistantMarkdownUnifiedDiffBlock(paragraphLines, 0);
  if (unifiedDiffBlock && unifiedDiffBlock.nextLineIndex === paragraphLines.length) {
    const renderContext = borrowRenderContextFromDefaultRender(context);
    if (!renderContext) {
      return undefined;
    }
    return renderAssistantUnifiedDiffChrome({
      renderContext,
      unifiedDiffText: formatAssistantUnifiedDiffText(unifiedDiffBlock.unifiedDiffLines),
      context,
    });
  }

  const rawDiffSnippetBlock = readAssistantMarkdownRawDiffSnippetBlock(paragraphLines, 0);
  if (rawDiffSnippetBlock && rawDiffSnippetBlock.nextLineIndex === paragraphLines.length) {
    const renderContext = borrowRenderContextFromDefaultRender(context);
    if (!renderContext) {
      return undefined;
    }
    return renderAssistantDiffSnippetChrome({
      renderContext,
      diffSnippetText: formatAssistantUnifiedDiffText(rawDiffSnippetBlock.diffSnippetLines),
      filePath: undefined,
      context,
    });
  }

  return undefined;
}

export function createAssistantMarkdownUnifiedRenderNode(): NonNullable<MarkdownOptions["renderNode"]> {
  const chromeRenderNode = createAssistantMarkdownChromeRenderNode();
  const specialFenceRenderNode = createMarkdownCodeBlockRenderer({
    bash: renderAssistantShellSnippetFence,
    diff: renderAssistantDiffFence,
    shell: renderAssistantShellSnippetFence,
  });

  return (token, context) => {
    // Indented code blocks have no fence info to classify; they keep the plain chrome
    // path, matching the section builder which only extracts ``` fences.
    if (token.type === "code" && !("codeBlockStyle" in token && token.codeBlockStyle === "indented")) {
      const codeToken = token as AssistantMarkdownCodeToken;
      return specialFenceRenderNode?.(token, context) ?? renderAssistantGenericCodeFence(codeToken, context);
    }
    if (token.type === "blockquote" && "text" in token && typeof token.text === "string") {
      return renderAssistantBlockquote(token as AssistantMarkdownBlockquoteToken, context);
    }
    if (token.type === "paragraph" && "text" in token && typeof token.text === "string") {
      const proseDiffRenderable = renderAssistantProseDiffParagraph(token as AssistantMarkdownParagraphToken, context);
      if (proseDiffRenderable) {
        return proseDiffRenderable;
      }
    }
    return chromeRenderNode(token, context);
  };
}
