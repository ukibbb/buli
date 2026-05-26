import type {
  BuliDiagnosticLogFields,
  ConversationSessionEntry,
  ModelContextItem,
  OpenAiProviderTurnReplayInputItem,
} from "@buli/contracts";
import { listModelVisibleConversationSessionEntries } from "@buli/contracts";

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

type AssistantMessageConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "assistant_message" }>;

type ToolResultSizeSummary = Readonly<{
  toolName: string;
  toolResultTextLength: number;
}>;

const topToolResultSizeCount = 5;

export function summarizeConversationHistoryResourceUsageForDiagnostics(input: {
  conversationSessionEntries: readonly ConversationSessionEntry[];
  modelContextItems: readonly ModelContextItem[];
}): BuliDiagnosticLogFields {
  const modelVisibleConversationSessionEntries = listModelVisibleConversationSessionEntries(input.conversationSessionEntries);
  const toolResultEntries = input.conversationSessionEntries.filter(isToolResultConversationSessionEntry);
  const assistantMessageEntries = input.conversationSessionEntries.filter(isAssistantMessageConversationSessionEntry);
  const topToolResultSizes = listTopToolResultSizes(toolResultEntries);
  const replaySummary = summarizeProviderTurnReplayItems(assistantMessageEntries);

  return {
    conversationSessionEntryCount: input.conversationSessionEntries.length,
    modelVisibleConversationSessionEntryCount: modelVisibleConversationSessionEntries.length,
    modelContextItemCount: input.modelContextItems.length,
    userPromptEntryCount: countEntriesByKind(input.conversationSessionEntries, "user_prompt"),
    assistantMessageEntryCount: assistantMessageEntries.length,
    assistantTextSegmentEntryCount: countEntriesByKind(input.conversationSessionEntries, "assistant_text_segment"),
    toolCallEntryCount: countEntriesByKind(input.conversationSessionEntries, "tool_call"),
    toolResultEntryCount: toolResultEntries.length,
    completedToolResultEntryCount: countEntriesByKind(input.conversationSessionEntries, "completed_tool_result"),
    failedToolResultEntryCount: countEntriesByKind(input.conversationSessionEntries, "failed_tool_result"),
    deniedToolResultEntryCount: countEntriesByKind(input.conversationSessionEntries, "denied_tool_result"),
    workspacePatchEntryCount: countEntriesByKind(input.conversationSessionEntries, "workspace_patch"),
    compactionSummaryEntryCount: countEntriesByKind(input.conversationSessionEntries, "conversation_compaction_summary"),
    totalUserPromptTextLength: sumConversationSessionEntryTextLength(input.conversationSessionEntries, "promptText"),
    totalModelFacingPromptTextLength: sumConversationSessionEntryTextLength(input.conversationSessionEntries, "modelFacingPromptText"),
    totalAssistantMessageTextLength: assistantMessageEntries.reduce(
      (totalTextLength, assistantMessageEntry) => totalTextLength + assistantMessageEntry.assistantMessageText.length,
      0,
    ),
    totalToolResultTextLength: toolResultEntries.reduce(
      (totalTextLength, toolResultEntry) => totalTextLength + toolResultEntry.toolResultText.length,
      0,
    ),
    maxToolResultTextLength: topToolResultSizes[0]?.toolResultTextLength ?? 0,
    topToolResultTextLengths: topToolResultSizes.map((toolResultSize) => toolResultSize.toolResultTextLength),
    topToolResultToolNames: topToolResultSizes.map((toolResultSize) => toolResultSize.toolName),
    modelContextUserMessageTextLength: sumModelContextItemTextLength(input.modelContextItems, "user_message"),
    modelContextAssistantMessageTextLength: sumModelContextItemTextLength(input.modelContextItems, "assistant_message"),
    modelContextToolResultTextLength: sumModelContextItemTextLength(input.modelContextItems, "tool_result"),
    modelContextCompactionSummaryTextLength: sumModelContextItemTextLength(input.modelContextItems, "compaction_summary"),
    providerTurnReplayInputItemCount: replaySummary.providerTurnReplayInputItemCount,
    providerTurnReplayFunctionCallOutputLength: replaySummary.providerTurnReplayFunctionCallOutputLength,
  };
}

