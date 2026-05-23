import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  CodeRenderable,
  RGBA,
  SyntaxStyle,
  TextAttributes,
  type MarkdownOptions,
  type TextChunk,
} from "@opentui/core";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import {
  decorateAssistantMarkdownInlineTextChunks,
  decorateAssistantMarkdownListChunks,
  decorateAssistantMarkdownProseChunks,
  type AssistantMarkdownInlineDecorationProfile,
} from "./assistantMarkdownChunkDecorators.ts";
import {
  areAssistantMarkdownCodeFenceInfoValuesEqual,
  areAssistantMarkdownVisibleListLinesEqual,
  assistantMarkdownUnorderedListMarkers,
  buildAssistantDiffSnippetUnifiedDiff,
  buildStableAssistantMarkdownRenderSections,
  formatAssistantMarkdownCalloutText,
  formatAssistantMarkdownHeadingText,
  formatAssistantMarkdownInlineTextForStyledText,
  formatAssistantMarkdownListText,
  formatAssistantMarkdownQuoteText,
  isAssistantMarkdownBlockquoteToken,
  isAssistantMarkdownCodeToken,
  isAssistantMarkdownDashOnlyParagraphToken,
  isAssistantMarkdownHeadingToken,
  isAssistantMarkdownListToken,
  isAssistantMarkdownParagraphToken,
  listVisibleAssistantDiffSnippetLines,
  parseAssistantMarkdownCallout,
  repeatAssistantMarkdownChromeRule,
  summarizeAssistantDiffSnippet,
  summarizeAssistantUnifiedDiffFiles,
  type AssistantMarkdownCalloutKind,
  type AssistantMarkdownCodeFenceInfo,
  type AssistantMarkdownRenderSectionCache,
  type AssistantMarkdownVisibleListLine,
} from "./assistantMarkdownRenderSections.ts";
import {
  assistantMarkdownSyntaxStyle,
  githubLikeTerminalCodeColors,
} from "./codeRenderingTheme.ts";
import { DiffBlock } from "./DiffBlock.tsx";
import { FencedCodeBlock } from "./FencedCodeBlock.tsx";
import { openTuiSharedTreeSitterClient } from "./openTuiSharedTreeSitterClient.ts";

export {
  buildStableAssistantMarkdownRenderSections,
  createAssistantMarkdownRenderSectionCache,
  type AssistantMarkdownRenderSection,
  type AssistantMarkdownRenderSectionCache,
} from "./assistantMarkdownRenderSections.ts";

export type AssistantMarkdownBlockProps = {
  markdownText: string;
  isStreaming: boolean;
  horizontalRuleColor: string;
  terminalColumnCount?: number | undefined;
};

const assistantMarkdownHeadingSyntaxStyleByDepth = {
  1: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  2: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  3: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  fallback: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary), bold: true } }),
} as const;

const assistantMarkdownQuoteSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textSecondary), italic: true },
});

const assistantMarkdownTaskListSyntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(chatScreenTheme.textPrimary) },
  checked: { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true },
  unchecked: { fg: RGBA.fromHex(chatScreenTheme.textDim), bold: true },
});

const assistantMarkdownCalloutSyntaxStyleByKind: Record<AssistantMarkdownCalloutKind, SyntaxStyle> = {
  NOTE: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentCyan), bold: true } }),
  TIP: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentGreen), bold: true } }),
  IMPORTANT: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentPurple), bold: true } }),
  WARNING: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentAmber), bold: true } }),
  CAUTION: SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(chatScreenTheme.accentRed), bold: true } }),
};

const defaultAssistantMarkdownTerminalColumnCount = 80;

