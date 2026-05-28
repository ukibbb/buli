import type {
  AssistantMessageConversationSessionEntry,
  ConversationSessionEntry,
  OpenAiReasoningReplayItem,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
  UserPromptImageAttachment,
} from "@buli/contracts";
import { listModelVisibleConversationSessionEntries } from "@buli/contracts";
import {
  isOpenAiOutputTextContentPart,
  isOpenAiResponseObject,
  listOpenAiReasoningSummaryTextParts,
  readOpenAiResponseObjectArrayField,
  readOpenAiResponseObjectStringField,
  readOpenAiFunctionCallOutputItem,
  type OpenAiResponseObject,
} from "./openAiResponseObjects.ts";

export type OpenAiInputTextContentPart = { type: "input_text"; text: string };
export type OpenAiInputImageContentPart = { type: "input_image"; image_url: string };
export type OpenAiUserMessageContentPart = OpenAiInputTextContentPart | OpenAiInputImageContentPart;

export type OpenAiUserConversationMessageInputItem = {
  role: "user";
  content: string | OpenAiUserMessageContentPart[];
};

export type OpenAiAssistantConversationMessageInputItem = {
  role: "assistant";
  content: string;
};

export type OpenAiConversationMessageInputItem =
  | OpenAiUserConversationMessageInputItem
  | OpenAiAssistantConversationMessageInputItem;

export type OpenAiFunctionCallInputItem = Extract<OpenAiProviderTurnReplayInputItem, { type: "function_call" }>;

export type OpenAiFunctionCallOutputInputItem = Extract<OpenAiProviderTurnReplayInputItem, { type: "function_call_output" }>;

export type OpenAiReasoningInputItem = Extract<OpenAiProviderTurnReplayInputItem, { type: "reasoning" }>;

export type OpenAiConversationInputItem =
  | OpenAiConversationMessageInputItem
  | OpenAiReasoningInputItem
  | OpenAiFunctionCallInputItem
  | OpenAiFunctionCallOutputInputItem;

export type OpenAiResponseReplayItems = {
  continuationInputItems: OpenAiConversationInputItem[];
  providerTurnReplayInputItems: OpenAiProviderTurnReplayInputItem[];
};

type ToolCallConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "tool_call" }>;
type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;
type UserPromptConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "user_prompt" }>;
type ConversationCompactionSummaryConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "conversation_compaction_summary" }
>;

type HistoricalToolResultReplayMetadata = {
  toolName: string;
  toolResultEntryKind?: ToolResultConversationSessionEntry["entryKind"] | undefined;
  bashExitCode?: number | undefined;
};

type ConversationSessionTurn = {
  userPromptEntry: UserPromptConversationSessionEntry;
  entriesAfterUserPrompt: ConversationSessionEntry[];
};

export const OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT = 8_192;
export const OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT = 64 * 1024;
export const OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT =
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT;
export const OPENAI_HISTORICAL_REPLAY_SUCCESSFUL_BASH_OUTPUT_MAX_CHARACTER_COUNT =
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT;

// This is the OpenAI model-context boundary. Session entries remain the
// canonical history, but each request is rebuilt from the latest compaction
// summary, its retained recent tail, and valid terminal turns after it. Replay
// items stay paired with tool results so OpenAI can validate call_id values.
export function createOpenAiResponsesInputItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): OpenAiConversationInputItem[] {
  const effectiveConversationSessionEntries = listModelVisibleConversationSessionEntries(conversationSessionEntries);
  const openAiInputItems: OpenAiConversationInputItem[] = [];
  let pendingConversationSessionTurn: ConversationSessionTurn | undefined;

  for (const conversationSessionEntry of effectiveConversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      pendingConversationSessionTurn = undefined;
      openAiInputItems.push(createCompactionSummaryInputItem(conversationSessionEntry));
      continue;
    }

    if (conversationSessionEntry.entryKind === "user_prompt") {
      pendingConversationSessionTurn = {
        userPromptEntry: conversationSessionEntry,
        entriesAfterUserPrompt: [],
      };
      continue;
    }

    if (!pendingConversationSessionTurn) {
      continue;
    }

    pendingConversationSessionTurn.entriesAfterUserPrompt.push(conversationSessionEntry);
    if (conversationSessionEntry.entryKind === "assistant_message") {
      appendOpenAiInputItemsForConversationSessionTurn(openAiInputItems, pendingConversationSessionTurn);
      pendingConversationSessionTurn = undefined;
    }
  }

  if (pendingConversationSessionTurn?.entriesAfterUserPrompt.length === 0) {
    openAiInputItems.push(createUserMessageInputItem(pendingConversationSessionTurn.userPromptEntry));
  }

  return openAiInputItems;
}

