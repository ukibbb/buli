import type {
  AssistantMessageConversationSessionEntry,
  ConversationSessionEntry,
  OpenAiReasoningReplayItem,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
  UserPromptImageAttachment,
} from "@buli/contracts";
import {
  isOpenAiOutputTextContentPart,
  isOpenAiResponseObject,
  listOpenAiReasoningSummaryTextParts,
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

type ConversationSessionTurn = {
  userPromptEntry: UserPromptConversationSessionEntry;
  entriesAfterUserPrompt: ConversationSessionEntry[];
};

// This is the OpenAI model-context boundary. Session entries remain the
// canonical history, but each request is rebuilt from the latest compaction
// summary plus valid terminal turns after it. Replay items stay paired with
// their tool results so OpenAI can validate function_call_output.call_id.
export function createOpenAiResponsesInputItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): OpenAiConversationInputItem[] {
  const effectiveConversationSessionEntries = sliceConversationSessionEntriesFromLatestCompactionSummary(
    conversationSessionEntries,
  );
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

function sliceConversationSessionEntriesFromLatestCompactionSummary(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): readonly ConversationSessionEntry[] {
  const latestCompactionSummaryEntryIndex = conversationSessionEntries.findLastIndex(
    (conversationSessionEntry) => conversationSessionEntry.entryKind === "conversation_compaction_summary",
  );

  return latestCompactionSummaryEntryIndex === -1
    ? conversationSessionEntries
    : conversationSessionEntries.slice(latestCompactionSummaryEntryIndex);
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
    return;
  }

  openAiInputItems.push(createUserMessageInputItem(conversationSessionTurn.userPromptEntry));
  if (isOpenAiProviderTurnReplay(terminalAssistantMessageEntry.providerTurnReplay)) {
    openAiInputItems.push(...terminalAssistantMessageEntry.providerTurnReplay.inputItems);
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

function isOpenAiProviderTurnReplay(
  providerTurnReplay: AssistantMessageConversationSessionEntry["providerTurnReplay"] | undefined,
): providerTurnReplay is OpenAiProviderTurnReplay {
  return providerTurnReplay?.provider === "openai";
}

function createReasoningReplayItem(responseOutputItem: OpenAiResponseObject): OpenAiReasoningReplayItem | undefined {
  if (responseOutputItem.type !== "reasoning" || typeof responseOutputItem.id !== "string") {
    return undefined;
  }

  const summaryParts = listOpenAiReasoningSummaryTextParts(responseOutputItem.summary);

  const replayItem: OpenAiReasoningReplayItem = {
    type: "reasoning",
    id: responseOutputItem.id,
    summary: summaryParts,
  };

  if (typeof responseOutputItem.encrypted_content === "string" || responseOutputItem.encrypted_content === null) {
    replayItem.encrypted_content = responseOutputItem.encrypted_content;
  }

  return replayItem;
}

function createAssistantMessageInputItemFromResponseOutputItem(
  responseOutputItem: OpenAiResponseObject,
): OpenAiConversationMessageInputItem | undefined {
  if (responseOutputItem.type !== "message" || responseOutputItem.role !== "assistant" || !Array.isArray(responseOutputItem.content)) {
    return undefined;
  }

  const assistantMessageText = responseOutputItem.content
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
    call_id: functionCallOutputItem.toolCallId,
    name: functionCallOutputItem.toolName,
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

  if (conversationSessionEntry.toolCallRequest.toolName === "edit") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: edit",
      `Path: ${conversationSessionEntry.toolCallRequest.editTargetPath}`,
      `Old string length: ${conversationSessionEntry.toolCallRequest.oldString.length}`,
      `New string length: ${conversationSessionEntry.toolCallRequest.newString.length}`,
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

  if (conversationSessionEntry.toolCallRequest.toolName === "explore") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: explore",
      `Description: ${conversationSessionEntry.toolCallRequest.explorationDescription}`,
      `Prompt: ${conversationSessionEntry.toolCallRequest.explorationPrompt}`,
    ].join("\n");
  }

  return assertUnhandledToolCallRequest(conversationSessionEntry.toolCallRequest);
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