function createAssistantMarkdownPlainTextChunk(input: {
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

function AssistantMarkdownInlineText(props: {
  inlineText: string;
  foregroundColor?: string | undefined;
  attributes?: number | undefined;
  decorationProfile?: AssistantMarkdownInlineDecorationProfile | undefined;
}): ReactNode {
  const baseForegroundColor = props.foregroundColor ?? chatScreenTheme.textPrimary;
  const inlineTextChunks = decorateAssistantMarkdownInlineTextChunks({
    profile: props.decorationProfile ?? "prose",
    textChunks: [
      createAssistantMarkdownPlainTextChunk({
        text: props.inlineText,
        foregroundColor: baseForegroundColor,
        attributes: props.attributes,
      }),
    ],
  });

  return inlineTextChunks.map((inlineTextChunk, index) => (
    <span
      attributes={inlineTextChunk.attributes ?? 0}
      fg={inlineTextChunk.fg ?? RGBA.fromHex(baseForegroundColor)}
      key={`assistant-inline-text-chunk-${index}`}
    >
      {inlineTextChunk.text}
    </span>
  ));
}

function resolveAssistantMarkdownHeadingSyntaxStyle(depth: number): SyntaxStyle {
  if (depth === 1) return assistantMarkdownHeadingSyntaxStyleByDepth[1];
  if (depth === 2) return assistantMarkdownHeadingSyntaxStyleByDepth[2];
  if (depth === 3) return assistantMarkdownHeadingSyntaxStyleByDepth[3];
  return assistantMarkdownHeadingSyntaxStyleByDepth.fallback;
}

function AssistantMarkdownTextSection(props: {
  isStreaming: boolean;
  markdownText: string;
  renderNode: NonNullable<MarkdownOptions["renderNode"]>;
}): ReactNode {
  return (
    <markdown
      bg={chatScreenTheme.bg}
      conceal={true}
      concealCode={false}
      content={props.markdownText}
      fg={chatScreenTheme.textPrimary}
      internalBlockMode="top-level"
      renderNode={props.renderNode}
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

function AssistantMarkdownParagraphBlock(props: { paragraphText: string }): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <text fg={chatScreenTheme.textPrimary} wrapMode="word">
        <AssistantMarkdownInlineText inlineText={props.paragraphText} />
      </text>
    </box>
  );
}

function resolveAssistantMarkdownHeadingForegroundColor(headingDepth: number): string {
  if (headingDepth === 1) return chatScreenTheme.accentCyan;
  if (headingDepth === 2) return chatScreenTheme.accentAmber;
  if (headingDepth === 3) return chatScreenTheme.accentPurple;
  return chatScreenTheme.textPrimary;
}

function formatAssistantMarkdownVisibleHeadingText(input: { headingDepth: number; headingText: string }): string {
  if (input.headingDepth === 1) {
    return `▌ ${input.headingText}`;
  }
  if (input.headingDepth === 2) {
    return `◆ ${input.headingText}`;
  }
  if (input.headingDepth === 3) {
    return input.headingText;
  }
  return `• ${input.headingText}`;
}

function AssistantMarkdownHeadingBlock(props: { headingDepth: number; headingText: string }): ReactNode {
  const headingForegroundColor = resolveAssistantMarkdownHeadingForegroundColor(props.headingDepth);
  return (
    <box marginBottom={1} width="100%">
      <text fg={headingForegroundColor} wrapMode="word">
        <AssistantMarkdownInlineText
          attributes={TextAttributes.BOLD}
          foregroundColor={headingForegroundColor}
          inlineText={formatAssistantMarkdownVisibleHeadingText(props)}
        />
      </text>
    </box>
  );
}

function AssistantMarkdownHorizontalRuleBlock(props: { horizontalRuleText: string; horizontalRuleColor: string }): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <text fg={props.horizontalRuleColor} wrapMode="none">
        {props.horizontalRuleText}
      </text>
    </box>
  );
}

function AssistantMarkdownTableBlock(props: {
  isStreaming: boolean;
  renderNode: NonNullable<MarkdownOptions["renderNode"]>;
  tableMarkdownText: string;
}): ReactNode {
  return (
    <box marginBottom={1} width="100%">
      <markdown
        bg={chatScreenTheme.bg}
        conceal={true}
        concealCode={false}
        content={props.tableMarkdownText}
        fg={chatScreenTheme.textPrimary}
        renderNode={props.renderNode}
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
    </box>
  );
}

function resolveAssistantMarkdownVisibleListMarkerColor(listItemMarkerText: string): string {
  const trimmedListItemMarkerText = listItemMarkerText.trim();
  if (trimmedListItemMarkerText === "☑") {
    return chatScreenTheme.accentGreen;
  }
  if (trimmedListItemMarkerText === "☐") {
    return chatScreenTheme.textDim;
  }
  if (/^\d+\.$/.test(trimmedListItemMarkerText)) {
    return chatScreenTheme.accentAmber;
  }

  const unorderedListMarkerIndex = assistantMarkdownUnorderedListMarkers.indexOf(
    trimmedListItemMarkerText as (typeof assistantMarkdownUnorderedListMarkers)[number],
  );
  return [
    chatScreenTheme.accentPrimaryMuted,
    chatScreenTheme.accentCyan,
    chatScreenTheme.accentAmber,
    chatScreenTheme.accentPurple,
  ][unorderedListMarkerIndex] ?? chatScreenTheme.textMuted;
}

