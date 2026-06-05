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
  type AssistantMarkdownRenderSection,
  type AssistantMarkdownCalloutKind,
  type AssistantMarkdownCodeFenceInfo,
  type AssistantMarkdownRenderSectionCache,
  type AssistantMarkdownVisibleListLine,
} from "./assistantMarkdownRenderSections.ts";
import {
  assistantMarkdownSyntaxStyle,
  githubLikeTerminalCodeColors,
} from "./codeRenderingTheme.ts";
import {
  assistantMarkdownCalloutSyntaxStyleByKind,
  assistantMarkdownQuoteSyntaxStyle,
  assistantMarkdownTableOptions,
  assistantMarkdownTaskListSyntaxStyle,
  defaultAssistantMarkdownTerminalColumnCount,
  formatAssistantMarkdownVisibleHeadingText,
  resolveAssistantMarkdownHeadingForegroundColor,
  resolveAssistantMarkdownHeadingSyntaxStyle,
  resolveAssistantMarkdownVisibleListMarkerColor,
} from "./assistantMarkdownTerminalTheme.ts";
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
      tableOptions={assistantMarkdownTableOptions}
      treeSitterClient={openTuiSharedTreeSitterClient}
      width="100%"
    />
  );
}

function AssistantMarkdownStreamingTailBlock(props: { streamingTailText: string }): ReactNode {
  const streamingTailLines = props.streamingTailText.split("\n");
  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      {streamingTailLines.map((streamingTailLine, index) => (
        <box key={`assistant-streaming-tail-line-${index}`} width="100%">
          <text fg={chatScreenTheme.textPrimary} wrapMode="word">
            <AssistantMarkdownInlineText inlineText={streamingTailLine} />
          </text>
        </box>
      ))}
    </box>
  );
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
        tableOptions={assistantMarkdownTableOptions}
        treeSitterClient={openTuiSharedTreeSitterClient}
        width="100%"
      />
    </box>
  );
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
          <text fg={resolveAssistantDiffSnippetLineColor(diffSnippetLine)} wrapMode="char" width="100%">
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
          <text wrapMode="char" width="100%">
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
  return (
    <box flexDirection="column" marginBottom={1} width="100%">
      {props.codeFenceInfo.codeFenceDisplayLabel ? (
        <box width="100%">
          <text fg={chatScreenTheme.accentCyan}>{props.codeFenceInfo.codeFenceDisplayLabel}</text>
        </box>
      ) : null}
      <FencedCodeBlock
        variant="embedded"
        codeText={props.codeFenceText}
        decorateTeachingComments={true}
        {...(props.codeFenceInfo.codeFenceFilePath !== undefined ? { filePath: props.codeFenceInfo.codeFenceFilePath } : {})}
        languageLabel={props.codeFenceInfo.codeLanguageLabel}
        showLabel={false}
        wrapMode="char"
      />
    </box>
  );
}

const MemoizedAssistantCodeFenceBlock = memo(AssistantCodeFenceBlock, (previousProps, nextProps) => {
  return previousProps.codeFenceText === nextProps.codeFenceText &&
    areAssistantMarkdownCodeFenceInfoValuesEqual(previousProps.codeFenceInfo, nextProps.codeFenceInfo);
});
const MemoizedAssistantMarkdownTextSection = memo(AssistantMarkdownTextSection);
const MemoizedAssistantMarkdownStreamingTailBlock = memo(AssistantMarkdownStreamingTailBlock);
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

type AssistantMarkdownRenderSectionKind = AssistantMarkdownRenderSection["sectionKind"];
type AssistantMarkdownRenderSectionByKind<SectionKind extends AssistantMarkdownRenderSectionKind> = Extract<
  AssistantMarkdownRenderSection,
  { sectionKind: SectionKind }
>;

type AssistantMarkdownRenderSectionRendererInput<SectionKind extends AssistantMarkdownRenderSectionKind> = {
  assistantMarkdownRenderSection: AssistantMarkdownRenderSectionByKind<SectionKind>;
  horizontalRuleColor: string;
  horizontalRuleText: string;
  isStreaming: boolean;
  renderNode: NonNullable<MarkdownOptions["renderNode"]>;
};

type AssistantMarkdownRenderSectionRenderer<SectionKind extends AssistantMarkdownRenderSectionKind> = (
  input: AssistantMarkdownRenderSectionRendererInput<SectionKind>,
) => ReactNode;

const assistantMarkdownRenderSectionRendererByKind: {
  readonly [SectionKind in AssistantMarkdownRenderSectionKind]: AssistantMarkdownRenderSectionRenderer<SectionKind>;
} = {
  markdown: renderMarkdownTextRenderSection,
  streamingTail: renderStreamingTailRenderSection,
  heading: renderHeadingRenderSection,
  horizontalRule: renderHorizontalRuleRenderSection,
  table: renderTableRenderSection,
  codeFence: renderCodeFenceRenderSection,
  list: renderListRenderSection,
  blockquote: renderBlockquoteRenderSection,
  unifiedDiff: renderUnifiedDiffRenderSection,
  shellSnippet: renderShellSnippetRenderSection,
  diffSnippet: renderDiffSnippetRenderSection,
};

function AssistantMarkdownBlockComponent(props: AssistantMarkdownBlockProps): ReactNode {
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
      {assistantMarkdownRenderSections.map((assistantMarkdownRenderSection) =>
        renderAssistantMarkdownRenderSection({
          assistantMarkdownRenderSection,
          horizontalRuleColor: props.horizontalRuleColor,
          horizontalRuleText,
          isStreaming: props.isStreaming,
          renderNode: renderMarkdownNodeWithBuliChromeEnhancements,
        })
      )}
    </box>
  );
}

