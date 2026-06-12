import { createConversationTranscriptRetentionProbe } from "../../../tui/src/performance/conversationTranscriptRetentionProbe.ts";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceMetric,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

// Measures how transcript cost grows as completed assistant messages accumulate in
// the conversation scrollbox: frame time at each transcript size plus mount cost and
// heap growth. Every message stays mounted as a live renderable today; this scenario
// is the decision input for whether virtualization or scrollback commits are needed.
export type ConversationTranscriptRetentionScenarioOptions = Readonly<{
  transcriptMessageCountSteps: readonly number[];
}>;

const defaultConversationTranscriptRetentionScenarioOptions = {
  transcriptMessageCountSteps: [10, 50, 100, 200],
} as const satisfies ConversationTranscriptRetentionScenarioOptions;

export const conversationTranscriptRetentionScenario = createConversationTranscriptRetentionScenario();

export function createConversationTranscriptRetentionScenario(
  options: Partial<ConversationTranscriptRetentionScenarioOptions> = {},
): PerformanceScenario {
  const transcriptMessageCountSteps = [
    ...(options.transcriptMessageCountSteps ?? defaultConversationTranscriptRetentionScenarioOptions.transcriptMessageCountSteps),
  ].sort((firstMessageCount, secondMessageCount) => firstMessageCount - secondMessageCount);

  return {
    scenarioName: "conversation-transcript-retention",
    description:
      "Measures frame time, mount cost, and heap growth as completed assistant markdown messages accumulate in the transcript scrollbox.",
    defaultWarmupCount: 1,
    defaultRepeatCount: 4,
    async runIteration(input) {
      const transcriptRetentionProbe = await createConversationTranscriptRetentionProbe();

      try {
        const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
        const stepMetrics: PerformanceMetric[] = [];
        let totalMountDurationMs = 0;

        for (const transcriptMessageCountStep of transcriptMessageCountSteps) {
          const messagesToMountCount = transcriptMessageCountStep - transcriptRetentionProbe.mountedMessageCount();
          if (messagesToMountCount <= 0) {
            continue;
          }

          const mountStep = await measureDurationMs(() =>
            transcriptRetentionProbe.mountCompletedMessages({
              messageMarkdownTexts: Array.from(
                { length: messagesToMountCount },
                (_value, messageIndex) =>
                  createCompletedAssistantMessageMarkdown(transcriptRetentionProbe.mountedMessageCount() + messageIndex),
              ),
            })
          );
          totalMountDurationMs += mountStep.durationMs;

          const settleFrame = await measureDurationMs(() => transcriptRetentionProbe.scrollToBottomAndRenderFrame());
          const steadyFrame = await measureDurationMs(() => transcriptRetentionProbe.scrollToBottomAndRenderFrame());
          stepMetrics.push(
            createDurationMetric({
              metricName: `conversation_transcript_retention.settle_frame_at_${transcriptMessageCountStep}_messages.duration_ms`,
              durationMs: settleFrame.durationMs,
            }),
            createDurationMetric({
              metricName: `conversation_transcript_retention.steady_frame_at_${transcriptMessageCountStep}_messages.duration_ms`,
              durationMs: steadyFrame.durationMs,
              budget: { warnAbove: 30, failAbove: 120 },
            }),
          );
        }

        const heapUsedAfterScenario = process.memoryUsage().heapUsed;

        return {
          iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
          metrics: [
            ...stepMetrics,
            createDurationMetric({
              metricName: "conversation_transcript_retention.total_mount.duration_ms",
              durationMs: totalMountDurationMs,
            }),
            createCountMetric({
              metricName: "conversation_transcript_retention.transcript_message_count",
              count: transcriptRetentionProbe.mountedMessageCount(),
              lowerIsBetter: false,
            }),
            createBytesMetric({
              metricName: "conversation_transcript_retention.heap_used_delta_bytes",
              bytes: Math.max(0, heapUsedAfterScenario - heapUsedBeforeScenario),
            }),
          ],
        };
      } finally {
        await transcriptRetentionProbe.dispose();
      }
    },
  };
}

// Mixed-shape completed message (~0.6KB): prose with inline decorations, a list, a
// code fence, and every fourth message a diff — proportions loosely matching real
// assistant replies so per-message block counts are realistic.
function createCompletedAssistantMessageMarkdown(messageIndex: number): string {
  const messageSections = [
    `## Result ${messageIndex}`,
    `Updated \`packages/tui/src/view-${messageIndex}.tsx\` with **stable prose** and a follow-up note.`,
    ["- first change applied", "- second change verified", "- [x] tests green"].join("\n"),
    ["```ts title=packages/tui/src/view-" + messageIndex + ".tsx", `export const view${messageIndex} = true;`, "```"].join("\n"),
  ];
  if (messageIndex % 4 === 0) {
    messageSections.push(
      [
        `diff --git a/packages/tui/src/view-${messageIndex}.tsx b/packages/tui/src/view-${messageIndex}.tsx`,
        `--- a/packages/tui/src/view-${messageIndex}.tsx`,
        `+++ b/packages/tui/src/view-${messageIndex}.tsx`,
        "@@ -1 +1 @@",
        "-const previous = true;",
        "+const next = true;",
      ].join("\n"),
    );
  }
  return messageSections.join("\n\n");
}