function appendOpenAiInputItemsForConversationSessionTurn(
  openAiInputItems: OpenAiConversationInputItem[],
  conversationSessionTurn: ConversationSessionTurn,
): void {
  const terminalAssistantMessageEntry = conversationSessionTurn.entriesAfterUserPrompt.at(-1);
  if (!terminalAssistantMessageEntry || terminalAssistantMessageEntry.entryKind !== "assistant_message") {
    return;
  }

  if (
    terminalAssistantMessageEntry.assistantMessageStatus === "failed" ||
    terminalAssistantMessageEntry.assistantMessageStatus === "interrupted"
  ) {
    appendOpenAiInputItemsForFailedOrInterruptedConversationSessionTurn(
      openAiInputItems,
      conversationSessionTurn,
    );
    return;
  }

  openAiInputItems.push(createUserMessageInputItem(conversationSessionTurn.userPromptEntry));
  if (isOpenAiProviderTurnReplay(terminalAssistantMessageEntry.providerTurnReplay)) {
    openAiInputItems.push(...createHistoricalOpenAiProviderTurnReplayInputItems({
      providerTurnReplay: terminalAssistantMessageEntry.providerTurnReplay,
      historicalToolResultMetadataByToolCallId: createHistoricalToolResultReplayMetadataByToolCallId(
        conversationSessionTurn.entriesAfterUserPrompt.slice(0, -1),
      ),
    }));
  } else {
    const legacyToolTranscriptSegments = createPairedLegacyToolTranscriptSegments(
      conversationSessionTurn.entriesAfterUserPrompt.slice(0, -1),
    );
    if (legacyToolTranscriptSegments.length > 0) {
      openAiInputItems.push(createMessageInputItem("assistant", legacyToolTranscriptSegments.join("\n\n")));
    }
  }

  openAiInputItems.push(createMessageInputItem("assistant", terminalAssistantMessageEntry.assistantMessageText));
}

function appendOpenAiInputItemsForFailedOrInterruptedConversationSessionTurn(
  openAiInputItems: OpenAiConversationInputItem[],
  conversationSessionTurn: ConversationSessionTurn,
): void {
  const legacyToolTranscriptSegments = createPairedLegacyToolTranscriptSegments(
    conversationSessionTurn.entriesAfterUserPrompt.slice(0, -1),
  );
  if (legacyToolTranscriptSegments.length === 0) {
    return;
  }

  openAiInputItems.push(
    createUserMessageInputItem(conversationSessionTurn.userPromptEntry),
    createMessageInputItem("assistant", legacyToolTranscriptSegments.join("\n\n")),
  );
}

export function createFunctionCallOutputInputItem(
  toolCallId: string,
  toolResultText: string,
): OpenAiFunctionCallOutputInputItem {
  return {
    type: "function_call_output",
    call_id: toolCallId,
    output: toolResultText,
  };
}

