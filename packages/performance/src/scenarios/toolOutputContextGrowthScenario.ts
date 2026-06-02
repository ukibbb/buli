import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationSessionEntry, ModelContextItem, OpenAiProviderTurnReplayInputItem } from "@buli/contracts";
import {
  prepareConversationEntriesForCompactionRequest,
  projectConversationSessionEntriesToModelContextItems,
  buildProviderVisibleToolResultBudgetGateText,
  READ_ONLY_PROVIDER_TOOL_RESULT_MAX_CHARACTER_COUNT,
  runGrepToolCall,
  runReadToolCall,
} from "@buli/engine";
import {
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT,
  createOpenAiResponsesInputItems,
  type OpenAiConversationInputItem,
} from "@buli/openai";
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
    const batchToolOutputWorkspacePath = await createBatchToolOutputWorkspace(input);
    const heapUsedBeforeScenario = process.memoryUsage().heapUsed;
    const modelContextProjection = await measureDurationMs(() =>
      projectConversationSessionEntriesToModelContextItems(conversationSessionEntries)
    );
    const openAiRequestProjection = await measureDurationMs(() =>
      createOpenAiResponsesInputItems(conversationSessionEntries)
    );
    const compactionProjection = await measureDurationMs(() =>
      prepareConversationEntriesForCompactionRequest({ conversationSessionEntries })
    );
    const readToolCall = await measureDurationMs(() => runReadToolCall({
      readToolCallRequest: {
        toolName: "read",
        readTargetPath: "large-read.txt",
        maximumLineCount: 600,
      },
      workspaceRootPath: batchToolOutputWorkspacePath,
    }));
    const budgetedGrepToolCall = await measureDurationMs(() => runGrepToolCall({
      grepToolCallRequest: {
        toolName: "grep",
        regexPattern: "marker",
        searchPath: "large-search.txt",
      },
      workspaceRootPath: batchToolOutputWorkspacePath,
    }));
    const providerVisibleReadToolResultText = createProviderVisiblePerformanceToolResultText({
      toolName: "read",
      toolResultText: readToolCall.measuredValue.toolResultText,
      guidanceLines: ["Retry with smaller offsetLineNumber/maximumLineCount windows."],
    });
    const providerVisibleGrepToolResultText = createProviderVisiblePerformanceToolResultText({
      toolName: "grep",
      toolResultText: budgetedGrepToolCall.measuredValue.toolResultText,
      guidanceLines: ["Narrow searchPath, regexPattern, includeGlobPattern, or contextLineCount before retrying."],
    });
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
          metricName: "tool_output_context_growth.openai_request_projection.duration_ms",
          durationMs: openAiRequestProjection.durationMs,
          budget: { warnAbove: 25, failAbove: 100 },
        }),
        createDurationMetric({
          metricName: "tool_output_context_growth.read.duration_ms",
          durationMs: readToolCall.durationMs,
          budget: { warnAbove: 50, failAbove: 200 },
        }),
        createDurationMetric({
          metricName: "tool_output_context_growth.grep.duration_ms",
          durationMs: budgetedGrepToolCall.durationMs,
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
          metricName: "tool_output_context_growth.openai_projected_function_call_output_bytes",
          bytes: sumOpenAiProjectedFunctionCallOutputLength(openAiRequestProjection.measuredValue),
          budget: {
            warnAbove: OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT,
            failAbove: OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT + 2_048,
          },
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.read_tool_result_text_bytes",
          bytes: readToolCall.measuredValue.toolResultText.length,
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.provider_visible_read_tool_result_text_bytes",
          bytes: providerVisibleReadToolResultText.length,
          budget: { warnAbove: 32_000, failAbove: 34_000 },
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.grep_tool_result_text_bytes",
          bytes: budgetedGrepToolCall.measuredValue.toolResultText.length,
        }),
        createBytesMetric({
          metricName: "tool_output_context_growth.provider_visible_grep_tool_result_text_bytes",
          bytes: providerVisibleGrepToolResultText.length,
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

async function createBatchToolOutputWorkspace(input: {
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
    Array.from({ length: 600 }, (_value, lineIndex) => `marker-${lineIndex + 1} ${"grep-output ".repeat(8)}`).join("\n"),
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
    const toolCallRequest = toolCallIndex % 2 === 0
      ? {
          toolName: "bash" as const,
          shellCommand: `printf 'large output ${toolCallIndex}'`,
          commandDescription: "Generate large output",
        }
      : {
          toolName: "read" as const,
          readTargetPath: `large-output-${toolCallIndex}.txt`,
        };
    const toolCallDetail = toolCallRequest.toolName === "bash"
      ? {
          toolName: "bash" as const,
          commandLine: toolCallRequest.shellCommand,
          commandDescription: toolCallRequest.commandDescription,
          exitCode: 0,
        }
      : {
          toolName: "read" as const,
          readFilePath: toolCallRequest.readTargetPath,
        };
    conversationSessionEntries.push(
      {
        entryKind: "tool_call",
        toolCallId,
        toolCallRequest,
      },
      {
        entryKind: "completed_tool_result",
        toolCallId,
        toolCallDetail,
        toolResultText,
      },
    );
    providerReplayInputItems.push(
      {
        type: "function_call",
        id: `fc_${toolCallIndex}`,
        call_id: toolCallId,
        name: toolCallRequest.toolName,
        arguments: JSON.stringify(toolCallRequest),
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

function createProviderVisiblePerformanceToolResultText(input: {
  toolName: "read" | "grep";
  toolResultText: string;
  guidanceLines: readonly string[];
}): string {
  return buildProviderVisibleToolResultBudgetGateText({
    toolName: input.toolName,
    sourceText: input.toolResultText,
    maximumCharacterCount: READ_ONLY_PROVIDER_TOOL_RESULT_MAX_CHARACTER_COUNT,
    metadataLines: [
      "scenario: tool-output-context-growth",
      `canonical_tool_result_character_count: ${input.toolResultText.length}`,
    ],
    guidanceLines: input.guidanceLines,
    rawEvidenceStorage: "canonical_tool_result_text_stored",
  });
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

function sumOpenAiProjectedFunctionCallOutputLength(openAiInputItems: readonly OpenAiConversationInputItem[]): number {
  return openAiInputItems.reduce(
    (totalOutputLength, openAiInputItem) =>
      "type" in openAiInputItem && openAiInputItem.type === "function_call_output"
        ? totalOutputLength + openAiInputItem.output.length
        : totalOutputLength,
    0,
  );
}
