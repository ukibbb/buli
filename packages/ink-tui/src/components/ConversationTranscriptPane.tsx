import { Box, type DOMElement, useBoxMetrics } from "ink";
import { memo, useEffect, useRef, type ReactNode } from "react";
import type { ConversationTranscriptEntry } from "../chatScreenState.ts";
import type { ConversationTranscriptViewportMeasurements } from "../conversationTranscriptViewportState.ts";
import type { AssistantContentPart } from "@buli/contracts";
import {
  parseAssistantResponseMarkdown,
  type AssistantMarkdownBlock,
} from "../richText/parseAssistantResponseMarkdown.ts";
import { RenderAssistantResponseTree } from "../richText/renderAssistantResponseTree.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { ToolApprovalRequestBlock } from "./behavior/ToolApprovalRequestBlock.tsx";
import { ReasoningCollapsedChip } from "./ReasoningCollapsedChip.tsx";
import { ReasoningStreamBlock } from "./ReasoningStreamBlock.tsx";
import { ToolCallEntryView } from "./toolCalls/ToolCallEntryView.tsx";
import { TurnFooter } from "./TurnFooter.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";

// Adapts the local parser's block shape to the contract's part shape during
// streaming, when assistantContentParts isn't yet on the message. The only
// structural difference is blockKind→kind and "fenced_code"→"fenced_code_block";
// all other field names are identical.
function mapAssistantMarkdownBlockToAssistantContentPart(
  assistantMarkdownBlock: AssistantMarkdownBlock,
): AssistantContentPart {
  if (assistantMarkdownBlock.blockKind === "fenced_code") {
    return {
      kind: "fenced_code_block",
      ...(assistantMarkdownBlock.languageLabel ? { languageLabel: assistantMarkdownBlock.languageLabel } : {}),
      codeLines: assistantMarkdownBlock.codeLines,
    };
  }
  const { blockKind, ...rest } = assistantMarkdownBlock;
  return { kind: blockKind, ...rest } as AssistantContentPart;
}

// ConversationTranscriptPane is the dispatch switch for every transcript
// entry kind. Each arm returns the component that matches the design for
// that entry so the pane stays a pure mapper — all rendering logic lives
// in the leaf components.
export type ConversationTranscriptPaneProps = {
  conversationTranscriptEntries: ConversationTranscriptEntry[];
  hiddenTranscriptRowsAboveViewport: number;
  onConversationTranscriptViewportMeasured: (
    conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
  ) => void;
};

