import type {
  AssistantTextPartStatus,
  AssistantToolCallPartStatus,
  ConversationMessage,
  ConversationMessagePart,
  ConversationSessionEntry,
  ToolCallDetail,
  ToolCallRequest,
} from "@buli/contracts";
import { parseAssistantResponseIntoContentParts } from "@buli/engine";
import type { ChatSessionState } from "./chatSessionState.ts";

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

type HydratedConversationTranscript = {
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: string[];
};

const INTERRUPTED_TOOL_CALL_ERROR_TEXT = "Tool call was interrupted before a result was recorded.";

export function clearConversationTranscript(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    conversationTurnStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    latestTokenUsage: undefined,
    conversationMessagesById: {},
    conversationMessagePartsById: {},
    orderedConversationMessageIds: [],
    pendingToolApprovalRequest: undefined,
    promptContextSelectionState: { step: "hidden" },
    slashCommandSelectionState: { step: "hidden" },
    conversationSessionSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
    modelAndReasoningSelectionState: { step: "hidden" },
    isCommandHelpModalVisible: false,
  };
}

export function hydrateConversationTranscriptFromSessionEntries(
  chatSessionState: ChatSessionState,
  conversationSessionEntries: readonly ConversationSessionEntry[],
): ChatSessionState {
  const hydratedConversationTranscript = buildHydratedConversationTranscript(conversationSessionEntries);
  return {
    ...clearConversationTranscript(chatSessionState),
    conversationMessagesById: hydratedConversationTranscript.conversationMessagesById,
    conversationMessagePartsById: hydratedConversationTranscript.conversationMessagePartsById,
    orderedConversationMessageIds: hydratedConversationTranscript.orderedConversationMessageIds,
  };
}

