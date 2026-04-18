import { memo, useEffect, useRef, type ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ConversationTranscriptEntry } from "../chatScreenState.ts";
import type { ConversationTranscriptViewportMeasurements } from "../conversationTranscriptViewportState.ts";
import { RenderAssistantResponseTree } from "../richText/renderAssistantResponseTree.tsx";
import { ErrorBannerBlock } from "./behavior/ErrorBannerBlock.tsx";
import { IncompleteResponseNoticeBlock } from "./behavior/IncompleteResponseNoticeBlock.tsx";
import { PlanProposalBlock } from "./behavior/PlanProposalBlock.tsx";
import { RateLimitNoticeBlock } from "./behavior/RateLimitNoticeBlock.tsx";
import { ToolApprovalRequestBlock } from "./behavior/ToolApprovalRequestBlock.tsx";
import { ReasoningCollapsedChip } from "./ReasoningCollapsedChip.tsx";
import { ReasoningStreamBlock } from "./ReasoningStreamBlock.tsx";
import { ToolCallEntryView } from "./toolCalls/ToolCallEntryView.tsx";
import { StreamingAssistantMessageBlock } from "./StreamingAssistantMessageBlock.tsx";
import { TurnFooter } from "./TurnFooter.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";

// ConversationTranscriptPane is the dispatch switch for every transcript
// entry kind. Each arm returns the component that matches the design for
// that entry so the pane stays a pure mapper — all rendering logic lives
// in the leaf components.
//
// The Ink version used useBoxMetrics (Ink-specific). In OpenTUI, BoxRenderable
// is an EventEmitter; we subscribe to its "layout-changed" event to read
// computed .height values when the layout settles.
export type ConversationTranscriptPaneProps = {
  conversationTranscriptEntries: ConversationTranscriptEntry[];
  hiddenTranscriptRowsAboveViewport: number;
  isFollowingNewestTranscriptRows: boolean;
  onConversationTranscriptViewportMeasured: (
    conversationTranscriptViewportMeasurements: ConversationTranscriptViewportMeasurements,
  ) => void;
  onConversationTranscriptWheelScroll?: (direction: "up" | "down") => void;
  onConversationTranscriptScrollPositionChanged?: (hiddenTranscriptRowsAboveViewport: number) => void;
};

export function ConversationTranscriptPane(props: ConversationTranscriptPaneProps) {
  const conversationTranscriptScrollBoxRef = useRef<ScrollBoxRenderable>(null!);
  const lastMeasuredConversationTranscriptViewportMeasurementsRef = useRef<
    ConversationTranscriptViewportMeasurements | undefined
  >(undefined);
  const lastReportedConversationTranscriptScrollTopRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const conversationTranscriptScrollBox = conversationTranscriptScrollBoxRef.current;
    if (!conversationTranscriptScrollBox) {
      return;
    }

    function handleLayoutChanged() {
      const visibleViewportHeightInRows = conversationTranscriptScrollBox.viewport.height;
      const fullTranscriptContentHeightInRows = conversationTranscriptScrollBox.scrollHeight;
      const targetScrollTop = props.isFollowingNewestTranscriptRows
        ? Math.max(0, fullTranscriptContentHeightInRows - visibleViewportHeightInRows)
        : props.hiddenTranscriptRowsAboveViewport;

      if (conversationTranscriptScrollBox.scrollTop !== targetScrollTop) {
        conversationTranscriptScrollBox.scrollTop = targetScrollTop;
      }

      if (visibleViewportHeightInRows > 0 || fullTranscriptContentHeightInRows > 0) {
        const nextConversationTranscriptViewportMeasurements = {
          visibleViewportHeightInRows,
          fullTranscriptContentHeightInRows,
        };
        if (
          lastMeasuredConversationTranscriptViewportMeasurementsRef.current?.visibleViewportHeightInRows ===
            nextConversationTranscriptViewportMeasurements.visibleViewportHeightInRows &&
          lastMeasuredConversationTranscriptViewportMeasurementsRef.current?.fullTranscriptContentHeightInRows ===
            nextConversationTranscriptViewportMeasurements.fullTranscriptContentHeightInRows
        ) {
          return;
        }

        lastMeasuredConversationTranscriptViewportMeasurementsRef.current = nextConversationTranscriptViewportMeasurements;
        props.onConversationTranscriptViewportMeasured(nextConversationTranscriptViewportMeasurements);
      }
    }

    conversationTranscriptScrollBox.on("layout-changed", handleLayoutChanged);
    conversationTranscriptScrollBox.content.on("layout-changed", handleLayoutChanged);
    handleLayoutChanged();

    return () => {
      conversationTranscriptScrollBox.off("layout-changed", handleLayoutChanged);
      conversationTranscriptScrollBox.content.off("layout-changed", handleLayoutChanged);
    };
  }, [
    props.hiddenTranscriptRowsAboveViewport,
    props.isFollowingNewestTranscriptRows,
    props.onConversationTranscriptViewportMeasured,
    props.conversationTranscriptEntries.length,
  ]);

  if (props.conversationTranscriptEntries.length === 0) {
    return <scrollbox flexGrow={1} ref={conversationTranscriptScrollBoxRef} />;
  }

  return (
    <scrollbox
      flexDirection="column"
      flexGrow={1}
      onMouseScroll={(mouseEvent) => {
        const scrollDirection = mouseEvent.scroll?.direction;
        if (scrollDirection !== "up" && scrollDirection !== "down") {
          return;
        }

        mouseEvent.stopPropagation();
        props.onConversationTranscriptWheelScroll?.(scrollDirection);
        queueMicrotask(() => {
          const conversationTranscriptScrollBox = conversationTranscriptScrollBoxRef.current;
          if (!conversationTranscriptScrollBox) {
            return;
          }
          if (lastReportedConversationTranscriptScrollTopRef.current === conversationTranscriptScrollBox.scrollTop) {
            return;
          }

          lastReportedConversationTranscriptScrollTopRef.current = conversationTranscriptScrollBox.scrollTop;
          props.onConversationTranscriptScrollPositionChanged?.(conversationTranscriptScrollBox.scrollTop);
        });
      }}
      ref={conversationTranscriptScrollBoxRef}
    >
      {props.conversationTranscriptEntries.map((conversationTranscriptEntry, index) => (
        <box
          flexDirection="column"
          key={`transcript-entry-${index}`}
          marginTop={index === 0 ? 0 : 1}
          width="100%"
        >
          <ConversationTranscriptEntryView conversationTranscriptEntry={conversationTranscriptEntry} />
        </box>
      ))}
    </scrollbox>
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

  if (conversationTranscriptEntry.kind === "denied_tool_call") {
    return (
      <ToolCallEntryView
        renderState="failed"
        toolCallDetail={conversationTranscriptEntry.toolCallDetail}
        errorText={conversationTranscriptEntry.denialText}
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

  if (conversationTranscriptEntry.kind === "streaming_assistant_message") {
    return (
      <StreamingAssistantMessageBlock
        renderState={conversationTranscriptEntry.renderState}
        streamingProjection={conversationTranscriptEntry.streamingProjection}
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
      assistantContentParts={conversationTranscriptEntry.message.assistantContentParts ?? []}
    />
  );
});
