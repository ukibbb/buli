import { Box, Text, type DOMElement, useBoxMetrics } from "ink";
import React, { useEffect, useRef } from "react";
import type { ConversationTranscriptEntry } from "../chatScreenState.ts";
import { chatScreenTheme } from "../chatScreenTheme.ts";
import type { ConversationTranscriptViewportMeasurements } from "../conversationTranscriptViewportState.ts";

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
    return (
      <Box alignItems="center" flexGrow={1} justifyContent="center" ref={conversationTranscriptViewportFrameRef}>
        <Text color={chatScreenTheme.mutedTextColor}>No messages yet.</Text>
      </Box>
    );
  }

  const conversationTranscriptMessageBlocks = props.conversationTranscriptEntries.map((conversationTranscriptEntry, index) => {
    if (conversationTranscriptEntry.kind === "error") {
      return (
        <Box
          borderColor={chatScreenTheme.errorColor}
          borderStyle={chatScreenTheme.borderStyle}
          flexDirection="column"
          key={`error-${index}`}
          marginTop={index === 0 ? 0 : 1}
          paddingX={1}
        >
          <Text bold color={chatScreenTheme.errorColor}>
            Error
          </Text>
          <Text color={chatScreenTheme.primaryTextColor}>{conversationTranscriptEntry.text}</Text>
        </Box>
      );
    }

    // Reasoning summary entries are rendered inline but are not yet wired to
    // dedicated components — that happens in Task 16. For now, render
    // a minimal placeholder so the transcript stays coherent during the stream.
    if (conversationTranscriptEntry.kind === "streaming_reasoning_summary") {
      return (
        <Box
          flexDirection="column"
          key={`streaming-reasoning-${conversationTranscriptEntry.reasoningSummaryId}`}
          marginTop={index === 0 ? 0 : 1}
          paddingX={1}
        >
          <Text color={chatScreenTheme.mutedTextColor}>
            Thinking... {conversationTranscriptEntry.reasoningSummaryText}
          </Text>
        </Box>
      );
    }

    if (conversationTranscriptEntry.kind === "completed_reasoning_summary") {
      return (
        <Box
          flexDirection="column"
          key={`completed-reasoning-${conversationTranscriptEntry.reasoningSummaryId}`}
          marginTop={index === 0 ? 0 : 1}
          paddingX={1}
        >
          <Text color={chatScreenTheme.mutedTextColor}>
            Thought for {conversationTranscriptEntry.reasoningDurationMs}ms
          </Text>
        </Box>
      );
    }

    const speakerLabel = conversationTranscriptEntry.message.role === "user" ? "You" : "Assistant";
    const messageAccentColor =
      conversationTranscriptEntry.message.role === "user"
        ? chatScreenTheme.userMessageAccentColor
        : chatScreenTheme.assistantMessageAccentColor;

    return (
      <Box
        borderColor={messageAccentColor}
        borderStyle={chatScreenTheme.borderStyle}
        flexDirection="column"
        key={conversationTranscriptEntry.message.id}
        marginTop={index === 0 ? 0 : 1}
        paddingX={1}
      >
        <Text bold color={messageAccentColor}>
          {speakerLabel}
        </Text>
        <Text color={chatScreenTheme.primaryTextColor}>{conversationTranscriptEntry.message.text}</Text>
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
