import {
  createAssistantMarkdownUnifiedRenderableProbe,
  type AssistantMarkdownUnifiedRenderableProbe,
  type AssistantMarkdownUnifiedRenderableUpdateStats,
} from "../../../tui/src/performance/assistantMarkdownUnifiedRenderableProbe.ts";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

// Measures the production assistant markdown path: one OpenTUI MarkdownRenderable
// doing incremental parse + block reconciliation, with buli chrome applied through
// renderNode. `content` assignment runs that work synchronously, so the duration
// metrics capture the full per-update content cost (frame paint measured separately).
export type AssistantMarkdownUnifiedRenderableScenarioOptions = Readonly<{
  stableBlockCount: number;
  streamingFragmentCount: number;
}>;

type AssistantMarkdownStreamingFixture = Readonly<{
  completedMarkdownText: string;
  streamingMarkdownPrefix: string;
  streamingTailFragments: readonly string[];
}>;

type AssistantMarkdownUnifiedStreamingUpdateMeasurement = Readonly<{
  durationMs: number;
  updateStats: AssistantMarkdownUnifiedRenderableUpdateStats;
}>;

const defaultAssistantMarkdownUnifiedRenderableScenarioOptions = {
  stableBlockCount: 80,
  streamingFragmentCount: 64,
} as const satisfies AssistantMarkdownUnifiedRenderableScenarioOptions;

export const assistantMarkdownUnifiedRenderableScenario = createAssistantMarkdownUnifiedRenderableScenario();