function buildHydratedConversationTranscript(
  conversationSessionEntries: readonly ConversationSessionEntry[],
): HydratedConversationTranscript {
  const conversationMessagesById: Record<string, ConversationMessage> = {};
  const conversationMessagePartsById: Record<string, ConversationMessagePart> = {};
  const orderedConversationMessageIds: string[] = [];
  const toolCallPartIdByToolCallId = new Map<string, string>();
  let currentAssistantMessageId: string | undefined;
  let assistantMessageIndex = 0;

  const appendConversationMessage = (conversationMessage: ConversationMessage): void => {
    conversationMessagesById[conversationMessage.id] = conversationMessage;
    orderedConversationMessageIds.push(conversationMessage.id);
  };
  const appendConversationMessagePart = (messageId: string, conversationMessagePart: ConversationMessagePart): void => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return;
    }

    conversationMessagesById[messageId] = {
      ...conversationMessage,
      partIds: [...conversationMessage.partIds, conversationMessagePart.id],
    };
    conversationMessagePartsById[conversationMessagePart.id] = conversationMessagePart;
  };
  const ensureAssistantConversationMessage = (entryIndex: number): string => {
    if (currentAssistantMessageId) {
      return currentAssistantMessageId;
    }

    const assistantMessageId = `persisted-assistant-${assistantMessageIndex}`;
    assistantMessageIndex += 1;
    appendConversationMessage({
      id: assistantMessageId,
      role: "assistant",
      messageStatus: "completed",
      createdAtMs: entryIndex,
      partIds: [],
    });
    currentAssistantMessageId = assistantMessageId;
    return assistantMessageId;
  };
  const markDanglingHydratedToolCallsAsInterrupted = (interruptedAtEntryIndex: number): void => {
    if (!currentAssistantMessageId) {
      return;
    }

    const currentAssistantConversationMessage = conversationMessagesById[currentAssistantMessageId];
    if (!currentAssistantConversationMessage) {
      return;
    }

    const interruptedToolCallPartIds = currentAssistantConversationMessage.partIds.filter((partId) => {
      const conversationMessagePart = conversationMessagePartsById[partId];
      return conversationMessagePart?.partKind === "assistant_tool_call" &&
        (conversationMessagePart.toolCallStatus === "running" || conversationMessagePart.toolCallStatus === "pending_approval");
    });

    if (interruptedToolCallPartIds.length === 0) {
      return;
    }

    conversationMessagesById[currentAssistantMessageId] = {
      ...currentAssistantConversationMessage,
      messageStatus: "interrupted",
    };

    for (const interruptedToolCallPartId of interruptedToolCallPartIds) {
      const interruptedToolCallPart = conversationMessagePartsById[interruptedToolCallPartId];
      if (!interruptedToolCallPart || interruptedToolCallPart.partKind !== "assistant_tool_call") {
        continue;
      }

      conversationMessagePartsById[interruptedToolCallPartId] = {
        ...interruptedToolCallPart,
        toolCallStatus: "interrupted",
        errorText: INTERRUPTED_TOOL_CALL_ERROR_TEXT,
      };
    }

    const hasInterruptedToolCallNoticePart = currentAssistantConversationMessage.partIds.some((partId) => {
      const conversationMessagePart = conversationMessagePartsById[partId];
      return conversationMessagePart?.partKind === "assistant_interrupted_notice" &&
        conversationMessagePart.interruptionReason === INTERRUPTED_TOOL_CALL_ERROR_TEXT;
    });
    if (hasInterruptedToolCallNoticePart) {
      return;
    }

    appendConversationMessagePart(currentAssistantMessageId, {
      id: `persisted-entry-${interruptedAtEntryIndex}-assistant-interrupted-tool-call`,
      partKind: "assistant_interrupted_notice",
      interruptionReason: INTERRUPTED_TOOL_CALL_ERROR_TEXT,
    });
  };

  conversationSessionEntries.forEach((conversationSessionEntry, entryIndex) => {
    if (conversationSessionEntry.entryKind === "user_prompt") {
      markDanglingHydratedToolCallsAsInterrupted(entryIndex);
      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
      const userMessageId = `persisted-entry-${entryIndex}-user`;
      const userTextPartId = `persisted-entry-${entryIndex}-user-text`;
      appendConversationMessage({
        id: userMessageId,
        role: "user",
        messageStatus: "completed",
        createdAtMs: entryIndex,
        partIds: [userTextPartId],
      });
      conversationMessagePartsById[userTextPartId] = {
        id: userTextPartId,
        partKind: "user_text",
        text: conversationSessionEntry.promptText,
      };
      return;
    }

    if (conversationSessionEntry.entryKind === "tool_call") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      const toolCallPartId = `persisted-entry-${entryIndex}-tool-call`;
      toolCallPartIdByToolCallId.set(conversationSessionEntry.toolCallId, toolCallPartId);
      appendConversationMessagePart(assistantMessageId, {
        id: toolCallPartId,
        partKind: "assistant_tool_call",
        toolCallId: conversationSessionEntry.toolCallId,
        toolCallStatus: "running",
        toolCallStartedAtMs: entryIndex,
        toolCallDetail: createToolCallDetailFromRequest(conversationSessionEntry.toolCallRequest),
      });
      return;
    }

    if (isToolResultConversationSessionEntry(conversationSessionEntry)) {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      upsertHydratedToolResultPart({
        conversationSessionEntry,
        entryIndex,
        assistantMessageId,
        toolCallPartIdByToolCallId,
        conversationMessagePartsById,
        appendConversationMessagePart,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_message") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      const existingAssistantMessage = conversationMessagesById[assistantMessageId];
      if (existingAssistantMessage) {
        conversationMessagesById[assistantMessageId] = {
          ...existingAssistantMessage,
          messageStatus: conversationSessionEntry.assistantMessageStatus,
        };
      }

      if (conversationSessionEntry.assistantMessageText.length > 0) {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-text`,
          partKind: "assistant_text",
          partStatus: conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
          rawMarkdownText: conversationSessionEntry.assistantMessageText,
          completedContentParts: [...parseAssistantResponseIntoContentParts(conversationSessionEntry.assistantMessageText)],
        });
      }

      if (conversationSessionEntry.assistantMessageStatus === "incomplete") {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-incomplete`,
          partKind: "assistant_incomplete_notice",
          incompleteReason: conversationSessionEntry.incompleteReason,
        });
      }

      if (conversationSessionEntry.assistantMessageStatus === "failed") {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-error`,
          partKind: "assistant_error_notice",
          errorText: conversationSessionEntry.failureExplanation,
        });
      }

      if (conversationSessionEntry.assistantMessageStatus === "interrupted") {
        markDanglingHydratedToolCallsAsInterrupted(entryIndex);
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-interrupted`,
          partKind: "assistant_interrupted_notice",
          interruptionReason: conversationSessionEntry.interruptionReason,
        });
      }

      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
    }
  });

  markDanglingHydratedToolCallsAsInterrupted(conversationSessionEntries.length);

  return {
    conversationMessagesById,
    conversationMessagePartsById,
    orderedConversationMessageIds,
  };
}

