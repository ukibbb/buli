import {
  createStartedToolCallDetailFromRequest,
  type AssistantToolCallConversationMessagePart,
  type AssistantTextPartStatus,
  type ConversationMessage,
  type ConversationMessagePart,
  type ConversationSessionEntry,
  type ToolCallDetail,
} from "@buli/contracts";
import type { ChatSessionState } from "./chatSessionState.ts";

type ToolResultConversationSessionEntry = Extract<
  ConversationSessionEntry,
  { entryKind: "completed_tool_result" | "failed_tool_result" | "denied_tool_result" }
>;

type HydratedConversationTranscript = {
  conversationMessagesById: Record<string, ConversationMessage>;
  conversationMessagePartsById: Record<string, ConversationMessagePart>;
  orderedConversationMessageIds: string[];
  conversationMessagePartCount: number;
};

type HydratedToolResultPartBase = {
  id: string;
  toolCallId: string;
  toolCallStartedAtMs: number;
  toolCallDetail: ToolCallDetail;
};

const INTERRUPTED_TOOL_CALL_ERROR_TEXT = "Tool call was interrupted before a result was recorded.";

export function clearConversationTranscript(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    conversationTurnStatus: "waiting_for_user_input",
    promptDraft: "",
    promptDraftCursorOffset: 0,
    pendingPromptImageAttachments: [],
    latestTokenUsage: undefined,
    latestContextWindowUsage: undefined,
    conversationMessagesById: {},
    conversationMessagePartsById: {},
    orderedConversationMessageIds: [],
    conversationMessagePartCount: 0,
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
    conversationMessagePartCount: hydratedConversationTranscript.conversationMessagePartCount,
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

    // This private builder owns draft messages, so local mutation avoids quadratic copies during large-session hydration.
    conversationMessage.partIds.push(conversationMessagePart.id);
    conversationMessagePartsById[conversationMessagePart.id] = conversationMessagePart;
  };
  const updateAssistantTextPartStatuses = (messageId: string, partStatus: AssistantTextPartStatus): void => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return;
    }

    for (const partId of conversationMessage.partIds) {
      const conversationMessagePart = conversationMessagePartsById[partId];
      if (!conversationMessagePart || conversationMessagePart.partKind !== "assistant_text") {
        continue;
      }

      conversationMessagePartsById[partId] = {
        ...conversationMessagePart,
        partStatus,
      };
    }
  };
  const hasAssistantRenderedContentPart = (messageId: string): boolean => {
    const conversationMessage = conversationMessagesById[messageId];
    if (!conversationMessage) {
      return false;
    }

    return conversationMessage.partIds.some((partId) => {
      const conversationMessagePart = conversationMessagePartsById[partId];
      return conversationMessagePart?.partKind === "assistant_text" ||
        conversationMessagePart?.partKind === "assistant_code_execution_walkthrough";
    });
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
        id: interruptedToolCallPart.id,
        partKind: "assistant_tool_call",
        toolCallId: interruptedToolCallPart.toolCallId,
        toolCallStatus: "interrupted",
        toolCallStartedAtMs: interruptedToolCallPart.toolCallStartedAtMs,
        toolCallDetail: interruptedToolCallPart.toolCallDetail,
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
      if (conversationSessionEntry.promptSource === "auto_compaction_continue") {
        return;
      }

      const userMessageId = `persisted-entry-${entryIndex}-user`;
      const userTextPartId = `persisted-entry-${entryIndex}-user-text`;
      appendConversationMessage({
        id: userMessageId,
        role: "user",
        messageStatus: "completed",
        createdAtMs: entryIndex,
        partIds: [],
      });
      if (conversationSessionEntry.promptText.length > 0) {
        appendConversationMessagePart(userMessageId, {
          id: userTextPartId,
          partKind: "user_text",
          text: conversationSessionEntry.promptText,
        });
      }
      for (const [imageAttachmentIndex, imageAttachment] of (conversationSessionEntry.imageAttachments ?? []).entries()) {
        appendConversationMessagePart(userMessageId, {
          id: `persisted-entry-${entryIndex}-user-image-${imageAttachmentIndex}`,
          partKind: "user_image_attachment",
          attachment: imageAttachment,
        });
      }
      return;
    }

    if (conversationSessionEntry.entryKind === "conversation_compaction_summary") {
      markDanglingHydratedToolCallsAsInterrupted(entryIndex);
      currentAssistantMessageId = undefined;
      toolCallPartIdByToolCallId.clear();
      const compactionMessageId = `persisted-entry-${entryIndex}-compaction`;
      appendConversationMessage({
        id: compactionMessageId,
        role: "assistant",
        messageStatus: "completed",
        createdAtMs: entryIndex,
        partIds: [],
      });
      appendConversationMessagePart(compactionMessageId, {
        id: `persisted-entry-${entryIndex}-compaction-summary`,
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: [`**Context compacted**`, "", conversationSessionEntry.summaryText].join("\n"),
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_text_segment") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      appendConversationMessagePart(assistantMessageId, {
        id: `persisted-entry-${entryIndex}-assistant-text-segment`,
        partKind: "assistant_text",
        partStatus: "completed",
        rawMarkdownText: conversationSessionEntry.assistantTextSegmentText,
      });
      return;
    }

    if (conversationSessionEntry.entryKind === "assistant_code_execution_walkthrough_segment") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      appendConversationMessagePart(assistantMessageId, {
        id: `persisted-entry-${entryIndex}-assistant-code-execution-walkthrough`,
        partKind: "assistant_code_execution_walkthrough",
        titleText: conversationSessionEntry.titleText,
        ...(conversationSessionEntry.summaryText !== undefined ? { summaryText: conversationSessionEntry.summaryText } : {}),
        walkthroughKind: conversationSessionEntry.walkthroughKind,
        steps: conversationSessionEntry.steps.map((walkthroughStep) => ({
          stepTitle: walkthroughStep.stepTitle,
          ...(walkthroughStep.whenText !== undefined ? { whenText: walkthroughStep.whenText } : {}),
          whatHappensText: walkthroughStep.whatHappensText,
          ...(walkthroughStep.dataStateText !== undefined ? { dataStateText: walkthroughStep.dataStateText } : {}),
          ...(walkthroughStep.decisionText !== undefined ? { decisionText: walkthroughStep.decisionText } : {}),
          ...(walkthroughStep.stateChangeText !== undefined ? { stateChangeText: walkthroughStep.stateChangeText } : {}),
          ...(walkthroughStep.nextStepText !== undefined ? { nextStepText: walkthroughStep.nextStepText } : {}),
          codeExamples: walkthroughStep.codeExamples.map((codeExample) => ({
            sourceFilePath: codeExample.sourceFilePath,
            ...(codeExample.sourceSymbolName !== undefined ? { sourceSymbolName: codeExample.sourceSymbolName } : {}),
            startLineNumber: codeExample.startLineNumber,
            endLineNumber: codeExample.endLineNumber,
            ...(codeExample.languageLabel !== undefined ? { languageLabel: codeExample.languageLabel } : {}),
            codeText: codeExample.codeText,
            ...(codeExample.explanationText !== undefined ? { explanationText: codeExample.explanationText } : {}),
            ...(codeExample.lineExplanations !== undefined ? { lineExplanations: codeExample.lineExplanations } : {}),
          })),
        })),
      });
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
        toolCallDetail: createStartedToolCallDetailFromRequest(conversationSessionEntry.toolCallRequest),
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

    if (conversationSessionEntry.entryKind === "workspace_patch") {
      const assistantMessageId = ensureAssistantConversationMessage(entryIndex);
      appendConversationMessagePart(assistantMessageId, {
        id: `persisted-entry-${entryIndex}-workspace-patch`,
        partKind: "assistant_workspace_patch",
        workspacePatch: conversationSessionEntry.workspacePatch,
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

      if (conversationSessionEntry.assistantMessageText.length > 0 && !hasAssistantRenderedContentPart(assistantMessageId)) {
        appendConversationMessagePart(assistantMessageId, {
          id: `persisted-entry-${entryIndex}-assistant-text`,
          partKind: "assistant_text",
          partStatus: conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
          rawMarkdownText: conversationSessionEntry.assistantMessageText,
        });
      }
      updateAssistantTextPartStatuses(
        assistantMessageId,
        conversationSessionEntry.assistantMessageStatus satisfies AssistantTextPartStatus,
      );

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
    conversationMessagePartCount: Object.keys(conversationMessagePartsById).length,
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
  const existingToolCallPartId = input.toolCallPartIdByToolCallId.get(input.conversationSessionEntry.toolCallId);
  const existingToolCallPart = existingToolCallPartId
    ? input.conversationMessagePartsById[existingToolCallPartId]
    : undefined;

  if (existingToolCallPart?.partKind === "assistant_tool_call") {
    input.conversationMessagePartsById[existingToolCallPart.id] = buildHydratedToolResultConversationMessagePart({
      conversationSessionEntry: input.conversationSessionEntry,
      hydratedToolResultPartBase: {
        id: existingToolCallPart.id,
        toolCallId: existingToolCallPart.toolCallId,
        toolCallStartedAtMs: existingToolCallPart.toolCallStartedAtMs,
        toolCallDetail: input.conversationSessionEntry.toolCallDetail,
      },
      durationMs: input.entryIndex - existingToolCallPart.toolCallStartedAtMs,
    });
    return;
  }

  const toolCallPartId = `persisted-entry-${input.entryIndex}-tool-result`;
  input.toolCallPartIdByToolCallId.set(input.conversationSessionEntry.toolCallId, toolCallPartId);
  input.appendConversationMessagePart(
    input.assistantMessageId,
    buildHydratedToolResultConversationMessagePart({
      conversationSessionEntry: input.conversationSessionEntry,
      hydratedToolResultPartBase: {
        id: toolCallPartId,
        toolCallId: input.conversationSessionEntry.toolCallId,
        toolCallStartedAtMs: input.entryIndex,
        toolCallDetail: input.conversationSessionEntry.toolCallDetail,
      },
      durationMs: 0,
    }),
  );
}

function buildHydratedToolResultConversationMessagePart(input: {
  conversationSessionEntry: ToolResultConversationSessionEntry;
  hydratedToolResultPartBase: HydratedToolResultPartBase;
  durationMs: number;
}): AssistantToolCallConversationMessagePart {
  const commonHydratedToolCallPartFields = {
    id: input.hydratedToolResultPartBase.id,
    partKind: "assistant_tool_call" as const,
    toolCallId: input.hydratedToolResultPartBase.toolCallId,
    toolCallStartedAtMs: input.hydratedToolResultPartBase.toolCallStartedAtMs,
    toolCallDetail: input.hydratedToolResultPartBase.toolCallDetail,
  };

  if (input.conversationSessionEntry.entryKind === "completed_tool_result") {
    return {
      ...commonHydratedToolCallPartFields,
      toolCallStatus: "completed",
      durationMs: Math.max(0, input.durationMs),
    };
  }

  if (input.conversationSessionEntry.entryKind === "failed_tool_result") {
    return {
      ...commonHydratedToolCallPartFields,
      toolCallStatus: "failed",
      errorText: input.conversationSessionEntry.failureExplanation,
      durationMs: Math.max(0, input.durationMs),
    };
  }

  return {
    ...commonHydratedToolCallPartFields,
    toolCallStatus: "denied",
    denialText: input.conversationSessionEntry.denialExplanation,
    durationMs: Math.max(0, input.durationMs),
  };
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