function AssistantMarkdownListBlock(props: {
  listLines: readonly AssistantMarkdownVisibleListLine[];
  hasLeadingBlankLine: boolean;
}): ReactNode {
  return (
    <box flexDirection="column" marginBottom={1} {...(props.hasLeadingBlankLine ? { marginTop: 1 } : {})} width="100%">
      {props.listLines.map((listLine, index) => (
        <box key={`assistant-list-line-${index}`} width="100%">
          <text fg={chatScreenTheme.textPrimary} wrapMode="word">
            {listLine.listItemIndentText}
            <span
              attributes={TextAttributes.BOLD}
              fg={resolveAssistantMarkdownVisibleListMarkerColor(listLine.listItemMarkerText)}
            >
              {listLine.listItemMarkerText}
            </span>
            {" "}
            <AssistantMarkdownInlineText decorationProfile="prose" inlineText={listLine.listItemText} />
          </text>
        </box>
      ))}
    </box>
  );
}

function AssistantMarkdownQuoteBlock(props: { quoteText: string }): ReactNode {
  const assistantMarkdownCallout = parseAssistantMarkdownCallout(props.quoteText);
  if (assistantMarkdownCallout) {
    return <AssistantMarkdownCalloutBlock {...assistantMarkdownCallout} />;
  }

  return (
    <box
      border={["left"]}
      borderColor={chatScreenTheme.textDim}
      flexDirection="column"
      marginBottom={1}
      paddingX={1}
      width="100%"
    >
      {props.quoteText.trim().split("\n").map((quoteLine, index) => (
        <box key={`assistant-quote-line-${index}`} width="100%">
          <text fg={chatScreenTheme.textSecondary} wrapMode="word">
            <AssistantMarkdownInlineText
              foregroundColor={chatScreenTheme.textSecondary}
              inlineText={formatAssistantMarkdownInlineTextForStyledText(quoteLine)}
            />
          </text>
        </box>
      ))}
    </box>
  );
}

function AssistantMarkdownCalloutBlock(props: { calloutKind: AssistantMarkdownCalloutKind; bodyText: string }): ReactNode {
  const calloutForegroundColor = {
    NOTE: chatScreenTheme.accentCyan,
    TIP: chatScreenTheme.accentGreen,
    IMPORTANT: chatScreenTheme.accentPurple,
    WARNING: chatScreenTheme.accentAmber,
    CAUTION: chatScreenTheme.accentRed,
  }[props.calloutKind];
  const bodyLines = props.bodyText.trim().length > 0 ? props.bodyText.trim().split("\n") : [];

  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      <text fg={calloutForegroundColor}>
        <span attributes={TextAttributes.BOLD} fg={calloutForegroundColor}>{`▌ ${props.calloutKind}`}</span>
      </text>
      <text fg={calloutForegroundColor}>{"├" + "─".repeat(Math.max(12, props.calloutKind.length + 2))}</text>
      {bodyLines.map((bodyLine, index) => (
        <box key={`assistant-callout-line-${index}`} width="100%">
          <text fg={calloutForegroundColor} wrapMode="word">
            <span fg={calloutForegroundColor}>│ </span>
            <AssistantMarkdownInlineText
              foregroundColor={calloutForegroundColor}
              inlineText={formatAssistantMarkdownInlineTextForStyledText(bodyLine)}
            />
          </text>
        </box>
      ))}
    </box>
  );
}

function applyAssistantMarkdownFlowSpacing(defaultRenderable: CodeRenderable): void {
  defaultRenderable.marginBottom = 1;
}

