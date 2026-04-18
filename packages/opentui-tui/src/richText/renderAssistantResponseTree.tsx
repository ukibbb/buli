import type { ReactNode } from "react";
import type { AssistantContentPart, InlineSpan } from "@buli/contracts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { BulletedList } from "../components/primitives/BulletedList.tsx";
import { Callout } from "../components/primitives/Callout.tsx";
import { Checklist } from "../components/primitives/Checklist.tsx";
import { FencedCodeBlock } from "../components/primitives/FencedCodeBlock.tsx";
import { InlineMarkdownText } from "../components/primitives/InlineMarkdownText.tsx";
import { NumberedList } from "../components/primitives/NumberedList.tsx";

// Turns the assistant-turn content-part list into OpenTUI primitives. Heading
// levels collapse onto bold + accent colour because the terminal has a single
// font size (see ink-limitations.md §2). Everything else is a thin adapter
// between each typed part kind and the primitive whose props already match.
export type RenderAssistantResponseTreeProps = {
  assistantContentParts: readonly AssistantContentPart[];
};

export function RenderAssistantResponseTree(props: RenderAssistantResponseTreeProps): ReactNode {
  return (
    <box flexDirection="column" width="100%">
      {props.assistantContentParts.map((assistantContentPart, index) => (
        <box
          flexDirection="column"
          key={`assistant-part-${index}`}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <AssistantContentPartView assistantContentPart={assistantContentPart} />
        </box>
      ))}
    </box>
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
    <box flexDirection="row" alignItems="center" gap={1} width="100%">
      <box flexGrow={1}>
        <text fg={chatScreenTheme.border}>{"─".repeat(40)}</text>
      </box>
      <text fg={chatScreenTheme.textDim}>§</text>
      <box flexGrow={1}>
        <text fg={chatScreenTheme.border}>{"─".repeat(40)}</text>
      </box>
    </box>
  );
}

function HeadingView(props: { headingLevel: 1 | 2 | 3; inlineSpans: InlineSpan[] }): ReactNode {
  const prefixColor =
    props.headingLevel === 1
      ? chatScreenTheme.accentCyan
      : props.headingLevel === 2
        ? chatScreenTheme.accentGreen
        : chatScreenTheme.accentAmber;
  const bodyColor =
    props.headingLevel === 3 ? chatScreenTheme.textSecondary : chatScreenTheme.textPrimary;
  const headingPrefix =
    props.headingLevel === 1 ? ">_ " : props.headingLevel === 2 ? "## " : "### ";
  // Prefix and spans must share a single <text> parent so they render on one
  // line — in OpenTUI <text> is block-level and two adjacent <text> elements
  // would appear on separate rows.
  return (
    <box width="100%">
      <text>
        <b fg={prefixColor}>{headingPrefix}</b>
        {props.inlineSpans.map((span, index) => (
          <span key={index} fg={bodyColor}>{span.spanText}</span>
        ))}
      </text>
    </box>
  );
}