function upsertHydratedToolResultPart(input: {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  entryIndex: number;
  assistantMessageId: string;
  toolCallPartIdByToolCallId: Map<string, string>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  appendConversationMessagePart: (messageId: string, conversationMessagePart: ConversationMessagePart) => void;
}): void {
  const toolCallStatus = mapToolResultEntryToToolCallStatus(input.conversationSessionEntry);
  const existingToolCallPartId = input.toolCallPartIdByToolCallId.get(input.conversationSessionEntry.toolCallId);
  const existingToolCallPart = existingToolCallPartId
    ? input.conversationMessagePartsById[existingToolCallPartId]
    : undefined;

  if (existingToolCallPart?.partKind === "assistant_tool_call") {
    input.conversationMessagePartsById[existingToolCallPart.id] = {
      ...existingToolCallPart,
      toolCallStatus,
      toolCallDetail: input.conversationSessionEntry.toolCallDetail,
      ...(input.conversationSessionEntry.entryKind === "failed_tool_result"
        ? { errorText: input.conversationSessionEntry.failureExplanation }
        : {}),
      ...(input.conversationSessionEntry.entryKind === "denied_tool_result"
        ? { denialText: input.conversationSessionEntry.denialExplanation }
        : {}),
    };
    return;
  }

  const toolCallPartId = `persisted-entry-${input.entryIndex}-tool-result`;
  input.toolCallPartIdByToolCallId.set(input.conversationSessionEntry.toolCallId, toolCallPartId);
  input.appendConversationMessagePart(input.assistantMessageId, {
    id: toolCallPartId,
    partKind: "assistant_tool_call",
    toolCallId: input.conversationSessionEntry.toolCallId,
    toolCallStatus,
    toolCallStartedAtMs: input.entryIndex,
    toolCallDetail: input.conversationSessionEntry.toolCallDetail,
    ...(input.conversationSessionEntry.entryKind === "failed_tool_result"
      ? { errorText: input.conversationSessionEntry.failureExplanation }
      : {}),
    ...(input.conversationSessionEntry.entryKind === "denied_tool_result"
      ? { denialText: input.conversationSessionEntry.denialExplanation }
      : {}),
  });
}

function createToolCallDetailFromRequest(toolCallRequest: ToolCallRequest): ToolCallDetail {
  if (toolCallRequest.toolName === "bash") {
    return {
      toolName: "bash",
      commandLine: toolCallRequest.shellCommand,
      commandDescription: toolCallRequest.commandDescription,
      ...(toolCallRequest.workingDirectoryPath ? { workingDirectoryPath: toolCallRequest.workingDirectoryPath } : {}),
      ...(toolCallRequest.timeoutMilliseconds ? { timeoutMilliseconds: toolCallRequest.timeoutMilliseconds } : {}),
    };
  }
  if (toolCallRequest.toolName === "read") {
    return {
      toolName: "read",
      readFilePath: toolCallRequest.readTargetPath,
    };
  }
  if (toolCallRequest.toolName === "glob") {
    return {
      toolName: "glob",
      globPattern: toolCallRequest.globPattern,
      ...(toolCallRequest.searchDirectoryPath ? { searchDirectoryPath: toolCallRequest.searchDirectoryPath } : {}),
    };
  }

  return {
    toolName: "grep",
    searchPattern: toolCallRequest.regexPattern,
  };
}

function mapToolResultEntryToToolCallStatus(
  conversationSessionEntry: ToolResultConversationSessionEntry,
): AssistantToolCallPartStatus {
  if (conversationSessionEntry.entryKind === "completed_tool_result") {
    return "completed";
  }

  if (conversationSessionEntry.entryKind === "denied_tool_result") {
    return "denied";
  }

  return "failed";
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