export function createOpenAiResponseReplayItems(responseOutputItems: readonly unknown[]): OpenAiResponseReplayItems {
  const continuationInputItems: OpenAiConversationInputItem[] = [];
  const providerTurnReplayInputItems: OpenAiProviderTurnReplayInputItem[] = [];

  for (const responseOutputItem of responseOutputItems) {
    if (!isOpenAiResponseObject(responseOutputItem)) {
      continue;
    }

    const reasoningReplayItem = createReasoningReplayItem(responseOutputItem);
    if (reasoningReplayItem) {
      continuationInputItems.push(reasoningReplayItem);
      providerTurnReplayInputItems.push(reasoningReplayItem);
      continue;
    }

    const assistantMessageInputItem = createAssistantMessageInputItemFromResponseOutputItem(responseOutputItem);
    if (assistantMessageInputItem) {
      continuationInputItems.push(assistantMessageInputItem);
      continue;
    }

    const functionCallInputItem = createFunctionCallInputItemFromResponseOutputItem(responseOutputItem);
    if (functionCallInputItem) {
      continuationInputItems.push(functionCallInputItem);
      providerTurnReplayInputItems.push(functionCallInputItem);
    }
  }

  return {
    continuationInputItems,
    providerTurnReplayInputItems,
  };
}

function createMessageInputItem(
  role: "assistant",
  messageText: string,
): OpenAiAssistantConversationMessageInputItem {
  return {
    role,
    content: messageText,
  };
}

function createUserMessageInputItem(
  userPromptEntry: UserPromptConversationSessionEntry,
): OpenAiUserConversationMessageInputItem {
  const imageAttachments = userPromptEntry.imageAttachments ?? [];
  if (imageAttachments.length === 0) {
    return {
      role: "user",
      content: userPromptEntry.modelFacingPromptText,
    };
  }

  return {
    role: "user",
    content: [
      ...(userPromptEntry.modelFacingPromptText.length > 0
        ? [{ type: "input_text" as const, text: userPromptEntry.modelFacingPromptText }]
        : []),
      ...imageAttachments.map(createOpenAiInputImageContentPart),
    ],
  };
}

function createCompactionSummaryInputItem(
  compactionSummaryEntry: ConversationCompactionSummaryConversationSessionEntry,
): OpenAiUserConversationMessageInputItem {
  return {
    role: "user",
    content: [
      "<conversation_compaction_summary>",
      "The earlier conversation was compacted. Continue from this summary:",
      "",
      compactionSummaryEntry.summaryText,
      "</conversation_compaction_summary>",
    ].join("\n"),
  };
}

function createOpenAiInputImageContentPart(
  imageAttachment: UserPromptImageAttachment,
): OpenAiInputImageContentPart {
  return {
    type: "input_image",
    image_url: imageAttachment.dataUrl,
  };
}

function createHistoricalOpenAiProviderTurnReplayInputItems(input: {
  providerTurnReplay: OpenAiProviderTurnReplay;
  historicalToolResultMetadataByToolCallId: ReadonlyMap<string, HistoricalToolResultReplayMetadata>;
}): OpenAiProviderTurnReplayInputItem[] {
  const replayToolNameByToolCallId = createReplayToolNameByToolCallId(input.providerTurnReplay.inputItems);
  const historicalFunctionCallOutputReplayProjections = input.providerTurnReplay.inputItems.flatMap((providerTurnReplayInputItem) => {
    if (providerTurnReplayInputItem.type !== "function_call_output") {
      return [];
    }

    const historicalToolResultMetadata = input.historicalToolResultMetadataByToolCallId.get(providerTurnReplayInputItem.call_id);
    const replayToolName = historicalToolResultMetadata?.toolName ?? replayToolNameByToolCallId.get(providerTurnReplayInputItem.call_id);
    return [{
      providerTurnReplayInputItem,
      replayToolName,
      historicalToolResultMetadata,
      replayPriorityWeight: resolveHistoricalToolOutputReplayPriorityWeight({
        replayToolName,
        historicalToolResultMetadata,
      }),
    }];
  });
  const totalHistoricalFunctionCallOutputLength = historicalFunctionCallOutputReplayProjections.reduce(
    (totalOutputLength, historicalFunctionCallOutputReplayProjection) =>
      totalOutputLength + historicalFunctionCallOutputReplayProjection.providerTurnReplayInputItem.output.length,
    0,
  );
  if (totalHistoricalFunctionCallOutputLength <= OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT) {
    return [...input.providerTurnReplay.inputItems];
  }

  const projectedCharacterBudgetByFunctionCallOutputItem = createHistoricalFunctionCallOutputReplayBudgetByItem(
    historicalFunctionCallOutputReplayProjections,
  );
  return input.providerTurnReplay.inputItems.map((providerTurnReplayInputItem) => {
    if (providerTurnReplayInputItem.type !== "function_call_output") {
      return providerTurnReplayInputItem;
    }

    const historicalToolResultMetadata = input.historicalToolResultMetadataByToolCallId.get(providerTurnReplayInputItem.call_id);
    const replayToolName = historicalToolResultMetadata?.toolName ?? replayToolNameByToolCallId.get(providerTurnReplayInputItem.call_id);
    const maximumCharacterCount = projectedCharacterBudgetByFunctionCallOutputItem.get(providerTurnReplayInputItem) ??
      OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT;
    const projectedFunctionCallOutput = createHistoricalFunctionCallOutputReplayText({
      functionCallOutputText: providerTurnReplayInputItem.output,
      sourceToolCallId: providerTurnReplayInputItem.call_id,
      replayToolName,
      historicalToolResultMetadata,
      maximumCharacterCount,
    });
    if (projectedFunctionCallOutput === providerTurnReplayInputItem.output) {
      return providerTurnReplayInputItem;
    }

    return {
      ...providerTurnReplayInputItem,
      output: projectedFunctionCallOutput,
    };
  });
}