function countEntriesByKind(
  conversationSessionEntries: readonly ConversationSessionEntry[],
  entryKind: ConversationSessionEntry["entryKind"],
): number {
  return conversationSessionEntries.filter((conversationSessionEntry) => conversationSessionEntry.entryKind === entryKind).length;
}

function sumConversationSessionEntryTextLength(
  conversationSessionEntries: readonly ConversationSessionEntry[],
  fieldName: "promptText" | "modelFacingPromptText",
): number {
  return conversationSessionEntries.reduce((totalTextLength, conversationSessionEntry) => {
    if (conversationSessionEntry.entryKind !== "user_prompt") {
      return totalTextLength;
    }

    return totalTextLength + conversationSessionEntry[fieldName].length;
  }, 0);
}

function sumModelContextItemTextLength(
  modelContextItems: readonly ModelContextItem[],
  itemKind: ModelContextItem["itemKind"],
): number {
  return modelContextItems.reduce((totalTextLength, modelContextItem) => {
    if (modelContextItem.itemKind !== itemKind) {
      return totalTextLength;
    }

    switch (modelContextItem.itemKind) {
      case "user_message":
      case "assistant_message":
        return totalTextLength + modelContextItem.messageText.length;
      case "tool_result":
        return totalTextLength + modelContextItem.toolResultText.length;
      case "compaction_summary":
        return totalTextLength + modelContextItem.summaryText.length;
      case "tool_call":
        return totalTextLength;
      default:
        return assertUnhandledModelContextItem(modelContextItem);
    }
  }, 0);
}

function listTopToolResultSizes(
  toolResultEntries: readonly ToolResultConversationSessionEntry[],
): readonly ToolResultSizeSummary[] {
  return toolResultEntries
    .map((toolResultEntry) => ({
      toolName: toolResultEntry.toolCallDetail.toolName,
      toolResultTextLength: toolResultEntry.toolResultText.length,
    }))
    .sort((leftToolResult, rightToolResult) => rightToolResult.toolResultTextLength - leftToolResult.toolResultTextLength)
    .slice(0, topToolResultSizeCount);
}

function summarizeProviderTurnReplayItems(
  assistantMessageEntries: readonly AssistantMessageConversationSessionEntry[],
): { providerTurnReplayInputItemCount: number; providerTurnReplayFunctionCallOutputLength: number } {
  let providerTurnReplayInputItemCount = 0;
  let providerTurnReplayFunctionCallOutputLength = 0;
  for (const assistantMessageEntry of assistantMessageEntries) {
    const providerTurnReplay = assistantMessageEntry.providerTurnReplay;
    if (providerTurnReplay?.provider !== "openai") {
      continue;
    }

    providerTurnReplayInputItemCount += providerTurnReplay.inputItems.length;
    providerTurnReplayFunctionCallOutputLength += providerTurnReplay.inputItems.reduce(
      (totalOutputLength, replayInputItem: OpenAiProviderTurnReplayInputItem) =>
        replayInputItem.type === "function_call_output" ? totalOutputLength + replayInputItem.output.length : totalOutputLength,
      0,
    );
  }

  return { providerTurnReplayInputItemCount, providerTurnReplayFunctionCallOutputLength };
}

function isToolResultConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is ToolResultConversationSessionEntry {
  return (
    conversationSessionEntry.entryKind === "completed_tool_result" ||
    conversationSessionEntry.entryKind === "failed_tool_result" ||
    conversationSessionEntry.entryKind === "denied_tool_result"
  );
}

function isAssistantMessageConversationSessionEntry(
  conversationSessionEntry: ConversationSessionEntry,
): conversationSessionEntry is AssistantMessageConversationSessionEntry {
  return conversationSessionEntry.entryKind === "assistant_message";
}

function assertUnhandledModelContextItem(unhandledModelContextItem: never): never {
  throw new Error(`Unhandled model context item: ${JSON.stringify(unhandledModelContextItem)}`);
}