function AssistantUnifiedDiffBlock(props: { unifiedDiffText: string }): ReactNode {
  const fileSummaries = summarizeAssistantUnifiedDiffFiles(props.unifiedDiffText);
  const singleDiffFilePath = fileSummaries.length === 1 ? fileSummaries[0]?.filePath : undefined;
  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      {fileSummaries.length > 0 ? (
        <box flexDirection="column" paddingX={1} width="100%">
          {fileSummaries.map((fileSummary) => (
            <box gap={1} key={fileSummary.filePath} width="100%">
              <text fg={chatScreenTheme.textMuted}>patch</text>
              <text fg={chatScreenTheme.accentCyan}>{fileSummary.filePath}</text>
              <text fg={chatScreenTheme.accentGreen}>{`+${fileSummary.addedLineCount}`}</text>
              <text fg={chatScreenTheme.accentRed}>{`-${fileSummary.removedLineCount}`}</text>
            </box>
          ))}
        </box>
      ) : null}
      <DiffBlock
        unifiedDiffText={props.unifiedDiffText}
        {...(singleDiffFilePath !== undefined ? { filePath: singleDiffFilePath } : {})}
      />
    </box>
  );
}

function AssistantSnippetFrame(props: {
  accentColor?: string | undefined;
  children: ReactNode;
  headerText?: string | undefined;
}): ReactNode {
  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      <box
        border={["left"]}
        borderColor={props.accentColor ?? chatScreenTheme.borderSubtle}
        flexDirection="column"
        paddingX={1}
        width="100%"
      >
        {props.headerText ? (
          <box width="100%">
            <text fg={chatScreenTheme.textDim}>{props.headerText}</text>
          </box>
        ) : null}
        {props.children}
      </box>
    </box>
  );
}

