import { Box, Text, type DOMElement, useBoxMetrics } from "ink";
import React, { useEffect, useRef } from "react";
import type { ConversationTranscriptEntry } from "../chatScreenState.ts";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import type { ConversationTranscriptViewportMeasurements } from "../conversationTranscriptViewportState.ts";
import { ReasoningCollapsedChip } from "./ReasoningCollapsedChip.tsx";
import { ReasoningStreamBlock } from "./ReasoningStreamBlock.tsx";
import { UserPromptBlock } from "./UserPromptBlock.tsx";

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

  const conversationTranscriptMessageBlocks = props.conversationTranscriptEntries.map((conversationTranscriptEntry, index) => {
    const topMargin = index === 0 ? 0 : 1;

    if (conversationTranscriptEntry.kind === "error") {
      return (
        <Box
          borderColor={chatScreenTheme.accentRed}
          borderStyle="round"
          flexDirection="column"
          key={`error-${index}`}
          marginTop={topMargin}
          paddingX={1}
        >
          <Text bold color={chatScreenTheme.accentRed}>
            Error
          </Text>
          <Text color={chatScreenTheme.textPrimary}>{conversationTranscriptEntry.text}</Text>
        </Box>
      );
    }

    if (conversationTranscriptEntry.kind === "streaming_reasoning_summary") {
      return (
        <Box key={conversationTranscriptEntry.reasoningSummaryId} marginTop={topMargin}>
          <ReasoningStreamBlock
            reasoningSummaryText={conversationTranscriptEntry.reasoningSummaryText}
            reasoningStartedAtMs={conversationTranscriptEntry.reasoningStartedAtMs}
          />
        </Box>
      );
    }

    if (conversationTranscriptEntry.kind === "completed_reasoning_summary") {
      return (
        <Box key={conversationTranscriptEntry.reasoningSummaryId} marginTop={topMargin}>
          <ReasoningCollapsedChip
            reasoningDurationMs={conversationTranscriptEntry.reasoningDurationMs}
            reasoningTokenCount={conversationTranscriptEntry.reasoningTokenCount}
          />
        </Box>
      );
    }

    // From here on, conversationTranscriptEntry.kind === "message"
    if (conversationTranscriptEntry.message.role === "user") {
      return (
        <Box key={conversationTranscriptEntry.message.id} marginTop={topMargin}>
          <UserPromptBlock promptText={conversationTranscriptEntry.message.text} />
        </Box>
      );
    }

    return (
      <Box
        borderColor={chatScreenTheme.accentGreen}
        borderStyle="round"
        flexDirection="column"
        key={conversationTranscriptEntry.message.id}
        marginTop={topMargin}
        paddingX={1}
      >
        <Text bold color={chatScreenTheme.accentGreen}>
          // agent · response
        </Text>
        <Text color={chatScreenTheme.textPrimary}>{conversationTranscriptEntry.message.text}</Text>
      </Box>
    );
  });

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
        {conversationTranscriptMessageBlocks}
      </Box>
    </Box>
  );
}
