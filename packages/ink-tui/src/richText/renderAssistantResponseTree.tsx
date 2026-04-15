import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import { BulletedList } from "../components/primitives/BulletedList.tsx";
import { Callout } from "../components/primitives/Callout.tsx";
import { Checklist } from "../components/primitives/Checklist.tsx";
import { FencedCodeBlock } from "../components/primitives/FencedCodeBlock.tsx";
import {
  InlineMarkdownText,
  type InlineMarkdownSpan,
} from "../components/primitives/InlineMarkdownText.tsx";
import { NumberedList } from "../components/primitives/NumberedList.tsx";
import type { AssistantMarkdownBlock } from "./parseAssistantResponseMarkdown.ts";

// Turns the parsed block tree into Ink primitives. Heading levels map onto
// bold + accent colour because the terminal has a single font size (see
// ink-limitations.md §2). Everything else is a thin adapter between our
// block-kind union and the primitive whose props already match.
export type RenderAssistantResponseTreeProps = {
  assistantMarkdownBlocks: AssistantMarkdownBlock[];
};

export function RenderAssistantResponseTree(props: RenderAssistantResponseTreeProps): ReactNode {
  return (
    <Box flexDirection="column" width="100%">
      {props.assistantMarkdownBlocks.map((assistantMarkdownBlock, index) => (
        <Box
          flexDirection="column"
          key={`assistant-block-${index}`}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <AssistantMarkdownBlockView assistantMarkdownBlock={assistantMarkdownBlock} />
        </Box>
      ))}
    </Box>
  );
}

function AssistantMarkdownBlockView(props: { assistantMarkdownBlock: AssistantMarkdownBlock }): ReactNode {
  const { assistantMarkdownBlock } = props;
  if (assistantMarkdownBlock.blockKind === "paragraph") {
    return <InlineMarkdownText spans={assistantMarkdownBlock.inlineSpans} />;
  }
  if (assistantMarkdownBlock.blockKind === "heading") {
    return <HeadingView headingLevel={assistantMarkdownBlock.headingLevel} inlineSpans={assistantMarkdownBlock.inlineSpans} />;
  }
  if (assistantMarkdownBlock.blockKind === "bulleted_list") {
    return (
      <BulletedList
        itemContents={assistantMarkdownBlock.itemSpanArrays.map((itemSpans) => (
          <InlineMarkdownText spans={itemSpans} />
        ))}
      />
    );
  }
  if (assistantMarkdownBlock.blockKind === "numbered_list") {
    return (
      <NumberedList
        itemContents={assistantMarkdownBlock.itemSpanArrays.map((itemSpans) => (
          <InlineMarkdownText spans={itemSpans} />
        ))}
      />
    );
  }
  if (assistantMarkdownBlock.blockKind === "checklist") {
    return <Checklist items={assistantMarkdownBlock.items} />;
  }
  if (assistantMarkdownBlock.blockKind === "fenced_code") {
    return (
      <FencedCodeBlock
        {...(assistantMarkdownBlock.languageLabel ? { languageLabel: assistantMarkdownBlock.languageLabel } : {})}
        codeLines={assistantMarkdownBlock.codeLines.map((codeLineText) => ({ lineText: codeLineText }))}
      />
    );
  }
  if (assistantMarkdownBlock.blockKind === "callout") {
    return (
      <Callout
        severity={assistantMarkdownBlock.severity}
        {...(assistantMarkdownBlock.titleText ? { titleText: assistantMarkdownBlock.titleText } : {})}
        bodyContent={<InlineMarkdownText spans={assistantMarkdownBlock.inlineSpans} />}
      />
    );
  }
  // Remaining arm: horizontal_rule. Rendered as a dim full-width dashed line
  // so it reads like a genuine separator rather than accidental copy.
  return (
    <Box width="100%">
      <Text color={chatScreenTheme.textDim}>{"─".repeat(40)}</Text>
    </Box>
  );
}

function HeadingView(props: { headingLevel: 1 | 2 | 3; inlineSpans: InlineMarkdownSpan[] }): ReactNode {
  const headingColor =
    props.headingLevel === 1
      ? chatScreenTheme.textPrimary
      : props.headingLevel === 2
        ? chatScreenTheme.textPrimary
        : chatScreenTheme.textSecondary;
  const headingPrefix =
    props.headingLevel === 1 ? "# " : props.headingLevel === 2 ? "## " : "### ";
  return (
    <Box width="100%">
      <Text bold color={headingColor}>
        {headingPrefix}
      </Text>
      <InlineMarkdownText spans={props.inlineSpans} />
    </Box>
  );
}