type HistoricalFunctionCallOutputReplayProjection = {
  providerTurnReplayInputItem: OpenAiFunctionCallOutputInputItem;
  replayToolName: string | undefined;
  historicalToolResultMetadata: HistoricalToolResultReplayMetadata | undefined;
  replayPriorityWeight: number;
};

function createHistoricalFunctionCallOutputReplayBudgetByItem(
  historicalFunctionCallOutputReplayProjections: readonly HistoricalFunctionCallOutputReplayProjection[],
): ReadonlyMap<OpenAiFunctionCallOutputInputItem, number> {
  const totalReplayPriorityWeight = historicalFunctionCallOutputReplayProjections.reduce(
    (totalPriorityWeight, historicalFunctionCallOutputReplayProjection) =>
      totalPriorityWeight + historicalFunctionCallOutputReplayProjection.replayPriorityWeight,
    0,
  );
  const projectedCharacterBudgetByFunctionCallOutputItem = new Map<OpenAiFunctionCallOutputInputItem, number>();
  for (const historicalFunctionCallOutputReplayProjection of historicalFunctionCallOutputReplayProjections) {
    const weightedTurnBudget = totalReplayPriorityWeight > 0
      ? Math.floor(
        OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT *
          historicalFunctionCallOutputReplayProjection.replayPriorityWeight /
          totalReplayPriorityWeight,
      )
      : OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT;
    projectedCharacterBudgetByFunctionCallOutputItem.set(
      historicalFunctionCallOutputReplayProjection.providerTurnReplayInputItem,
      Math.min(
        historicalFunctionCallOutputReplayProjection.providerTurnReplayInputItem.output.length,
        OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT,
        Math.max(512, weightedTurnBudget),
      ),
    );
  }

  return projectedCharacterBudgetByFunctionCallOutputItem;
}

function resolveHistoricalToolOutputReplayPriorityWeight(input: {
  replayToolName: string | undefined;
  historicalToolResultMetadata: HistoricalToolResultReplayMetadata | undefined;
}): number {
  const toolName = input.historicalToolResultMetadata?.toolName ?? input.replayToolName;
  if (
    toolName === "read" ||
    toolName === "read_many" ||
    toolName === "grep" ||
    toolName === "glob" ||
    toolName === "search_many" ||
    toolName === "query_codebase_knowledge"
  ) {
    return 1;
  }

  if (toolName === "bash") {
    if (
      input.historicalToolResultMetadata?.toolResultEntryKind === "failed_tool_result" ||
      (input.historicalToolResultMetadata?.bashExitCode !== undefined && input.historicalToolResultMetadata.bashExitCode !== 0)
    ) {
      return 4;
    }

    return 2;
  }

  if (
    toolName === "edit" ||
    toolName === "edit_many" ||
    toolName === "write" ||
    toolName === "patch" ||
    toolName === "patch_many"
  ) {
    return 4;
  }

  return 3;
}