export function ConversationTranscriptPane(props: ConversationTranscriptPaneProps) {
  const conversationTranscriptViewportFrameRef = useRef<DOMElement>(null!);
  const fullConversationTranscriptContentRef = useRef<DOMElement>(null!);
  const conversationTranscriptViewportFrameMetrics = useBoxMetrics(conversationTranscriptViewportFrameRef);
  const fullConversationTranscriptContentMetrics = useBoxMetrics(fullConversationTranscriptContentRef);
  const shouldUseMeasuredTranscriptOffset =
    conversationTranscriptViewportFrameMetrics.hasMeasured && fullConversationTranscriptContentMetrics.hasMeasured;

  useEffect(() => {
    if (!conversationTranscriptViewportFrameMetrics.hasMeasured || !fullConversationTranscriptContentMetrics.hasMeasured) {
      return;
    }

    props.onConversationTranscriptViewportMeasured({
      visibleViewportHeightInRows: conversationTranscriptViewportFrameMetrics.height,
      fullTranscriptContentHeightInRows: fullConversationTranscriptContentMetrics.height,
    });
  }, [
    conversationTranscriptViewportFrameMetrics.hasMeasured,
    conversationTranscriptViewportFrameMetrics.height,
    fullConversationTranscriptContentMetrics.hasMeasured,
    fullConversationTranscriptContentMetrics.height,
    props,
  ]);

  if (props.conversationTranscriptEntries.length === 0) {
    return <Box flexGrow={1} ref={conversationTranscriptViewportFrameRef} />;
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden" position="relative" ref={conversationTranscriptViewportFrameRef}>
      <Box
        flexDirection="column"
        left={shouldUseMeasuredTranscriptOffset ? 0 : undefined}
        position={shouldUseMeasuredTranscriptOffset ? "absolute" : "relative"}
        ref={fullConversationTranscriptContentRef}
        top={shouldUseMeasuredTranscriptOffset ? -props.hiddenTranscriptRowsAboveViewport : undefined}
        width={shouldUseMeasuredTranscriptOffset ? "100%" : undefined}
      >
        {props.conversationTranscriptEntries.map((conversationTranscriptEntry, index) => (
          <Box
            flexDirection="column"
            key={`transcript-entry-${index}`}
            marginTop={index === 0 ? 0 : 1}
            width="100%"
          >
            <ConversationTranscriptEntryView conversationTranscriptEntry={conversationTranscriptEntry} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Memoised so cursor / snake / elapsed-timer ticks elsewhere in the tree
// don't repaint every finalised tool-call card, reasoning chip, or message.
// The reducer reuses object identity for entries it doesn't mutate, so
// React.memo's default shallow compare correctly skips work for them and
// only re-renders the one growing entry during streaming.
const ConversationTranscriptEntryView = memo(function ConversationTranscriptEntryView(props: {
  conversationTranscriptEntry: ConversationTranscriptEntry;
}): ReactNode {
  const { conversationTranscriptEntry } = props;

  if (conversationTranscriptEntry.kind === "error") {
    return <ErrorBannerBlock errorText={conversationTranscriptEntry.text} />;
  }

  if (conversationTranscriptEntry.kind === "incomplete_response_notice") {
    return <IncompleteResponseNoticeBlock incompleteReason={conversationTranscriptEntry.incompleteReason} />;
  }

  if (conversationTranscriptEntry.kind === "streaming_reasoning_summary") {
    return (
      <ReasoningStreamBlock
        reasoningSummaryText={conversationTranscriptEntry.reasoningSummaryText}
        reasoningStartedAtMs={conversationTranscriptEntry.reasoningStartedAtMs}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "completed_reasoning_summary") {
    return (
      <ReasoningCollapsedChip
        reasoningDurationMs={conversationTranscriptEntry.reasoningDurationMs}
        reasoningTokenCount={conversationTranscriptEntry.reasoningTokenCount}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "streaming_tool_call") {
    return (
      <ToolCallEntryView
        renderState="streaming"
        toolCallDetail={conversationTranscriptEntry.toolCallDetail}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "completed_tool_call") {
    return (
      <ToolCallEntryView
        renderState="completed"
        toolCallDetail={conversationTranscriptEntry.toolCallDetail}
        durationMs={conversationTranscriptEntry.durationMs}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "failed_tool_call") {
    return (
      <ToolCallEntryView
        renderState="failed"
        toolCallDetail={conversationTranscriptEntry.toolCallDetail}
        durationMs={conversationTranscriptEntry.durationMs}
        errorText={conversationTranscriptEntry.errorText}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "plan_proposal") {
    return (
      <PlanProposalBlock
        planTitle={conversationTranscriptEntry.planTitle}
        planSteps={conversationTranscriptEntry.planSteps}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "rate_limit_notice") {
    return (
      <RateLimitNoticeBlock
        retryAfterSeconds={conversationTranscriptEntry.retryAfterSeconds}
        limitExplanation={conversationTranscriptEntry.limitExplanation}
        noticeStartedAtMs={conversationTranscriptEntry.noticeStartedAtMs}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "tool_approval_request") {
    return (
      <ToolApprovalRequestBlock
        pendingToolCallDetail={conversationTranscriptEntry.pendingToolCallDetail}
        riskExplanation={conversationTranscriptEntry.riskExplanation}
      />
    );
  }

  if (conversationTranscriptEntry.kind === "turn_footer") {
    return (
      <TurnFooter
        modelDisplayName={conversationTranscriptEntry.modelDisplayName}
        turnDurationMs={conversationTranscriptEntry.turnDurationMs}
        usage={conversationTranscriptEntry.usage}
      />
    );
  }

  // Remaining arm: kind === "message". User prompts get their own bordered
  // block; assistant messages flow through the markdown parser so prose,
  // code, lists, and callouts render as rich blocks instead of raw text.
  if (conversationTranscriptEntry.message.role === "user") {
    return <UserPromptBlock promptText={conversationTranscriptEntry.message.text} />;
  }
  return (
    <RenderAssistantResponseTree
      assistantContentParts={
        conversationTranscriptEntry.message.assistantContentParts ??
        parseAssistantResponseMarkdown(conversationTranscriptEntry.message.text).map(
          mapAssistantMarkdownBlockToAssistantContentPart,
        )
      }
    />
  );
});
