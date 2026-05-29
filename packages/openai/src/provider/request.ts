import type {
  AssistantOperatingMode,
  ConversationSessionEntry,
  OpenAiReasoningReplayItem,
  OpenAiProviderTurnReplayInputItem,
  UserPromptImageAttachment,
} from "@buli/contracts";
import {
  HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT,
  HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT,
  listModelVisibleConversationSessionEntries,
  projectHistoricalToolResultTextForModelContext,
  projectHistoricalToolTranscriptTextForModelContext,
  summarizeWorkflowHandoff,
} from "@buli/contracts";
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

type ConversationSessionTurn = {
  userPromptEntry: UserPromptConversationSessionEntry;
  entriesAfterUserPrompt: ConversationSessionEntry[];
};

export const OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT =
  HISTORICAL_TOOL_RESULT_TEXT_PER_OUTPUT_MAX_CHARACTER_COUNT;
export const OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_TURN_MAX_CHARACTER_COUNT =
  HISTORICAL_TOOL_TRANSCRIPT_TURN_MAX_CHARACTER_COUNT;
export const OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_MAX_CHARACTER_COUNT =
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT;
export const OPENAI_HISTORICAL_REPLAY_SUCCESSFUL_BASH_OUTPUT_MAX_CHARACTER_COUNT =
  OPENAI_HISTORICAL_TOOL_OUTPUT_REPLAY_PER_OUTPUT_MAX_CHARACTER_COUNT;

// This is the OpenAI model-context boundary. Session entries remain the
// canonical history, but each request is rebuilt from the latest compaction
// summary, its retained recent tail, and valid terminal turns after it.
// Historical completed turns carry assistant conclusions, not old tool output;
// current-turn tool continuation still uses exact provider replay in turnSession.
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
  openAiInputItems.push(createAssistantMessageInputItem(
    terminalAssistantMessageEntry.assistantMessageText,
    terminalAssistantMessageEntry.assistantOperatingMode,
  ));
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

  const legacyToolTranscriptText = projectHistoricalToolTranscriptTextForModelContext({
    text: legacyToolTranscriptSegments.join("\n\n"),
  });
  const terminalAssistantMessageEntry = conversationSessionTurn.entriesAfterUserPrompt.at(-1);
  const historicalTranscriptAssistantOperatingMode = terminalAssistantMessageEntry?.entryKind === "assistant_message"
    ? terminalAssistantMessageEntry.assistantOperatingMode ?? conversationSessionTurn.userPromptEntry.assistantOperatingMode
    : conversationSessionTurn.userPromptEntry.assistantOperatingMode;

  openAiInputItems.push(
    createUserMessageInputItem(conversationSessionTurn.userPromptEntry),
    createAssistantMessageInputItem(legacyToolTranscriptText, historicalTranscriptAssistantOperatingMode),
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

function createAssistantMessageInputItem(
  messageText: string,
  assistantOperatingMode?: AssistantOperatingMode | undefined,
): OpenAiAssistantConversationMessageInputItem {
  return {
    role: "assistant",
    content: formatModeScopedConversationMessageText({
      messageText,
      speaker: "assistant",
      assistantOperatingMode,
    }),
  };
}

function createUserMessageInputItem(
  userPromptEntry: UserPromptConversationSessionEntry,
): OpenAiUserConversationMessageInputItem {
  const imageAttachments = userPromptEntry.imageAttachments ?? [];
  if (imageAttachments.length === 0) {
    return {
      role: "user",
      content: formatModeScopedConversationMessageText({
        messageText: userPromptEntry.modelFacingPromptText,
        speaker: "user",
        assistantOperatingMode: userPromptEntry.assistantOperatingMode,
      }),
    };
  }

  return {
    role: "user",
    content: [
      ...(userPromptEntry.modelFacingPromptText.length > 0
        ? [{
            type: "input_text" as const,
            text: formatModeScopedConversationMessageText({
              messageText: userPromptEntry.modelFacingPromptText,
              speaker: "user",
              assistantOperatingMode: userPromptEntry.assistantOperatingMode,
            }),
          }]
        : []),
      ...imageAttachments.map(createOpenAiInputImageContentPart),
    ],
  };
}

function formatModeScopedConversationMessageText(input: {
  messageText: string;
  speaker: "user" | "assistant";
  assistantOperatingMode?: AssistantOperatingMode | undefined;
}): string {
  if (input.assistantOperatingMode === undefined) {
    return input.messageText;
  }

  const modeScopeTagName = `${input.assistantOperatingMode}_mode`;
  return [
    `<${modeScopeTagName} speaker="${input.speaker}">`,
    input.messageText,
    `</${modeScopeTagName}>`,
  ].join("\n");
}

function createCompactionSummaryInputItem(
  compactionSummaryEntry: ConversationCompactionSummaryConversationSessionEntry,
): OpenAiUserConversationMessageInputItem {
  return {
    role: "user",
    content: [
      "<conversation_compaction_summary>",
      "The earlier conversation was compacted. Continue from this summary:",
      ...(compactionSummaryEntry.latestCompletedAssistantOperatingMode
        ? [
            `<latest_completed_assistant_mode>${compactionSummaryEntry.latestCompletedAssistantOperatingMode}</latest_completed_assistant_mode>`,
          ]
        : []),
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

  return createAssistantMessageInputItem(assistantMessageText);
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

  if (conversationSessionEntry.toolCallRequest.toolName === "locate_codebase_symbols") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: locate_codebase_symbols",
      ...(conversationSessionEntry.toolCallRequest.symbolNames !== undefined
        ? [`Symbols: ${conversationSessionEntry.toolCallRequest.symbolNames.join(", ")}`]
        : []),
      ...(conversationSessionEntry.toolCallRequest.filePaths !== undefined
        ? [`Files: ${conversationSessionEntry.toolCallRequest.filePaths.join(", ")}`]
        : []),
      ...(conversationSessionEntry.toolCallRequest.maximumResultCount !== undefined
        ? [`Maximum results: ${conversationSessionEntry.toolCallRequest.maximumResultCount}`]
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

  if (conversationSessionEntry.toolCallRequest.toolName === "record_workflow_handoff") {
    return [
      `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
      "Tool: record_workflow_handoff",
      `Handoff kind: ${conversationSessionEntry.toolCallRequest.workflowHandoff.handoffKind}`,
      `Handoff summary: ${summarizeWorkflowHandoff(conversationSessionEntry.toolCallRequest.workflowHandoff)}`,
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

  const projectedToolResultText = projectHistoricalToolResultTextForModelContext({
    text: conversationSessionEntry.toolResultText,
  });

  return [`[${toolResultLabel} ${conversationSessionEntry.toolCallId}]`, projectedToolResultText].join("\n");
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