function createHistoricalToolResultReplayMetadataByToolCallId(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ReadonlyMap<string, HistoricalToolResultReplayMetadata> {
  const historicalToolResultMetadataByToolCallId = new Map<string, HistoricalToolResultReplayMetadata>();
  for (const conversationSessionEntry of conversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "tool_call") {
      const existingMetadata = historicalToolResultMetadataByToolCallId.get(conversationSessionEntry.toolCallId);
      historicalToolResultMetadataByToolCallId.set(conversationSessionEntry.toolCallId, {
        ...existingMetadata,
        toolName: conversationSessionEntry.toolCallRequest.toolName,
      });
      continue;
    }

    if (!isToolResultConversationSessionEntry(conversationSessionEntry)) {
      continue;
    }

    const existingMetadata = historicalToolResultMetadataByToolCallId.get(conversationSessionEntry.toolCallId);
    historicalToolResultMetadataByToolCallId.set(conversationSessionEntry.toolCallId, {
      ...existingMetadata,
      toolName: conversationSessionEntry.toolCallDetail.toolName,
      toolResultEntryKind: conversationSessionEntry.entryKind,
      ...(conversationSessionEntry.toolCallDetail.toolName === "bash" && conversationSessionEntry.toolCallDetail.exitCode !== undefined
        ? { bashExitCode: conversationSessionEntry.toolCallDetail.exitCode }
        : {}),
    });
  }

  return historicalToolResultMetadataByToolCallId;
}

function createReplayToolNameByToolCallId(
  providerTurnReplayInputItems: readonly OpenAiProviderTurnReplayInputItem[],
): ReadonlyMap<string, string> {
  const replayToolNameByToolCallId = new Map<string, string>();
  for (const providerTurnReplayInputItem of providerTurnReplayInputItems) {
    if (providerTurnReplayInputItem.type === "function_call") {
      replayToolNameByToolCallId.set(providerTurnReplayInputItem.call_id, providerTurnReplayInputItem.name);
    }
  }

  return replayToolNameByToolCallId;
}

function createHistoricalFunctionCallOutputReplayText(input: {
  functionCallOutputText: string;
  sourceToolCallId: string;
  replayToolName: string | undefined;
  historicalToolResultMetadata: HistoricalToolResultReplayMetadata | undefined;
  maximumCharacterCount: number;
}): string {
  return createHeadTailBudgetedText({
    sourceText: input.functionCallOutputText,
    maximumCharacterCount: input.maximumCharacterCount,
    createTruncationNotice: (omittedCharacterCount) =>
      [
        "",
        "<historical_tool_output_replay_truncated>",
        "Historical tool output was truncated only for this future request projection.",
        "The full result was visible when the tool finished and remains stored in session history; omitted content is not currently visible in this request.",
        `sourceToolCallId: ${input.sourceToolCallId}`,
        `toolName: ${input.replayToolName ?? "unknown"}`,
        `toolResultEntryKind: ${input.historicalToolResultMetadata?.toolResultEntryKind ?? "unknown"}`,
        `originalCharacterCount: ${input.functionCallOutputText.length}`,
        `projectedCharacterBudget: ${input.maximumCharacterCount}`,
        `omittedCharacterCount: ${omittedCharacterCount}`,
        "Do not rely on omitted content; request a narrower follow-up tool call if those details are needed.",
        "</historical_tool_output_replay_truncated>",
        "",
      ].join("\n"),
  });
}