function resolveAssistantDiffSnippetLineColor(diffSnippetLine: string): string {
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

function AssistantDiffSnippetBlock(props: {
  diffSnippetText: string;
  filePath?: string | undefined;
}): ReactNode {
  const normalizedDiffSnippet = buildAssistantDiffSnippetUnifiedDiff(props);
  const headerText = summarizeAssistantDiffSnippet({
    diffSnippetText: props.diffSnippetText,
    filePath: props.filePath,
  });

  if (normalizedDiffSnippet) {
    return (
      <AssistantSnippetFrame accentColor={chatScreenTheme.accentPrimaryMuted} headerText={headerText}>
        <DiffBlock
          density="compact"
          filePath={normalizedDiffSnippet.filePath}
          unifiedDiffText={normalizedDiffSnippet.unifiedDiffText}
        />
      </AssistantSnippetFrame>
    );
  }

  const diffSnippetLines = listVisibleAssistantDiffSnippetLines(props.diffSnippetText);
  return (
    <AssistantSnippetFrame accentColor={chatScreenTheme.accentPrimaryMuted} headerText={headerText}>
      {diffSnippetLines.map((diffSnippetLine, index) => (
        <box key={`assistant-diff-snippet-line-${index}`} width="100%">
          <text fg={resolveAssistantDiffSnippetLineColor(diffSnippetLine)} wrapMode="none">
            {diffSnippetLine}
          </text>
        </box>
      ))}
    </AssistantSnippetFrame>
  );
}

function AssistantShellSnippetBlock(props: { shellSnippetText: string }): ReactNode {
  const shellSnippetLines = props.shellSnippetText.split("\n");
  return (
    <AssistantSnippetFrame accentColor={chatScreenTheme.accentGreen}>
      {shellSnippetLines.map((shellSnippetLine, index) => (
        <box key={`assistant-shell-snippet-line-${index}`} width="100%">
          <text wrapMode="none">
            {shellSnippetLine.trim().length > 0 ? (
              <>
                <span fg={chatScreenTheme.accentGreen}>$ </span>
                <span fg={githubLikeTerminalCodeColors.foreground}>{shellSnippetLine}</span>
              </>
            ) : ""}
          </text>
        </box>
      ))}
    </AssistantSnippetFrame>
  );
}

function AssistantCodeFenceBlock(props: {
  codeFenceInfo: AssistantMarkdownCodeFenceInfo;
  codeFenceText: string;
}): ReactNode {
  const codeFenceLines = props.codeFenceText.split("\n");
  const visibleCodeFenceLines = codeFenceLines.length === 1 && codeFenceLines[0] === "" ? [] : codeFenceLines;
  return (
    <AssistantSnippetFrame headerText={props.codeFenceInfo.codeFenceDisplayLabel}>
      <FencedCodeBlock
        variant="embedded"
        codeLines={visibleCodeFenceLines.map((lineText) => ({ lineText }))}
        {...(props.codeFenceInfo.codeFenceFilePath !== undefined ? { filePath: props.codeFenceInfo.codeFenceFilePath } : {})}
        languageLabel={props.codeFenceInfo.codeLanguageLabel}
        showLabel={false}
        wrapMode="none"
      />
    </AssistantSnippetFrame>
  );
}

const MemoizedAssistantCodeFenceBlock = memo(AssistantCodeFenceBlock, (previousProps, nextProps) => {
  return previousProps.codeFenceText === nextProps.codeFenceText &&
    areAssistantMarkdownCodeFenceInfoValuesEqual(previousProps.codeFenceInfo, nextProps.codeFenceInfo);
});
const MemoizedAssistantMarkdownParagraphBlock = memo(AssistantMarkdownParagraphBlock);
const MemoizedAssistantMarkdownHeadingBlock = memo(AssistantMarkdownHeadingBlock);
const MemoizedAssistantMarkdownHorizontalRuleBlock = memo(AssistantMarkdownHorizontalRuleBlock);
const MemoizedAssistantMarkdownTableBlock = memo(AssistantMarkdownTableBlock);
const MemoizedAssistantMarkdownListBlock = memo(AssistantMarkdownListBlock, (previousProps, nextProps) => {
  return previousProps.hasLeadingBlankLine === nextProps.hasLeadingBlankLine &&
    areAssistantMarkdownVisibleListLinesEqual(previousProps.listLines, nextProps.listLines);
});
const MemoizedAssistantMarkdownQuoteBlock = memo(AssistantMarkdownQuoteBlock);
const MemoizedAssistantUnifiedDiffBlock = memo(AssistantUnifiedDiffBlock);
const MemoizedAssistantDiffSnippetBlock = memo(AssistantDiffSnippetBlock);
const MemoizedAssistantShellSnippetBlock = memo(AssistantShellSnippetBlock);

export function AssistantMarkdownBlock(props: AssistantMarkdownBlockProps): ReactNode {
  const renderSectionCacheRef = useRef<AssistantMarkdownRenderSectionCache | undefined>(undefined);
  const terminalColumnCount = props.terminalColumnCount ?? defaultAssistantMarkdownTerminalColumnCount;
  const markdownChromeColumnCount = Math.max(20, terminalColumnCount - 4);
  const horizontalRuleText = useMemo(
    () => repeatAssistantMarkdownChromeRule({ availableColumnCount: markdownChromeColumnCount }),
    [markdownChromeColumnCount],
  );
  const assistantMarkdownRenderSections = useMemo(
    () => {
      const stableRenderSections = buildStableAssistantMarkdownRenderSections({
        markdownText: props.markdownText,
        isStreaming: props.isStreaming,
        previousCache: renderSectionCacheRef.current,
      });
      renderSectionCacheRef.current = stableRenderSections.nextCache;
      return stableRenderSections.renderSections;
    },
    [props.isStreaming, props.markdownText],
  );
  const horizontalRuleSyntaxStyle = useMemo(
    () => SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex(props.horizontalRuleColor) } }),
    [props.horizontalRuleColor],
  );

  const renderMarkdownNodeWithBuliChromeEnhancements = useCallback<NonNullable<MarkdownOptions["renderNode"]>>((token, context) => {
    const defaultRenderable = context.defaultRender();

    if (defaultRenderable instanceof CodeRenderable) {
      defaultRenderable.drawUnstyledText = true;

      if (isAssistantMarkdownCodeToken(token)) {
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      if (isAssistantMarkdownHeadingToken(token)) {
        // Leading newline gives breathing room before each heading, including after an HR.
        defaultRenderable.content = formatAssistantMarkdownHeadingText(token.text, token.depth);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.syntaxStyle = resolveAssistantMarkdownHeadingSyntaxStyle(token.depth);
        return defaultRenderable;
      }

      if (isAssistantMarkdownBlockquoteToken(token)) {
        const assistantMarkdownCallout = parseAssistantMarkdownCallout(token.text);
        defaultRenderable.content = assistantMarkdownCallout
          ? formatAssistantMarkdownCalloutText(assistantMarkdownCallout)
          : formatAssistantMarkdownQuoteText(token.text);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.syntaxStyle = assistantMarkdownCallout
          ? assistantMarkdownCalloutSyntaxStyleByKind[assistantMarkdownCallout.calloutKind]
          : assistantMarkdownQuoteSyntaxStyle;
        return defaultRenderable;
      }

      if (isAssistantMarkdownListToken(token)) {
        defaultRenderable.content = formatAssistantMarkdownListText(token);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownListChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.syntaxStyle = assistantMarkdownTaskListSyntaxStyle;
        return defaultRenderable;
      }

      if (token.type === "hr" || isAssistantMarkdownDashOnlyParagraphToken(token)) {
        // Dash-only paragraphs slip through during streaming before the parser classifies
        // them as `hr`. Render both the same way to avoid raw `---` leaking on screen.
        defaultRenderable.content = horizontalRuleText;
        defaultRenderable.filetype = "text";
        defaultRenderable.syntaxStyle = horizontalRuleSyntaxStyle;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        defaultRenderable.wrapMode = "none";
        return defaultRenderable;
      }

      if (isAssistantMarkdownParagraphToken(token)) {
        defaultRenderable.content = formatAssistantMarkdownInlineTextForStyledText(token.text);
        defaultRenderable.filetype = "markdown";
        defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
        applyAssistantMarkdownFlowSpacing(defaultRenderable);
        return defaultRenderable;
      }

      defaultRenderable.onChunks = decorateAssistantMarkdownProseChunks;
    }

    return defaultRenderable;
  }, [horizontalRuleSyntaxStyle, horizontalRuleText]);

  return (
    <box flexDirection="column" width="100%">
      {assistantMarkdownRenderSections.map((assistantMarkdownRenderSection) => (
        assistantMarkdownRenderSection.sectionKind === "markdown" ? (
          <AssistantMarkdownTextSection
            isStreaming={props.isStreaming}
            key={assistantMarkdownRenderSection.sectionKey}
            markdownText={assistantMarkdownRenderSection.markdownText}
            renderNode={renderMarkdownNodeWithBuliChromeEnhancements}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "paragraph" ? (
          <MemoizedAssistantMarkdownParagraphBlock
            key={assistantMarkdownRenderSection.sectionKey}
            paragraphText={assistantMarkdownRenderSection.paragraphText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "heading" ? (
          <MemoizedAssistantMarkdownHeadingBlock
            headingDepth={assistantMarkdownRenderSection.headingDepth}
            headingText={assistantMarkdownRenderSection.headingText}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "horizontalRule" ? (
          <MemoizedAssistantMarkdownHorizontalRuleBlock
            horizontalRuleColor={props.horizontalRuleColor}
            horizontalRuleText={horizontalRuleText}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "table" ? (
          <MemoizedAssistantMarkdownTableBlock
            isStreaming={props.isStreaming}
            key={assistantMarkdownRenderSection.sectionKey}
            renderNode={renderMarkdownNodeWithBuliChromeEnhancements}
            tableMarkdownText={assistantMarkdownRenderSection.tableMarkdownText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "codeFence" ? (
          <MemoizedAssistantCodeFenceBlock
            codeFenceInfo={assistantMarkdownRenderSection.codeFenceInfo}
            codeFenceText={assistantMarkdownRenderSection.codeFenceText}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "list" ? (
          <MemoizedAssistantMarkdownListBlock
            hasLeadingBlankLine={assistantMarkdownRenderSection.hasLeadingBlankLine}
            key={assistantMarkdownRenderSection.sectionKey}
            listLines={assistantMarkdownRenderSection.listLines}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "blockquote" ? (
          <MemoizedAssistantMarkdownQuoteBlock
            key={assistantMarkdownRenderSection.sectionKey}
            quoteText={assistantMarkdownRenderSection.quoteText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "unifiedDiff" ? (
          <MemoizedAssistantUnifiedDiffBlock
            key={assistantMarkdownRenderSection.sectionKey}
            unifiedDiffText={assistantMarkdownRenderSection.unifiedDiffText}
          />
        ) : assistantMarkdownRenderSection.sectionKind === "shellSnippet" ? (
          <MemoizedAssistantShellSnippetBlock
            key={assistantMarkdownRenderSection.sectionKey}
            shellSnippetText={assistantMarkdownRenderSection.shellSnippetText}
          />
        ) : (
          <MemoizedAssistantDiffSnippetBlock
            diffSnippetText={assistantMarkdownRenderSection.diffSnippetText}
            {...(assistantMarkdownRenderSection.filePath !== undefined
              ? { filePath: assistantMarkdownRenderSection.filePath }
              : {})}
            key={assistantMarkdownRenderSection.sectionKey}
          />
        )
      ))}
    </box>
  );
}
