import { Box, Text } from "ink";
import type { ReactNode } from "react";
import type { AssistantContentPart, InlineSpan } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { BulletedList } from "../components/primitives/BulletedList.tsx";
import { Callout } from "../components/primitives/Callout.tsx";
import { Checklist } from "../components/primitives/Checklist.tsx";
import { FencedCodeBlock } from "../components/primitives/FencedCodeBlock.tsx";
import { InlineMarkdownText } from "../components/primitives/InlineMarkdownText.tsx";
import { NumberedList } from "../components/primitives/NumberedList.tsx";

// Turns the assistant-turn content-part list into Ink primitives. Heading
// levels collapse onto bold + accent colour because the terminal has a single
// font size (see ink-limitations.md §2). Everything else is a thin adapter
// between each typed part kind and the primitive whose props already match.
export type RenderAssistantResponseTreeProps = {
  assistantContentParts: readonly AssistantContentPart[];
};

export function RenderAssistantResponseTree(props: RenderAssistantResponseTreeProps): ReactNode {
  return (
    <Box flexDirection="column" width="100%">
      {props.assistantContentParts.map((assistantContentPart, index) => (
        <Box
          flexDirection="column"
          key={`assistant-part-${index}`}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <AssistantContentPartView assistantContentPart={assistantContentPart} />
        </Box>
      ))}
    </Box>
  );
}

function AssistantContentPartView(props: { assistantContentPart: AssistantContentPart }): ReactNode {
  const { assistantContentPart } = props;
  if (assistantContentPart.kind === "paragraph") {
    return <InlineMarkdownText spans={assistantContentPart.inlineSpans} />;
  }
  if (assistantContentPart.kind === "heading") {
    return (
      <HeadingView
        headingLevel={assistantContentPart.headingLevel}
        inlineSpans={assistantContentPart.inlineSpans}
      />
    );
  }
  if (assistantContentPart.kind === "bulleted_list") {
    return (
      <BulletedList
        itemContents={assistantContentPart.itemSpanArrays.map((itemSpans) => (
          <InlineMarkdownText spans={itemSpans} />
        ))}
      />
    );
  }
  if (assistantContentPart.kind === "numbered_list") {
    return (
      <NumberedList
        itemContents={assistantContentPart.itemSpanArrays.map((itemSpans) => (
          <InlineMarkdownText spans={itemSpans} />
        ))}
      />
    );
  }
  if (assistantContentPart.kind === "checklist") {
    return <Checklist items={assistantContentPart.items} />;
  }
  if (assistantContentPart.kind === "fenced_code_block") {
    return (
      <FencedCodeBlock
        {...(assistantContentPart.languageLabel ? { languageLabel: assistantContentPart.languageLabel } : {})}
        codeLines={assistantContentPart.codeLines.map((codeLineText) => ({ lineText: codeLineText }))}
      />
    );
  }
  if (assistantContentPart.kind === "callout") {
    return (
      <Callout
        severity={assistantContentPart.severity}
        {...(assistantContentPart.titleText ? { titleText: assistantContentPart.titleText } : {})}
        bodyContent={<InlineMarkdownText spans={assistantContentPart.inlineSpans} />}
      />
    );
  }
  // Remaining arm: horizontal_rule.
  return (
    <Box flexDirection="row" alignItems="center" gap={1} width="100%">
      <Box flexGrow={1}>
        <Text color={chatScreenTheme.border}>{"─".repeat(40)}</Text>
      </Box>
      <Text color={chatScreenTheme.textDim}>§</Text>
      <Box flexGrow={1}>
        <Text color={chatScreenTheme.border}>{"─".repeat(40)}</Text>
      </Box>
    </Box>
  );
}

function HeadingView(props: { headingLevel: 1 | 2 | 3 | 4 | 5 | 6; inlineSpans: InlineSpan[] }): ReactNode {
  const prefixColor =
    props.headingLevel === 1
      ? chatScreenTheme.accentCyan
      : props.headingLevel === 2
        ? chatScreenTheme.accentGreen
        : props.headingLevel === 3
          ? chatScreenTheme.accentAmber
          : props.headingLevel === 4
            ? chatScreenTheme.textSecondary
            : props.headingLevel === 5
              ? chatScreenTheme.textMuted
              : chatScreenTheme.textDim;
  const bodyColor =
    props.headingLevel === 3 || props.headingLevel === 5
      ? chatScreenTheme.textSecondary
      : props.headingLevel === 6
        ? chatScreenTheme.textMuted
        : chatScreenTheme.textPrimary;
  const headingPrefix =
    props.headingLevel === 1
      ? ">_ "
      : props.headingLevel === 2
        ? "## "
        : props.headingLevel === 3
          ? "### "
          : props.headingLevel === 4
            ? "#### "
            : props.headingLevel === 5
              ? "##### "
              : "###### ";
  return (
    <Box width="100%">
      <Text bold color={prefixColor}>
        {headingPrefix}
      </Text>
      {props.headingLevel === 3 || props.headingLevel === 5 ? (
        <Text bold color={bodyColor}>
          {props.inlineSpans.map((span, index) => (
            <Text key={index}>{span.spanText}</Text>
          ))}
        </Text>
      ) : (
        <Text bold color={bodyColor}>
          <InlineMarkdownText spans={props.inlineSpans} />
        </Text>
      )}
    </Box>
  );
}