function createHeadTailBudgetedText(input: {
  sourceText: string;
  maximumCharacterCount: number;
  createTruncationNotice: (omittedCharacterCount: number) => string;
}): string {
  const maximumCharacterCount = Math.max(0, Math.floor(input.maximumCharacterCount));
  if (input.sourceText.length <= maximumCharacterCount) {
    return input.sourceText;
  }

  let truncationNotice = input.createTruncationNotice(input.sourceText.length);
  for (let attemptIndex = 0; attemptIndex < 10; attemptIndex += 1) {
    const retainedCharacterCount = maximumCharacterCount - truncationNotice.length;
    if (retainedCharacterCount <= 0) {
      return truncationNotice.slice(0, maximumCharacterCount);
    }

    const retainedHeadCharacterCount = Math.ceil(retainedCharacterCount / 2);
    const retainedTailCharacterCount = Math.floor(retainedCharacterCount / 2);
    const omittedCharacterCount = input.sourceText.length - retainedHeadCharacterCount - retainedTailCharacterCount;
    const nextTruncationNotice = input.createTruncationNotice(omittedCharacterCount);
    if (nextTruncationNotice.length === truncationNotice.length || attemptIndex === 9) {
      return [
        input.sourceText.slice(0, retainedHeadCharacterCount),
        nextTruncationNotice,
        retainedTailCharacterCount > 0 ? input.sourceText.slice(-retainedTailCharacterCount) : "",
      ].join("");
    }

    truncationNotice = nextTruncationNotice;
  }

  return input.sourceText.slice(0, maximumCharacterCount);
}

function isOpenAiProviderTurnReplay(
  providerTurnReplay: AssistantMessageConversationSessionEntry["providerTurnReplay"] | undefined,
): providerTurnReplay is OpenAiProviderTurnReplay {
  return providerTurnReplay?.provider === "openai";
}

function createReasoningReplayItem(responseOutputItem: OpenAiResponseObject): OpenAiReasoningReplayItem | undefined {
  const responseOutputItemId = readOpenAiResponseObjectStringField(responseOutputItem, "id");
  if (responseOutputItem.type !== "reasoning" || responseOutputItemId === undefined) {
    return undefined;
  }

  const summaryParts = listOpenAiReasoningSummaryTextParts(readOpenAiResponseObjectArrayField(responseOutputItem, "summary"));

  const replayItem: OpenAiReasoningReplayItem = {
    type: "reasoning",
    id: responseOutputItemId,
    summary: summaryParts,
  };

  const encryptedContent = responseOutputItem["encrypted_content"];
  if (typeof encryptedContent === "string" || encryptedContent === null) {
    replayItem.encrypted_content = encryptedContent;
  }

  return replayItem;
}

function createAssistantMessageInputItemFromResponseOutputItem(
  responseOutputItem: OpenAiResponseObject,
): OpenAiConversationMessageInputItem | undefined {
  const responseContent = readOpenAiResponseObjectArrayField(responseOutputItem, "content");
  if (
    responseOutputItem.type !== "message" ||
    readOpenAiResponseObjectStringField(responseOutputItem, "role") !== "assistant" ||
    responseContent === undefined
  ) {
    return undefined;
  }

  const assistantMessageText = responseContent
    .flatMap((contentPart) => isOpenAiOutputTextContentPart(contentPart) ? [contentPart.text] : [])
    .join("");

  if (assistantMessageText.length === 0) {
    return undefined;
  }

  return createMessageInputItem("assistant", assistantMessageText);
}

function createFunctionCallInputItemFromResponseOutputItem(
  responseOutputItem: OpenAiResponseObject,
): OpenAiFunctionCallInputItem | undefined {
  const functionCallOutputItem = readOpenAiFunctionCallOutputItem(responseOutputItem);
  if (!functionCallOutputItem || functionCallOutputItem.argumentsText === undefined) {
    return undefined;
  }

  return {
    type: "function_call",
    id: functionCallOutputItem.itemId,
    call_id: functionCallOutputItem.functionCallId,
    name: functionCallOutputItem.functionName,
    arguments: functionCallOutputItem.argumentsText,
  };
}

