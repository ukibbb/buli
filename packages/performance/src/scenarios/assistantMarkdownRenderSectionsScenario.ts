import {
  buildStableAssistantMarkdownRenderSections,
  type AssistantMarkdownRenderSection,
  type AssistantMarkdownRenderSectionBuildResult,
} from "../../../tui/src/components/primitives/assistantMarkdownRenderSections.ts";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

export type AssistantMarkdownRenderSectionsScenarioOptions = Readonly<{
  stableBlockCount: number;
  streamingFragmentCount: number;
}>;

type AssistantMarkdownRenderSectionsFixture = Readonly<{
  completedMarkdownText: string;
  streamingMarkdownPrefix: string;
  streamingTailFragments: readonly string[];
}>;

type AssistantMarkdownStreamingUpdateMeasurement = Readonly<{
  durationMs: number;
  renderSectionBuildResult: AssistantMarkdownRenderSectionBuildResult;
}>;

const defaultAssistantMarkdownRenderSectionsScenarioOptions = {
  stableBlockCount: 80,
  streamingFragmentCount: 64,
} as const satisfies AssistantMarkdownRenderSectionsScenarioOptions;

export const assistantMarkdownRenderSectionsScenario = createAssistantMarkdownRenderSectionsScenario();

export function createAssistantMarkdownRenderSectionsScenario(
  options: Partial<AssistantMarkdownRenderSectionsScenarioOptions> = {},
): PerformanceScenario {
  const scenarioOptions = normalizeAssistantMarkdownRenderSectionsScenarioOptions(options);

  return {
    scenarioName: "assistant-markdown-render-sections",
    description: "Measures cold assistant markdown section builds, append-only streaming updates, completion promotion, reference reuse, and heap growth.",
    defaultWarmupCount: 1,
    defaultRepeatCount: 8,
    async runIteration(input) {
      const markdownFixture = createAssistantMarkdownRenderSectionsFixture(scenarioOptions);
      const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
      const coldBuild = await measureDurationMs(() =>
        buildStableAssistantMarkdownRenderSections({
          markdownText: markdownFixture.completedMarkdownText,
          isStreaming: false,
          previousCache: undefined,
        })
      );
      const firstStreamingBuild = await measureDurationMs(() =>
        buildStableAssistantMarkdownRenderSections({
          markdownText: createStreamingAssistantMarkdownText({
            streamingMarkdownPrefix: markdownFixture.streamingMarkdownPrefix,
            streamingTailFragments: markdownFixture.streamingTailFragments,
            visibleFragmentCount: 1,
          }),
          isStreaming: true,
          previousCache: undefined,
        })
      );
      const streamingUpdateMeasurements = await measureAppendOnlyAssistantMarkdownStreamingUpdates({
        markdownFixture,
        firstStreamingBuildResult: firstStreamingBuild.measuredValue,
      });
      const finalStreamingBuildResult = streamingUpdateMeasurements.at(-1)?.renderSectionBuildResult ?? firstStreamingBuild.measuredValue;
      const completionPromotion = await measureDurationMs(() =>
        buildStableAssistantMarkdownRenderSections({
          markdownText: markdownFixture.completedMarkdownText,
          isStreaming: false,
          previousCache: finalStreamingBuildResult.nextCache,
        })
      );
      const heapUsedAfterScenario = process.memoryUsage().heapUsed;
      const streamingUpdateDurationsMs = streamingUpdateMeasurements.map((streamingUpdateMeasurement) =>
        streamingUpdateMeasurement.durationMs
      );

      return {
        iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
        metrics: [
          createDurationMetric({
            metricName: "assistant_markdown_render_sections.cold_build.duration_ms",
            durationMs: coldBuild.durationMs,
            budget: { warnAbove: 20, failAbove: 80 },
          }),
          createDurationMetric({
            metricName: "assistant_markdown_render_sections.initial_streaming_build.duration_ms",
            durationMs: firstStreamingBuild.durationMs,
            budget: { warnAbove: 15, failAbove: 60 },
          }),
          createDurationMetric({
            metricName: "assistant_markdown_render_sections.streaming_updates.p95_duration_ms",
            durationMs: readPercentileDurationMs(streamingUpdateDurationsMs, 95),
            budget: { warnAbove: 5, failAbove: 20 },
          }),
          createDurationMetric({
            metricName: "assistant_markdown_render_sections.streaming_updates.max_duration_ms",
            durationMs: readMaxDurationMs(streamingUpdateDurationsMs),
            budget: { warnAbove: 10, failAbove: 40 },
          }),
          createDurationMetric({
            metricName: "assistant_markdown_render_sections.completion_promotion.duration_ms",
            durationMs: completionPromotion.durationMs,
            budget: { warnAbove: 20, failAbove: 80 },
          }),
          createCountMetric({
            metricName: "assistant_markdown_render_sections.streaming_updates.count",
            count: streamingUpdateMeasurements.length,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "assistant_markdown_render_sections.stable_section_reference_reuse_count",
            count: countStreamingStableSectionReferenceReuse({
              firstStreamingBuildResult: firstStreamingBuild.measuredValue,
              streamingUpdateMeasurements,
            }),
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "assistant_markdown_render_sections.streaming_tail_section_count",
            count: countStreamingTailSections([firstStreamingBuild.measuredValue, ...streamingUpdateMeasurements.map((streamingUpdateMeasurement) =>
              streamingUpdateMeasurement.renderSectionBuildResult
            )]),
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "assistant_markdown_render_sections.cold_build.section_count",
            count: coldBuild.measuredValue.renderSections.length,
            lowerIsBetter: false,
          }),
          createCountMetric({
            metricName: "assistant_markdown_render_sections.completion.section_count",
            count: completionPromotion.measuredValue.renderSections.length,
            lowerIsBetter: false,
          }),
          createBytesMetric({
            metricName: "assistant_markdown_render_sections.markdown_input_bytes",
            bytes: markdownFixture.completedMarkdownText.length,
            lowerIsBetter: false,
          }),
          createBytesMetric({
            metricName: "assistant_markdown_render_sections.heap_used_delta_bytes",
            bytes: Math.max(0, heapUsedAfterScenario - heapUsedBeforeScenario),
            budget: { warnAbove: 8_000_000, failAbove: 32_000_000 },
          }),
        ],
      };
    },
  };
}

