import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationSessionEntry, ModelContextItem, OpenAiProviderTurnReplayInputItem } from "@buli/contracts";
import {
  prepareConversationEntriesForCompactionRequest,
  projectConversationSessionEntriesToModelContextItems,
  runReadManyToolCall,
  runSearchManyToolCall,
} from "@buli/engine";
import {
  createBytesMetric,
  createCountMetric,
  createDurationMetric,
  measureDurationMs,
  type PerformanceScenario,
} from "../model/performanceScenario.ts";

const syntheticToolCallCount = 40;
const syntheticToolResultTextLength = 16_384;

export const toolOutputContextGrowthScenario: PerformanceScenario = {
  scenarioName: "tool-output-context-growth",
  description: "Measures model-context projection and compaction projection pressure from large tool outputs and provider replay.",
  defaultWarmupCount: 1,
  defaultRepeatCount: 5,
  async runIteration(input) {
    const conversationSessionEntries = createToolOutputHeavyConversationSessionEntries();
    const budgetedBatchToolOutputWorkspacePath = await createBudgetedBatchToolOutputWorkspace(input);
    const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
    const modelContextProjection = await measureDurationMs(() =>
      projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)
    );
    const compactionProjection = await measureDurationMs(() =>
      prepareConversationEntriesForCompactionRequest({ conversationSessionEntries })
    );
    const budgetedReadManyToolCall = await measureDurationMs(() => runReadManyToolCall({
      readManyToolCallRequest: {
        toolName: "read_many",
        readTargets: [{ readTargetPath: "large-read.txt", maximumLineCount: 800 }],
      },
      workspaceRootPath: budgetedBatchToolOutputWorkspacePath,
      readOnlyToolCallConcurrencyLimiter: immediateReadOnlyToolCallConcurrencyLimiter,
    }));
    const budgetedSearchManyToolCall = await measureDurationMs(() => runSearchManyToolCall({
      searchManyToolCallRequest: {
        toolName: "search_many",
        searches: [{ searchKind: "grep", regexPattern: "marker", searchPath: "large-search.txt" }],
      },
      workspaceRootPath: budgetedBatchToolOutputWorkspacePath,
      readOnlyToolCallConcurrencyLimiter: immediateReadOnlyToolCallConcurrencyLimiter,
    }));
    const heapUsedAfterScenario = process.memoryUsage().heapUsed;

    return {
      iterationLabel: `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
      metrics: [
        createDurationMetric({
          metricName: "tool_output_context_growth.model_context_projection.duration_ms",
          durationMs: modelContextProjection.durationMs,
          budget: { warnAbove: 25, failAbove: 100 },
        }),
        createDurationMetric({
          metricName: "tool_output_context_growth.compaction_projection.duration_ms",
          durationMs: compactionProjection.durationMs,
          budget: { warnAbove: 50, failAbove: 200 },
        }),
        createDurationMetric({
          metricName: "tool_output_context_growth.budgeted_read_many.duration_ms",
          durationMs: budgetedReadManyToolCall.durationMs,
          budget: { warnAbove: 50, failAbove: 200 },
        }),
        createDurationMetric({
          metricName: "tool_output_context_growth.budgeted_search_many.duration_ms",
          durationMs: budgetedSearchManyToolCall.durationMs,
          budget: { warnAbove: 100, failAbove: 400 },
        }),
        createCountMetric({
          metricName: "tool_output_context_growth.tool_call_count",
          count: syntheticToolCallCount,
          lowerIsBetter: false,
        }),
        createCountMetric({
          metricName: "tool_output_context_growth.model_context_item_count",
          count: modelContextProjection.measuredValue.length,
          lowerIsBetter: false,
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.tool_result_text_bytes",
          bytes: sumToolResultTextLength(conversationSessionEntries),
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.model_context_tool_result_text_bytes",
          bytes: sumModelContextToolResultTextLength(modelContextProjection.measuredValue),
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.provider_replay_output_bytes",
          bytes: sumProviderReplayFunctionCallOutputLength(conversationSessionEntries),
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.budgeted_read_many_tool_result_text_bytes",
          bytes: budgetedReadManyToolCall.measuredValue.toolResultText.length,
          budget: { warnAbove: 32_000, failAbove: 34_000 },
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.budgeted_search_many_tool_result_text_bytes",
          bytes: budgetedSearchManyToolCall.measuredValue.toolResultText.length,
          budget: { warnAbove: 32_000, failAbove: 34_000 },
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.serialized_session_bytes",
          bytes: JSON.stringify(conversationSessionEntries).length,
        }),
        createCountMetric({
          metricName: "tool_output_context_growth.compaction_projected_character_count",
          count: compactionProjection.measuredValue.projectedCharacterCount,
        }),
        createCountMetric({
          metricName: "tool_output_context_growth.compaction_truncated_tool_result_count",
          count: compactionProjection.measuredValue.truncatedToolResultCount,
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.heap_used_delta_bytes",
          bytes: Math.max(0, heapUsedAfterScenario - heapUsedBeforeScenario),
          budget: { warnAbove: 12_000_000, failAbove: 32_000_000 },
        }),
      ],
    };
  },
};

const immediateReadOnlyToolCallConcurrencyLimiter = {
  run<ReadOnlyToolCallResult>(runReadOnlyToolCall: () => Promise<ReadOnlyToolCallResult>): Promise<ReadOnlyToolCallResult> {
    return runReadOnlyToolCall();
  },
};

async function createBudgetedBatchToolOutputWorkspace(input: {
  runOutputDirectoryPath: string;
  iterationIndex: number;
  isWarmup: boolean;
}): Promise<string> {
  const workspacePath = join(
    input.runOutputDirectoryPath,
    "tool-output-context-growth",
    `${input.isWarmup ? "warmup" : "repeat"}-${input.iterationIndex}`,
  );
  await mkdir(workspacePath, { recursive: true });
  await writeFile(
    join(workspacePath, "large-read.txt"),
    Array.from({ length: 800 }, (_value, lineIndex) => `${lineIndex + 1}: ${"read-many-output ".repeat(8)}`).join("\n"),
    "utf8",
  );
  await writeFile(
    join(workspacePath, "large-search.txt"),
    Array.from({ length: 600 }, (_value, lineIndex) => `marker-${lineIndex + 1} ${"search-many-output ".repeat(8)}`).join("\n"),
    "utf8",
  );
  return workspacePath;
}

function createToolOutputHeavyConversationSessionEntries(): readonly ConversationSessionEntry[] {
  const conversationSessionEntries: ConversationSessionEntry[] = [
    {
      entryKind: "user_prompt",
      promptText: "Inspect a large generated repository and summarize findings.",
      modelFacingPromptText: "Inspect a large generated repository and summarize findings.",
    },
  ];
  const providerReplayInputItems: OpenAiProviderTurnReplayInputItem[] = [];

  for (let toolCallIndex = 0; toolCallIndex < syntheticToolCallCount; toolCallIndex += 1) {
    const toolCallId = `call_large_${toolCallIndex}`;
    const toolResultText = createSyntheticToolResultText(toolCallIndex);
    conversationSessionEntries.push(
      {
        entryKind: "tool_call",
        toolCallId,
        toolCallRequest: {
          toolName: "bash",
          shellCommand: `printf 'large output ${toolCallIndex}'`,
          commandDescription: "Generate large output",
        },
      },
      {
        entryKind: "completed_tool_result",
        toolCallId,
        toolCallDetail: {
          toolName: "bash",
          commandLine: `printf 'large output ${toolCallIndex}'`,
          commandDescription: "Generate large output",
          exitCode: 0,
        },
        toolResultText,
      },
    );
    providerReplayInputItems.push(
      {
        type: "function_call",
        id: `fc_${toolCallIndex}`,
        call_id: toolCallId,
        name: "bash",
        arguments: JSON.stringify({ shellCommand: `printf 'large output ${toolCallIndex}'` }),
      },
      {
        type: "function_call_output",
        call_id: toolCallId,
        output: toolResultText,
      },
    );
  }

  conversationSessionEntries.push({
    entryKind: "assistant_message",
    assistantMessageStatus: "completed",
    assistantMessageText: "Completed large-output inspection.",
    providerTurnReplay: {
      provider: "openai",
      inputItems: providerReplayInputItems,
    },
  });

  return conversationSessionEntries;
}

function createSyntheticToolResultText(toolCallIndex: number): string {
  const lineText = `tool ${toolCallIndex.toString().padStart(2, "0")} result ${"x".repeat(120)}\n`;
  return lineText.repeat(Math.ceil(syntheticToolResultTextLength / lineText.length)).slice(0, syntheticToolResultTextLength);
}

function sumToolResultTextLength(conversationSessionEntries: readonly ConversationSessionEntry[]): number {
  return conversationSessionEntries.reduce((totalTextLength, conversationSessionEntry) => {
    if (
      conversationSessionEntry.entryKind !== "completed_tool_result" &&
      conversationSessionEntry.entryKind !== "failed_tool_result" &&
      conversationSessionEntry.entryKind !== "denied_tool_result"
    ) {
      return totalTextLength;
    }

    return totalTextLength + conversationSessionEntry.toolResultText.length;
  }, 0);
}

function sumModelContextToolResultTextLength(modelContextItems: readonly ModelContextItem[]): number {
  return modelContextItems.reduce(
    (totalTextLength, modelContextItem) =>
      modelContextItem.itemKind === "tool_result" ? totalTextLength + modelContextItem.toolResultText.length : totalTextLength,
    0,
  );
}

function sumProviderReplayFunctionCallOutputLength(conversationSessionEntries: readonly ConversationSessionEntry[]): number {
  return conversationSessionEntries.reduce((totalOutputLength, conversationSessionEntry) => {
    if (conversationSessionEntry.entryKind !== "assistant_message" || conversationSessionEntry.providerTurnReplay?.provider !== "openai") {
      return totalOutputLength;
    }

    return totalOutputLength + conversationSessionEntry.providerTurnReplay.inputItems.reduce(
      (assistantMessageOutputLength, inputItem) =>
        inputItem.type === "function_call_output"
          ? assistantMessageOutputLength + inputItem.output.length
          : assistantMessageOutputLength,
      0,
    );
  }, 0);
}