function createPairedLegacyToolTranscriptSegments(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): string[] {
  const legacyToolTranscriptSegments: string[] = [];
  const toolResultEntryByToolCallId = new Map<string, ToolResultConversationSessionEntry>();
  const projectedToolCallIds = new Set<string>();

  for (const conversationSessionEntry of conversationSessionEntries) {
    if (!isToolResultConversationSessionEntry(conversationSessionEntry) || toolResultEntryByToolCallId.has(conversationSessionEntry.toolCallId)) {
      continue;
    }

    toolResultEntryByToolCallId.set(conversationSessionEntry.toolCallId, conversationSessionEntry);
  }

  for (const conversationSessionEntry of conversationSessionEntries) {
    if (conversationSessionEntry.entryKind !== "tool_call" || projectedToolCallIds.has(conversationSessionEntry.toolCallId)) {
      continue;
    }

    const toolResultEntry = toolResultEntryByToolCallId.get(conversationSessionEntry.toolCallId);
    if (!toolResultEntry) {
      continue;
    }

    legacyToolTranscriptSegments.push(
      createLegacyToolTranscriptSegment(conversationSessionEntry),
      createLegacyToolTranscriptSegment(toolResultEntry),
    );
    projectedToolCallIds.add(conversationSessionEntry.toolCallId);
  }

  return legacyToolTranscriptSegments;
}

function createLegacyToolTranscriptSegment(conversationSessionEntry: ToolCallConversationSessionEntry | ToolResultConversationSessionEntry): string {
  if (conversationSessionEntry.entryKind === "tool_call") {
    return createLegacyToolCallTranscriptSegment(conversationSessionEntry);
  }

  return createLegacyToolResultTranscriptSegment(conversationSessionEntry);
}

function createLegacyToolCallTranscriptSegment(conversationSessionEntry: ToolCallConversationSessionEntry): string {
  if (conversationSessionEntry.toolCallRequest.toolName === "bash") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: bash",
      `Command: ${conversationSessionEntry.toolCallRequest.shellCommand}`,
      `Description: ${conversationSessionEntry.toolCallRequest.commandDescription}`,
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "read") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: read",
      `Path: ${conversationSessionEntry.toolCallRequest.readTargetPath}`,
      ...(conversationSessionEntry.toolCallRequest.offsetLineNumber !== undefined
        ? [`Offset line: ${conversationSessionEntry.toolCallRequest.offsetLineNumber}`]
        : []),
      ...(conversationSessionEntry.toolCallRequest.maximumLineCount !== undefined
        ? [`Line limit: ${conversationSessionEntry.toolCallRequest.maximumLineCount}`]
        : []),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "read_many") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: read_many",
      `Target count: ${conversationSessionEntry.toolCallRequest.readTargets.length}`,
      ...conversationSessionEntry.toolCallRequest.readTargets.map((readTarget, readTargetIndex) =>
        `Target ${readTargetIndex + 1}: ${readTarget.readTargetPath}`
      ),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "search_many") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: search_many",
      `Search count: ${conversationSessionEntry.toolCallRequest.searches.length}`,
      ...conversationSessionEntry.toolCallRequest.searches.map((search, searchIndex) => formatSearchManyLegacyTranscriptLine(search, searchIndex)),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "glob") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: glob",
      `Pattern: ${conversationSessionEntry.toolCallRequest.globPattern}`,
      ...(conversationSessionEntry.toolCallRequest.searchDirectoryPath !== undefined
        ? [`Directory: ${conversationSessionEntry.toolCallRequest.searchDirectoryPath}`]
        : []),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "grep") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: grep",
      `Pattern: ${conversationSessionEntry.toolCallRequest.regexPattern}`,
      ...(conversationSessionEntry.toolCallRequest.searchPath !== undefined
        ? [`Path: ${conversationSessionEntry.toolCallRequest.searchPath}`]
        : []),
      ...(conversationSessionEntry.toolCallRequest.includeGlobPattern !== undefined
        ? [`Include: ${conversationSessionEntry.toolCallRequest.includeGlobPattern}`]
      : []),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "query_codebase_knowledge") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: query_codebase_knowledge",
      `Problem: ${conversationSessionEntry.toolCallRequest.codebaseProblemDescription}`,
      ...(conversationSessionEntry.toolCallRequest.knownRelevantFilePaths !== undefined
        ? [`Known files: ${conversationSessionEntry.toolCallRequest.knownRelevantFilePaths.join(", ")}`]
        : []),
      ...(conversationSessionEntry.toolCallRequest.knownRelevantSymbolNames !== undefined
        ? [`Known symbols: ${conversationSessionEntry.toolCallRequest.knownRelevantSymbolNames.join(", ")}`]
        : []),
      ...(conversationSessionEntry.toolCallRequest.maximumKnowledgeResultCount !== undefined
        ? [`Maximum results: ${conversationSessionEntry.toolCallRequest.maximumKnowledgeResultCount}`]
        : []),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "edit") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: edit",
      `Path: ${conversationSessionEntry.toolCallRequest.editTargetPath}`,
      `Old string length: ${conversationSessionEntry.toolCallRequest.oldString.length}`,
      `New string length: ${conversationSessionEntry.toolCallRequest.newString.length}`,
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "edit_many") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: edit_many",
      `Edit count: ${conversationSessionEntry.toolCallRequest.edits.length}`,
      ...conversationSessionEntry.toolCallRequest.edits.map((edit, editIndex) =>
        `Edit ${editIndex + 1}: ${edit.editTargetPath} old=${edit.oldString.length} new=${edit.newString.length}`
      ),
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "patch") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: patch",
      `Patch length: ${conversationSessionEntry.toolCallRequest.patchText.length}`,
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "patch_many") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: patch_many",
      `Patch length: ${conversationSessionEntry.toolCallRequest.patchText.length}`,
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "write") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: write",
      `Path: ${conversationSessionEntry.toolCallRequest.writeTargetPath}`,
      `Content length: ${conversationSessionEntry.toolCallRequest.fileContent.length}`,
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "task") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: task",
      `Subagent: ${conversationSessionEntry.toolCallRequest.subagentName}`,
      `Description: ${conversationSessionEntry.toolCallRequest.subagentDescription}`,
      `Prompt: ${conversationSessionEntry.toolCallRequest.subagentPrompt}`,
    ].join("\n");
  }

  if (conversationSessionEntry.toolCallRequest.toolName === "skill") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: skill",
      `Skill: ${conversationSessionEntry.toolCallRequest.skillName}`,
    ].join("\n");
  }

  return assertUnhandledToolCallRequest(conversationSessionEntry.toolCallRequest);
}