function normalizeAssistantMarkdownRenderSectionsScenarioOptions(
  options: Partial<AssistantMarkdownRenderSectionsScenarioOptions>,
): AssistantMarkdownRenderSectionsScenarioOptions {
  return {
    stableBlockCount: Math.max(1, options.stableBlockCount ?? defaultAssistantMarkdownRenderSectionsScenarioOptions.stableBlockCount),
    streamingFragmentCount: Math.max(2, options.streamingFragmentCount ?? defaultAssistantMarkdownRenderSectionsScenarioOptions.streamingFragmentCount),
  };
}

async function measureAppendOnlyAssistantMarkdownStreamingUpdates(input: {
  markdownFixture: AssistantMarkdownRenderSectionsFixture;
  firstStreamingBuildResult: AssistantMarkdownRenderSectionBuildResult;
}): Promise<readonly AssistantMarkdownStreamingUpdateMeasurement[]> {
  const streamingUpdateMeasurements: AssistantMarkdownStreamingUpdateMeasurement[] = [];
  let previousBuildResult = input.firstStreamingBuildResult;

  for (let fragmentCount = 2; fragmentCount <= input.markdownFixture.streamingTailFragments.length; fragmentCount += 1) {
    const streamingUpdate = await measureDurationMs(() =>
      buildStableAssistantMarkdownRenderSections({
        markdownText: createStreamingAssistantMarkdownText({
          streamingMarkdownPrefix: input.markdownFixture.streamingMarkdownPrefix,
          streamingTailFragments: input.markdownFixture.streamingTailFragments,
          visibleFragmentCount: fragmentCount,
        }),
        isStreaming: true,
        previousCache: previousBuildResult.nextCache,
      })
    );
    streamingUpdateMeasurements.push({
      durationMs: streamingUpdate.durationMs,
      renderSectionBuildResult: streamingUpdate.measuredValue,
    });
    previousBuildResult = streamingUpdate.measuredValue;
  }

  return streamingUpdateMeasurements;
}

function createAssistantMarkdownRenderSectionsFixture(
  options: AssistantMarkdownRenderSectionsScenarioOptions,
): AssistantMarkdownRenderSectionsFixture {
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

function countStreamingStableSectionReferenceReuse(input: {
  firstStreamingBuildResult: AssistantMarkdownRenderSectionBuildResult;
  streamingUpdateMeasurements: readonly AssistantMarkdownStreamingUpdateMeasurement[];
}): number {
  return input.streamingUpdateMeasurements.reduce(
    (reusedSectionCount, streamingUpdateMeasurement, streamingUpdateIndex) => {
      const previousRenderSections = streamingUpdateIndex === 0
        ? input.firstStreamingBuildResult.renderSections
        : input.streamingUpdateMeasurements[streamingUpdateIndex - 1]?.renderSectionBuildResult.renderSections ?? [];
      return reusedSectionCount + countStableSectionReferenceReuse({
        previousRenderSections,
        nextRenderSections: streamingUpdateMeasurement.renderSectionBuildResult.renderSections,
      });
    },
    0,
  );
}

function countStableSectionReferenceReuse(input: {
  previousRenderSections: readonly AssistantMarkdownRenderSection[];
  nextRenderSections: readonly AssistantMarkdownRenderSection[];
}): number {
  return input.nextRenderSections.reduce((reusedSectionCount, nextRenderSection, sectionIndex) => {
    return input.previousRenderSections[sectionIndex] === nextRenderSection ? reusedSectionCount + 1 : reusedSectionCount;
  }, 0);
}

function countStreamingTailSections(buildResults: readonly AssistantMarkdownRenderSectionBuildResult[]): number {
  return buildResults.reduce((streamingTailSectionCount, buildResult) => {
    return streamingTailSectionCount + buildResult.renderSections.filter((renderSection) => renderSection.sectionKind === "streamingTail").length;
  }, 0);
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
