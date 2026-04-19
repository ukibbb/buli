import type {
  AssistantMessageConversationSessionEntry,
  ConversationSessionEntry,
  OpenAiReasoningReplayItem,
  OpenAiProviderTurnReplay,
  OpenAiProviderTurnReplayInputItem,
} from "@buli/contracts";

export type OpenAiConversationMessageInputItem = {
  role: "user" | "assistant";
  content: string;
};

export type OpenAiFunctionCallInputItem = Extract<OpenAiProviderTurnReplayInputItem, { type: "function_call" }>;

export type OpenAiFunctionCallOutputInputItem = Extract<OpenAiProviderTurnReplayInputItem, { type: "function_call_output" }>;

export type OpenAiReasoningInputItem = Extract<OpenAiProviderTurnReplayInputItem, { type: "reasoning" }>;

export type OpenAiConversationInputItem =
  | OpenAiConversationMessageInputItem
  | OpenAiReasoningInputItem
  | OpenAiFunctionCallInputItem
  | OpenAiFunctionCallOutputInputItem;

type OpenAiResponseOutputItem = {
  type: string;
  [fieldName: string]: unknown;
};

type OpenAiResponseOutputSummaryPart = {
  type: string;
  text?: unknown;
};

export type OpenAiResponseReplayItems = {
  continuationInputItems: OpenAiConversationInputItem[];
  providerTurnReplayInputItems: OpenAiProviderTurnReplayInputItem[];
};

type ToolCallConversationSessionEntry = Extract<ConversationSessionEntry, { entryKind: "tool_call" }>;
type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

export function createOpenAiResponsesInputItems(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): OpenAiConversationInputItem[] {
  const openAiInputItems: OpenAiConversationInputItem[] = [];
  let pendingLegacyToolTranscriptSegments: string[] = [];

  function flushPendingLegacyToolTranscript(): void {
    if (pendingLegacyToolTranscriptSegments.length === 0) {
      return;
    }

    openAiInputItems.push(createMessageInputItem("assistant", pendingLegacyToolTranscriptSegments.join("\n\n")));
    pendingLegacyToolTranscriptSegments = [];
  }

  for (const conversationSessionEntry of conversationSessionEntries) {
    if (conversationSessionEntry.entryKind === "user_prompt") {
      flushPendingLegacyToolTranscript();
      openAiInputItems.push(createMessageInputItem("user", conversationSessionEntry.modelFacingPromptText));
      continue;
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      if (isOpenAiProviderTurnReplay(conversationSessionEntry.providerTurnReplay)) {
        pendingLegacyToolTranscriptSegments = [];
        openAiInputItems.push(...conversationSessionEntry.providerTurnReplay.inputItems);
      } else {
        flushPendingLegacyToolTranscript();
      }

      openAiInputItems.push(createMessageInputItem("assistant", conversationSessionEntry.assistantMessageText));
      continue;
    }

    pendingLegacyToolTranscriptSegments.push(createLegacyToolTranscriptSegment(conversationSessionEntry));
  }

  flushPendingLegacyToolTranscript();
  return openAiInputItems;
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
    if (!isOpenAiResponseOutputItem(responseOutputItem)) {
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
  role: "user" | "assistant",
  messageText: string,
): OpenAiConversationMessageInputItem {
  return {
    role,
    content: messageText,
  };
}

function isOpenAiProviderTurnReplay(
  providerTurnReplay: AssistantMessageConversationSessionEntry["providerTurnReplay"] | undefined,
): providerTurnReplay is OpenAiProviderTurnReplay {
  return providerTurnReplay?.provider === "openai";
}

function isOpenAiResponseOutputItem(value: unknown): value is OpenAiResponseOutputItem {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function createReasoningReplayItem(responseOutputItem: OpenAiResponseOutputItem): OpenAiReasoningReplayItem | undefined {
  if (responseOutputItem.type !== "reasoning" || typeof responseOutputItem.id !== "string") {
    return undefined;
  }

  const summaryParts = Array.isArray(responseOutputItem.summary)
    ? responseOutputItem.summary.flatMap((summaryPart) => {
        if (!isOpenAiResponseOutputSummaryPart(summaryPart)) {
          return [];
        }
        if (summaryPart.type !== "summary_text" || typeof summaryPart.text !== "string") {
          return [];
        }

        return [{ type: "summary_text" as const, text: summaryPart.text }];
      })
    : [];

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

function isOpenAiResponseOutputSummaryPart(value: unknown): value is OpenAiResponseOutputSummaryPart {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string";
}

function createAssistantMessageInputItemFromResponseOutputItem(
  responseOutputItem: OpenAiResponseOutputItem,
): OpenAiConversationMessageInputItem | undefined {
  if (responseOutputItem.type !== "message" || responseOutputItem.role !== "assistant" || !Array.isArray(responseOutputItem.content)) {
    return undefined;
  }

  const assistantMessageText = responseOutputItem.content
    .flatMap((contentPart) => {
      if (
        typeof contentPart !== "object" ||
        contentPart === null ||
        Array.isArray(contentPart) ||
        (contentPart as { type?: unknown }).type !== "output_text" ||
        typeof (contentPart as { text?: unknown }).text !== "string"
      ) {
        return [];
      }

      return [(contentPart as { text: string }).text];
    })
    .join("");

  if (assistantMessageText.length === 0) {
    return undefined;
  }

  return createMessageInputItem("assistant", assistantMessageText);
}

function createFunctionCallInputItemFromResponseOutputItem(
  responseOutputItem: OpenAiResponseOutputItem,
): OpenAiFunctionCallInputItem | undefined {
  if (
    responseOutputItem.type !== "function_call" ||
    typeof responseOutputItem.id !== "string" ||
    typeof responseOutputItem.call_id !== "string" ||
    typeof responseOutputItem.name !== "string" ||
    typeof responseOutputItem.arguments !== "string"
  ) {
    return undefined;
  }

  return {
    type: "function_call",
    id: responseOutputItem.id,
    call_id: responseOutputItem.call_id,
    name: responseOutputItem.name,
    arguments: responseOutputItem.arguments,
  };
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

  return [
    `[assistant tool call ${conversationSessionEntry.toolCallId}]`,
    `Tool: ${conversationSessionEntry.toolCallRequest.toolName}`,
  ].join("\n");
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