function formatSearchManyLegacyTranscriptLine(
  search: Extract<ToolCallConversationSessionEntry["toolCallRequest"], { toolName: "search_many" }>["searches"][number],
  searchIndex: number,
): string {
  if (search.searchKind === "glob") {
    return [
      `Search ${searchIndex + 1}: glob`,
      `Pattern: ${search.globPattern}`,
      ...(search.searchDirectoryPath !== undefined ? [`Directory: ${search.searchDirectoryPath}`] : []),
    ].join(" | ");
  }

  return [
    `Search ${searchIndex + 1}: grep`,
    `Pattern: ${search.regexPattern}`,
    ...(search.searchPath !== undefined ? [`Path: ${search.searchPath}`] : []),
    ...(search.includeGlobPattern !== undefined ? [`Include: ${search.includeGlobPattern}`] : []),
  ].join(" | ");
}

function assertUnhandledToolCallRequest(toolCallRequest: never): never {
  throw new Error(`Unhandled tool call request: ${JSON.stringify(toolCallRequest)}`);
}

function createLegacyToolResultTranscriptSegment(conversationSessionEntry: ToolResultConversationSessionEntry): string {
  const toolResultLabel =
    conversationSessionEntry.entryKind === "completed_tool_result"
      ? "assistant tool result"
      : conversationSessionEntry.entryKind === "failed_tool_result"
        ? "assistant tool failure"
        : "assistant tool denial";

  return [`[${toolResultLabel} ${conversationSessionEntry.toolCallId}]`, conversationSessionEntry.toolResultText].join("\n");
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