function areAssistantMarkdownBlockPropsEqual(
  previousProps: AssistantMarkdownBlockProps,
  nextProps: AssistantMarkdownBlockProps,
): boolean {
  return previousProps.markdownText === nextProps.markdownText &&
    previousProps.isStreaming === nextProps.isStreaming &&
    previousProps.horizontalRuleColor === nextProps.horizontalRuleColor &&
    previousProps.terminalColumnCount === nextProps.terminalColumnCount;
}

export const AssistantMarkdownBlock = memo(AssistantMarkdownBlockComponent, areAssistantMarkdownBlockPropsEqual);

function renderAssistantMarkdownRenderSection(input: {
  assistantMarkdownRenderSection: AssistantMarkdownRenderSection;
  horizontalRuleColor: string;
  horizontalRuleText: string;
  isStreaming: boolean;
  renderNode: NonNullable<MarkdownOptions["renderNode"]>;
}): ReactNode {
  const renderSection = resolveAssistantMarkdownRenderSectionRenderer(input.assistantMarkdownRenderSection);
  return renderSection(input);
}

function resolveAssistantMarkdownRenderSectionRenderer<SectionKind extends AssistantMarkdownRenderSectionKind>(
  assistantMarkdownRenderSection: AssistantMarkdownRenderSectionByKind<SectionKind>,
): AssistantMarkdownRenderSectionRenderer<SectionKind> {
  return assistantMarkdownRenderSectionRendererByKind[assistantMarkdownRenderSection.sectionKind] as AssistantMarkdownRenderSectionRenderer<SectionKind>;
}

function renderMarkdownTextRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"markdown">): ReactNode {
  return (
    <MemoizedAssistantMarkdownTextSection
      isStreaming={input.isStreaming}
      key={input.assistantMarkdownRenderSection.sectionKey}
      markdownText={input.assistantMarkdownRenderSection.markdownText}
      renderNode={input.renderNode}
    />
  );
}

function renderStreamingTailRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"streamingTail">): ReactNode {
  return (
    <MemoizedAssistantMarkdownStreamingTailBlock
      key={input.assistantMarkdownRenderSection.sectionKey}
      streamingTailText={input.assistantMarkdownRenderSection.streamingTailText}
    />
  );
}

function renderHeadingRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"heading">): ReactNode {
  return (
    <MemoizedAssistantMarkdownHeadingBlock
      headingDepth={input.assistantMarkdownRenderSection.headingDepth}
      headingText={input.assistantMarkdownRenderSection.headingText}
      key={input.assistantMarkdownRenderSection.sectionKey}
    />
  );
}

function renderHorizontalRuleRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"horizontalRule">): ReactNode {
  return (
    <MemoizedAssistantMarkdownHorizontalRuleBlock
      horizontalRuleColor={input.horizontalRuleColor}
      horizontalRuleText={input.horizontalRuleText}
      key={input.assistantMarkdownRenderSection.sectionKey}
    />
  );
}

function renderTableRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"table">): ReactNode {
  return (
    <MemoizedAssistantMarkdownTableBlock
      isStreaming={input.isStreaming}
      key={input.assistantMarkdownRenderSection.sectionKey}
      renderNode={input.renderNode}
      tableMarkdownText={input.assistantMarkdownRenderSection.tableMarkdownText}
    />
  );
}

function renderCodeFenceRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"codeFence">): ReactNode {
  return (
    <MemoizedAssistantCodeFenceBlock
      codeFenceInfo={input.assistantMarkdownRenderSection.codeFenceInfo}
      codeFenceText={input.assistantMarkdownRenderSection.codeFenceText}
      key={input.assistantMarkdownRenderSection.sectionKey}
    />
  );
}

function renderListRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"list">): ReactNode {
  return (
    <MemoizedAssistantMarkdownListBlock
      hasLeadingBlankLine={input.assistantMarkdownRenderSection.hasLeadingBlankLine}
      key={input.assistantMarkdownRenderSection.sectionKey}
      listLines={input.assistantMarkdownRenderSection.listLines}
    />
  );
}

function renderBlockquoteRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"blockquote">): ReactNode {
  return (
    <MemoizedAssistantMarkdownQuoteBlock
      key={input.assistantMarkdownRenderSection.sectionKey}
      quoteText={input.assistantMarkdownRenderSection.quoteText}
    />
  );
}

function renderUnifiedDiffRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"unifiedDiff">): ReactNode {
  return (
    <MemoizedAssistantUnifiedDiffBlock
      key={input.assistantMarkdownRenderSection.sectionKey}
      unifiedDiffText={input.assistantMarkdownRenderSection.unifiedDiffText}
    />
  );
}

function renderShellSnippetRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"shellSnippet">): ReactNode {
  return (
    <MemoizedAssistantShellSnippetBlock
      key={input.assistantMarkdownRenderSection.sectionKey}
      shellSnippetText={input.assistantMarkdownRenderSection.shellSnippetText}
    />
  );
}

function renderDiffSnippetRenderSection(input: AssistantMarkdownRenderSectionRendererInput<"diffSnippet">): ReactNode {
  return (
    <MemoizedAssistantDiffSnippetBlock
      diffSnippetText={input.assistantMarkdownRenderSection.diffSnippetText}
      {...(input.assistantMarkdownRenderSection.filePath !== undefined
        ? { filePath: input.assistantMarkdownRenderSection.filePath }
        : {})}
      key={input.assistantMarkdownRenderSection.sectionKey}
    />
  );
}