export function createAssistantMarkdownUnifiedRenderableScenario(
  options: Partial<AssistantMarkdownUnifiedRenderableScenarioOptions> = {},
): PerformanceScenario {
  const scenarioOptions: AssistantMarkdownUnifiedRenderableScenarioOptions = {
    stableBlockCount: Math.max(1, options.stableBlockCount ?? defaultAssistantMarkdownUnifiedRenderableScenarioOptions.stableBlockCount),
    streamingFragmentCount: Math.max(
      2,
      options.streamingFragmentCount ?? defaultAssistantMarkdownUnifiedRenderableScenarioOptions.streamingFragmentCount,
    ),
  };

  return {
    scenarioName: "assistant-markdown-unified-renderable",
    description:
      "Measures the single-OpenTUI-MarkdownRenderable assistant markdown path: cold parse, append-only streaming updates, completion promotion, block renderable reuse, and heap growth.",
    defaultWarmupCount: 1,
    defaultRepeatCount: 8,
    async runIteration(input) {
      const markdownFixture = createAssistantMarkdownStreamingFixture(scenarioOptions);
      const unifiedRenderableProbe = await createAssistantMarkdownUnifiedRenderableProbe();

      try {
        const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
        const coldBuild = await measureDurationMs(() =>
          unifiedRenderableProbe.applyMarkdownUpdate({
            markdownText: markdownFixture.completedMarkdownText,
            isStreaming: true,
          })
        );
        unifiedRenderableProbe.resetMarkdownContent();
        const firstStreamingBuild = await measureDurationMs(() =>
          unifiedRenderableProbe.applyMarkdownUpdate({
            markdownText: createStreamingAssistantMarkdownText({
              streamingMarkdownPrefix: markdownFixture.streamingMarkdownPrefix,
              streamingTailFragments: markdownFixture.streamingTailFragments,
              visibleFragmentCount: 1,
            }),
            isStreaming: true,
          })
        );
        const streamingUpdateMeasurements = await measureAppendOnlyUnifiedStreamingUpdates({
          markdownFixture,
          unifiedRenderableProbe,
        });
        // Production keeps the renderable permanently in streaming mode (see
        // AssistantMarkdownBlock); completion is just one more content update.
        const completionPromotion = await measureDurationMs(() =>
          unifiedRenderableProbe.applyMarkdownUpdate({
            markdownText: markdownFixture.completedMarkdownText,
            isStreaming: true,
          })
        );
        const codeFenceStreaming = await measureOpenCodeFenceStreamingUpdates({
          markdownFixture,
          unifiedRenderableProbe,
          streamedCodeLineCount: scenarioOptions.streamingFragmentCount,
        });
        const finalRenderFrame = await measureDurationMs(() => unifiedRenderableProbe.renderFrame());
        const heapUsedAfterScenario = process.memoryUsage().heapUsed;
        const streamingUpdateDurationsMs = streamingUpdateMeasurements.map((streamingUpdateMeasurement) =>
          streamingUpdateMeasurement.durationMs
        );

        return {
          iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
          metrics: [
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.cold_build.duration_ms",
              durationMs: coldBuild.durationMs,
              budget: { warnAbove: 20, failAbove: 80 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.initial_streaming_build.duration_ms",
              durationMs: firstStreamingBuild.durationMs,
              budget: { warnAbove: 15, failAbove: 60 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.streaming_updates.p95_duration_ms",
              durationMs: readPercentileDurationMs(streamingUpdateDurationsMs, 95),
              budget: { warnAbove: 5, failAbove: 20 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.streaming_updates.max_duration_ms",
              durationMs: readMaxDurationMs(streamingUpdateDurationsMs),
              budget: { warnAbove: 10, failAbove: 40 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.completion_promotion.duration_ms",
              durationMs: completionPromotion.durationMs,
              budget: { warnAbove: 20, failAbove: 80 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.code_fence_streaming_updates.p95_duration_ms",
              durationMs: readPercentileDurationMs(codeFenceStreaming.updateDurationsMs, 95),
              budget: { warnAbove: 5, failAbove: 20 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.code_fence_streaming_updates.max_duration_ms",
              durationMs: readMaxDurationMs(codeFenceStreaming.updateDurationsMs),
              budget: { warnAbove: 10, failAbove: 40 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.code_fence_close.duration_ms",
              durationMs: codeFenceStreaming.closeDurationMs,
              budget: { warnAbove: 10, failAbove: 40 },
            }),
            createDurationMetric({
              metricName: "assistant_markdown_unified_renderable.final_render_frame.duration_ms",
              durationMs: finalRenderFrame.durationMs,
            }),
            createCountMetric({
              metricName: "assistant_markdown_unified_renderable.streaming_updates.count",
              count: streamingUpdateMeasurements.length,
              lowerIsBetter: false,
            }),
            createCountMetric({
              metricName: "assistant_markdown_unified_renderable.stable_block_reference_reuse_count",
              count: streamingUpdateMeasurements.reduce(
                (reusedBlockRenderableCount, streamingUpdateMeasurement) =>
                  reusedBlockRenderableCount + streamingUpdateMeasurement.updateStats.reusedBlockRenderableCount,
                0,
              ),
              lowerIsBetter: false,
            }),
            createCountMetric({
              metricName: "assistant_markdown_unified_renderable.cold_build.block_count",
              count: coldBuild.measuredValue.blockCount,
              lowerIsBetter: false,
            }),
            createCountMetric({
              metricName: "assistant_markdown_unified_renderable.completion.block_count",
              count: completionPromotion.measuredValue.blockCount,
              lowerIsBetter: false,
            }),
            createBytesMetric({
              metricName: "assistant_markdown_unified_renderable.markdown_input_bytes",
              bytes: markdownFixture.completedMarkdownText.length,
              lowerIsBetter: false,
            }),
            createBytesMetric({
              metricName: "assistant_markdown_unified_renderable.heap_used_delta_bytes",
              bytes: Math.max(0, heapUsedAfterScenario - heapUsedBeforeScenario),
              budget: { warnAbove: 8_000_000, failAbove: 32_000_000 },
            }),
          ],
        };
      } finally {
        await unifiedRenderableProbe.dispose();
      }
    },
  };
}

async function measureAppendOnlyUnifiedStreamingUpdates(input: {
  markdownFixture: AssistantMarkdownStreamingFixture;
  unifiedRenderableProbe: AssistantMarkdownUnifiedRenderableProbe;
}): Promise<readonly AssistantMarkdownUnifiedStreamingUpdateMeasurement[]> {
  const streamingUpdateMeasurements: AssistantMarkdownUnifiedStreamingUpdateMeasurement[] = [];

  for (let fragmentCount = 2; fragmentCount <= input.markdownFixture.streamingTailFragments.length; fragmentCount += 1) {
    const streamingUpdate = await measureDurationMs(() =>
      input.unifiedRenderableProbe.applyMarkdownUpdate({
        markdownText: createStreamingAssistantMarkdownText({
          streamingMarkdownPrefix: input.markdownFixture.streamingMarkdownPrefix,
          streamingTailFragments: input.markdownFixture.streamingTailFragments,
          visibleFragmentCount: fragmentCount,
        }),
        isStreaming: true,
      })
    );
    streamingUpdateMeasurements.push({
      durationMs: streamingUpdate.durationMs,
      updateStats: streamingUpdate.measuredValue,
    });
  }

  return streamingUpdateMeasurements;
}

// Streams a code fence line by line after the prose phases: the fence stays unclosed
// for the whole run (the common shape while an assistant writes code), then a final
// update appends the closing fence. Separately measured because the open trailing
// fence exercises a different reconciliation path than prose tails.
async function measureOpenCodeFenceStreamingUpdates(input: {
  markdownFixture: AssistantMarkdownStreamingFixture;
  unifiedRenderableProbe: AssistantMarkdownUnifiedRenderableProbe;
  streamedCodeLineCount: number;
}): Promise<{ updateDurationsMs: readonly number[]; closeDurationMs: number }> {
  const openCodeFencePrefix = `${input.markdownFixture.completedMarkdownText}\n\n\`\`\`ts title=packages/tui/src/streamed.ts\n`;
  const streamedCodeLines: string[] = [];
  const updateDurationsMs: number[] = [];

  for (let codeLineIndex = 0; codeLineIndex < input.streamedCodeLineCount; codeLineIndex += 1) {
    streamedCodeLines.push(`export const streamedCodeLine${codeLineIndex} = ${codeLineIndex};`);
    const openCodeFenceUpdate = await measureDurationMs(() =>
      input.unifiedRenderableProbe.applyMarkdownUpdate({
        markdownText: `${openCodeFencePrefix}${streamedCodeLines.join("\n")}`,
        isStreaming: true,
      })
    );
    updateDurationsMs.push(openCodeFenceUpdate.durationMs);
  }

  const codeFenceClose = await measureDurationMs(() =>
    input.unifiedRenderableProbe.applyMarkdownUpdate({
      markdownText: `${openCodeFencePrefix}${streamedCodeLines.join("\n")}\n\`\`\``,
      isStreaming: true,
    })
  );

  return { updateDurationsMs, closeDurationMs: codeFenceClose.durationMs };
}

function createAssistantMarkdownStreamingFixture(
  options: AssistantMarkdownUnifiedRenderableScenarioOptions,
): AssistantMarkdownStreamingFixture {
  const streamingMarkdownPrefix = Array.from(
    { length: options.stableBlockCount },
    (_value, blockIndex) => createStableAssistantMarkdownBlock(blockIndex),
  ).join("\n\n");
  const streamingTailFragments = Array.from(
    { length: options.streamingFragmentCount },
    (_value, fragmentIndex) =>
      `fragment ${fragmentIndex + 1}: keep \`packages/tui/src/markdown-${fragmentIndex + 1}.ts\` readable with **stable prose**`,
  );

  return {
    completedMarkdownText: [
      streamingMarkdownPrefix,
      streamingTailFragments.join(" "),
      "## Completed follow-up",
      "Native markdown prose should stay readable after the streaming tail is promoted.",
    ].join("\n\n"),
    streamingMarkdownPrefix,
    streamingTailFragments,
  };
}

function createStableAssistantMarkdownBlock(blockIndex: number): string {
  if (blockIndex % 8 === 0) {
    return [`# Source summary ${blockIndex}`, "Plain prose with `inline code`, **emphasis**, and a source path `packages/tui/src/view.tsx`."]
      .join("\n\n");
  }
  if (blockIndex % 8 === 1) {
    return ["- Keep OpenTUI native markdown for prose", "- Preserve custom blocks for diffs and code", "- [x] Reuse stable section objects"].join("\n");
  }
  if (blockIndex % 8 === 2) {
    return ["| Boundary | Cost |", "| --- | --- |", `| markdown ${blockIndex} | append-only parse |`, "| code fence | tree-sitter highlight |"].join("\n");
  }
  if (blockIndex % 8 === 3) {
    return ["```ts title=packages/tui/src/example.ts", `export const markdownBlock${blockIndex} = true;`, "```"].join("\n");
  }
  if (blockIndex % 8 === 4) {
    return ["```bash", "bun --filter @buli/tui test", "bun --filter @buli/tui typecheck", "```"].join("\n");
  }
  if (blockIndex % 8 === 5) {
    return ["> [!TIP]", "> Cache only after profiling proves render churn."].join("\n");
  }
  if (blockIndex % 8 === 6) {
    return ["```diff title=packages/tui/src/example.ts", "@@", "-const customParagraphs = true;", "+const nativeMarkdownProse = true;", "```"].join("\n");
  }

  return [
    "diff --git a/packages/tui/src/example.ts b/packages/tui/src/example.ts",
    "--- a/packages/tui/src/example.ts",
    "+++ b/packages/tui/src/example.ts",
    "@@ -1 +1 @@",
    "-renderCustomParagraph();",
    "+renderNativeMarkdownProse();",
  ].join("\n");
}

function createStreamingAssistantMarkdownText(input: {
  streamingMarkdownPrefix: string;
  streamingTailFragments: readonly string[];
  visibleFragmentCount: number;
}): string {
  return [input.streamingMarkdownPrefix, input.streamingTailFragments.slice(0, input.visibleFragmentCount).join(" ")].join("\n\n");
}

function readPercentileDurationMs(durationSamplesMs: readonly number[], percentile: number): number {
  if (durationSamplesMs.length === 0) {
    return 0;
  }

  const sortedDurationSamplesMs = [...durationSamplesMs].sort((firstDurationMs, secondDurationMs) => firstDurationMs - secondDurationMs);
  const percentileSampleIndex = Math.min(
    sortedDurationSamplesMs.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sortedDurationSamplesMs.length) - 1),
  );
  return sortedDurationSamplesMs[percentileSampleIndex] ?? 0;
}

function readMaxDurationMs(durationSamplesMs: readonly number[]): number {
  return durationSamplesMs.reduce((maxDurationMs, durationMs) => Math.max(maxDurationMs, durationMs), 0);
}
