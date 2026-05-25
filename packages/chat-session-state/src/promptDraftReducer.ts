import { randomUUID } from "node:crypto";
import type {
  ConversationMessage,
  ConversationMessagePart,
  UserPromptImageAttachment,
} from "@buli/contracts";
import {
  extractActivePromptContextQueryFromPromptDraft,
  reconcileSelectedPromptContextReferenceTextsWithPromptDraft,
} from "@buli/prompt-context-core";
import type { ChatSessionState } from "./chatSessionState.ts";
import type { PendingPromptImageAttachment, PendingPromptTextPaste } from "./chatSessionState.ts";

type PromptImageAttachmentPlaceholderRange = {
  pendingPromptImageAttachment: PendingPromptImageAttachment;
  startOffset: number;
  endOffset: number;
};

type PromptTextPastePlaceholderRange = {
  pendingPromptTextPaste: PendingPromptTextPaste;
  startOffset: number;
  endOffset: number;
};

type ReconciledPromptImageAttachments = {
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments: PendingPromptImageAttachment[];
};

type ReconciledPromptTextPastes = {
  pendingPromptTextPastes: PendingPromptTextPaste[];
};

export type SubmittedUserPrompt = {
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
};

export type PromptDraftSubmission = {
  nextChatSessionState: ChatSessionState;
  submittedPromptText: string | undefined;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
};

function createPromptDraftEditedState(input: {
  chatSessionState: ChatSessionState;
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments?: readonly PendingPromptImageAttachment[];
  pendingPromptTextPastes?: readonly PendingPromptTextPaste[];
}): ChatSessionState {
  const reconciledPromptImageAttachments = reconcilePendingPromptImageAttachmentsWithPromptDraft({
    promptDraft: input.promptDraft,
    promptDraftCursorOffset: input.promptDraftCursorOffset,
    pendingPromptImageAttachments: input.pendingPromptImageAttachments ?? input.chatSessionState.pendingPromptImageAttachments,
  });
  const reconciledPromptTextPastes = reconcilePendingPromptTextPastesWithPromptDraft({
    promptDraft: reconciledPromptImageAttachments.promptDraft,
    pendingPromptTextPastes: input.pendingPromptTextPastes ?? input.chatSessionState.pendingPromptTextPastes,
  });
  return {
    ...input.chatSessionState,
    promptDraft: reconciledPromptImageAttachments.promptDraft,
    promptDraftCursorOffset: reconciledPromptImageAttachments.promptDraftCursorOffset,
    pendingPromptImageAttachments: reconciledPromptImageAttachments.pendingPromptImageAttachments,
    pendingPromptTextPastes: reconciledPromptTextPastes.pendingPromptTextPastes,
    selectedPromptContextReferenceTexts: reconcileSelectedPromptContextReferenceTextsWithPromptDraft({
      promptDraft: reconciledPromptImageAttachments.promptDraft,
      selectedPromptContextReferenceTexts: input.chatSessionState.selectedPromptContextReferenceTexts,
    }),
  };
}

function appendConversationMessage(input: {
  chatSessionState: ChatSessionState;
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
}): ChatSessionState {
  const appendedConversationMessagePartsById = input.conversationMessageParts.reduce<Record<string, ConversationMessagePart>>(
    (conversationMessagePartsById, conversationMessagePart) => ({
      ...conversationMessagePartsById,
      [conversationMessagePart.id]: conversationMessagePart,
    }),
    {},
  );
  const appendedConversationMessagePartCount = Object.keys(appendedConversationMessagePartsById).filter(
    (conversationMessagePartId) => !input.chatSessionState.conversationMessagePartsById[conversationMessagePartId],
  ).length;

  return {
    ...input.chatSessionState,
    conversationMessagesById: {
      ...input.chatSessionState.conversationMessagesById,
      [input.conversationMessage.id]: input.conversationMessage,
    },
    conversationMessagePartsById: {
      ...input.chatSessionState.conversationMessagePartsById,
      ...appendedConversationMessagePartsById,
    },
    orderedConversationMessageIds: [...input.chatSessionState.orderedConversationMessageIds, input.conversationMessage.id],
    conversationMessagePartCount: input.chatSessionState.conversationMessagePartCount + appendedConversationMessagePartCount,
  };
}

export function appendPromptImageAttachmentToDraft(
  chatSessionState: ChatSessionState,
  promptImageAttachment: UserPromptImageAttachment,
): ChatSessionState {
  const promptDraftPlaceholderText = `[Image ${chatSessionState.pendingPromptImageAttachments.length + 1}]`;
  const promptDraftInsertedText = `${promptDraftPlaceholderText} `;
  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset);
  const promptImageAttachmentInsertionIndex = listPendingPromptImageAttachmentPlaceholderRanges(chatSessionState).filter(
    (placeholderRange) => placeholderRange.startOffset < chatSessionState.promptDraftCursorOffset,
  ).length;
  const pendingPromptImageAttachment: PendingPromptImageAttachment = {
    attachment: promptImageAttachment,
    promptDraftPlaceholderText,
  };
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft: `${promptDraftPrefix}${promptDraftInsertedText}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset + promptDraftInsertedText.length,
    pendingPromptImageAttachments: [
      ...chatSessionState.pendingPromptImageAttachments.slice(0, promptImageAttachmentInsertionIndex),
      pendingPromptImageAttachment,
      ...chatSessionState.pendingPromptImageAttachments.slice(promptImageAttachmentInsertionIndex),
    ],
  });
}

export function removeLastPromptImageAttachmentFromDraft(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.pendingPromptImageAttachments.length === 0) {
    return chatSessionState;
  }

  const lastPlaceholderRange = listPendingPromptImageAttachmentPlaceholderRanges(chatSessionState).at(-1);
  if (!lastPlaceholderRange) {
    return {
      ...chatSessionState,
      pendingPromptImageAttachments: chatSessionState.pendingPromptImageAttachments.slice(0, -1),
    };
  }

  return removePromptImageAttachmentPlaceholderRange(chatSessionState, lastPlaceholderRange);
}

export function removePromptImageAttachmentPlaceholderBeforeCursor(chatSessionState: ChatSessionState): ChatSessionState {
  const promptDraftCursorOffset = clampPromptDraftCursorOffset(chatSessionState);
  const promptImageAttachmentPlaceholderRange = listPendingPromptImageAttachmentPlaceholderRanges(chatSessionState).find(
    (placeholderRange) => {
      const placeholderRemovalEndOffset = promptImageAttachmentPlaceholderRemovalEndOffset(
        chatSessionState.promptDraft,
        placeholderRange,
      );
      return promptDraftCursorOffset > placeholderRange.startOffset && promptDraftCursorOffset <= placeholderRemovalEndOffset;
    },
  );
  if (!promptImageAttachmentPlaceholderRange) {
    return chatSessionState;
  }

  return removePromptImageAttachmentPlaceholderRange(chatSessionState, promptImageAttachmentPlaceholderRange);
}

export function removePromptImageAttachmentPlaceholderAtCursor(chatSessionState: ChatSessionState): ChatSessionState {
  const promptDraftCursorOffset = clampPromptDraftCursorOffset(chatSessionState);
  const promptImageAttachmentPlaceholderRange = listPendingPromptImageAttachmentPlaceholderRanges(chatSessionState).find(
    (placeholderRange) =>
      promptDraftCursorOffset >= placeholderRange.startOffset && promptDraftCursorOffset < placeholderRange.endOffset,
  );
  if (!promptImageAttachmentPlaceholderRange) {
    return chatSessionState;
  }

  return removePromptImageAttachmentPlaceholderRange(chatSessionState, promptImageAttachmentPlaceholderRange);
}

export function insertTextIntoPromptDraftAtCursor(chatSessionState: ChatSessionState, insertedText: string): ChatSessionState {
  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset);
  const promptDraft = `${promptDraftPrefix}${insertedText}${promptDraftSuffix}`;
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset + insertedText.length,
  });
}

export function insertSummarizedPastedTextIntoPromptDraft(input: {
  chatSessionState: ChatSessionState;
  pastedText: string;
  replacementStartOffset?: number;
  replacementEndOffset?: number;
}): ChatSessionState {
  const promptDraftReplacementRange = clampPromptDraftReplacementRange({
    promptDraft: input.chatSessionState.promptDraft,
    replacementStartOffset: input.replacementStartOffset ?? input.chatSessionState.promptDraftCursorOffset,
    replacementEndOffset: input.replacementEndOffset ?? input.replacementStartOffset ?? input.chatSessionState.promptDraftCursorOffset,
  });
  const promptDraftPrefix = input.chatSessionState.promptDraft.slice(0, promptDraftReplacementRange.startOffset);
  const promptDraftSuffix = input.chatSessionState.promptDraft.slice(promptDraftReplacementRange.endOffset);
  const promptDraftWithoutReplacement = `${promptDraftPrefix}${promptDraftSuffix}`;
  const promptDraftPlaceholderText = createAvailablePromptTextPastePlaceholder({
    pastedText: input.pastedText,
    promptDraft: promptDraftWithoutReplacement,
  });
  const promptDraftInsertedText = `${promptDraftPlaceholderText} `;

  return createPromptDraftEditedState({
    chatSessionState: input.chatSessionState,
    promptDraft: `${promptDraftPrefix}${promptDraftInsertedText}${promptDraftSuffix}`,
    promptDraftCursorOffset: promptDraftReplacementRange.startOffset + promptDraftInsertedText.length,
    pendingPromptTextPastes: [
      ...input.chatSessionState.pendingPromptTextPastes,
      {
        pastedText: input.pastedText,
        promptDraftPlaceholderText,
      },
    ],
  });
}

export function replacePromptDraftFromEditor(input: {
  chatSessionState: ChatSessionState;
  promptDraft: string;
  promptDraftCursorOffset: number;
}): ChatSessionState {
  const promptDraftCursorOffset = Math.max(0, Math.min(input.promptDraftCursorOffset, input.promptDraft.length));
  if (
    input.chatSessionState.promptDraft === input.promptDraft &&
    input.chatSessionState.promptDraftCursorOffset === promptDraftCursorOffset
  ) {
    return input.chatSessionState;
  }

  return createPromptDraftEditedState({
    chatSessionState: input.chatSessionState,
    promptDraft: input.promptDraft,
    promptDraftCursorOffset,
  });
}

function reconcilePendingPromptTextPastesWithPromptDraft(input: {
  promptDraft: string;
  pendingPromptTextPastes: readonly PendingPromptTextPaste[];
}): ReconciledPromptTextPastes {
  return {
    pendingPromptTextPastes: listPendingPromptTextPastePlaceholderRanges(input).map(
      (placeholderRange) => placeholderRange.pendingPromptTextPaste,
    ),
  };
}

function listPendingPromptTextPastePlaceholderRanges(input: {
  promptDraft: string;
  pendingPromptTextPastes: readonly PendingPromptTextPaste[];
}): PromptTextPastePlaceholderRange[] {
  return input.pendingPromptTextPastes
    .flatMap((pendingPromptTextPaste): PromptTextPastePlaceholderRange[] => {
      const startOffset = input.promptDraft.indexOf(pendingPromptTextPaste.promptDraftPlaceholderText);
      if (startOffset === -1) {
        return [];
      }

      return [{
        pendingPromptTextPaste,
        startOffset,
        endOffset: startOffset + pendingPromptTextPaste.promptDraftPlaceholderText.length,
      }];
    })
    .sort((left, right) => left.startOffset - right.startOffset);
}

function expandPendingPromptTextPastes(chatSessionState: ChatSessionState): string {
  return listPendingPromptTextPastePlaceholderRanges({
    promptDraft: chatSessionState.promptDraft,
    pendingPromptTextPastes: chatSessionState.pendingPromptTextPastes,
  })
    .sort((left, right) => right.startOffset - left.startOffset)
    .reduce(
      (expandedPromptDraft, placeholderRange) =>
        expandedPromptDraft.slice(0, placeholderRange.startOffset) +
        placeholderRange.pendingPromptTextPaste.pastedText +
        expandedPromptDraft.slice(placeholderRange.endOffset),
      chatSessionState.promptDraft,
    );
}

function createAvailablePromptTextPastePlaceholder(input: { pastedText: string; promptDraft: string }): string {
  const pastedTextLineCount = countPromptTextPasteLines(input.pastedText);
  const promptTextPastePlaceholderBase = `[Pasted ~${pastedTextLineCount} lines]`;
  if (!input.promptDraft.includes(promptTextPastePlaceholderBase)) {
    return promptTextPastePlaceholderBase;
  }

  let duplicatePromptTextPastePlaceholderIndex = 2;
  while (true) {
    const promptTextPastePlaceholderCandidate = `[Pasted ~${pastedTextLineCount} lines #${duplicatePromptTextPastePlaceholderIndex}]`;
    if (!input.promptDraft.includes(promptTextPastePlaceholderCandidate)) {
      return promptTextPastePlaceholderCandidate;
    }

    duplicatePromptTextPastePlaceholderIndex += 1;
  }
}

function countPromptTextPasteLines(pastedText: string): number {
  return (pastedText.match(/\n/g)?.length ?? 0) + 1;
}

function clampPromptDraftReplacementRange(input: {
  promptDraft: string;
  replacementStartOffset: number;
  replacementEndOffset: number;
}): { startOffset: number; endOffset: number } {
  const promptDraftLength = input.promptDraft.length;
  const lowerReplacementOffset = Math.min(input.replacementStartOffset, input.replacementEndOffset);
  const upperReplacementOffset = Math.max(input.replacementStartOffset, input.replacementEndOffset);
  return {
    startOffset: Math.max(0, Math.min(lowerReplacementOffset, promptDraftLength)),
    endOffset: Math.max(0, Math.min(upperReplacementOffset, promptDraftLength)),
  };
}

function reconcilePendingPromptImageAttachmentsWithPromptDraft(input: {
  promptDraft: string;
  promptDraftCursorOffset: number;
  pendingPromptImageAttachments: readonly PendingPromptImageAttachment[];
}): ReconciledPromptImageAttachments {
  const promptImageAttachmentPlaceholderRanges: PromptImageAttachmentPlaceholderRange[] = [];
  let searchStartOffset = 0;

  for (const pendingPromptImageAttachment of input.pendingPromptImageAttachments) {
    const placeholderStartOffset = input.promptDraft.indexOf(
      pendingPromptImageAttachment.promptDraftPlaceholderText,
      searchStartOffset,
    );
    if (placeholderStartOffset === -1) {
      continue;
    }

    promptImageAttachmentPlaceholderRanges.push({
      pendingPromptImageAttachment,
      startOffset: placeholderStartOffset,
      endOffset: placeholderStartOffset + pendingPromptImageAttachment.promptDraftPlaceholderText.length,
    });
    searchStartOffset = placeholderStartOffset + pendingPromptImageAttachment.promptDraftPlaceholderText.length;
  }

  return renumberPromptImageAttachmentPlaceholders({
    promptDraft: input.promptDraft,
    promptDraftCursorOffset: input.promptDraftCursorOffset,
    promptImageAttachmentPlaceholderRanges,
  });
}

function renumberPromptImageAttachmentPlaceholders(input: {
  promptDraft: string;
  promptDraftCursorOffset: number;
  promptImageAttachmentPlaceholderRanges: readonly PromptImageAttachmentPlaceholderRange[];
}): ReconciledPromptImageAttachments {
  if (input.promptImageAttachmentPlaceholderRanges.length === 0) {
    return {
      promptDraft: input.promptDraft,
      promptDraftCursorOffset: Math.max(0, Math.min(input.promptDraftCursorOffset, input.promptDraft.length)),
      pendingPromptImageAttachments: [],
    };
  }

  let nextPromptDraft = "";
  let copiedPromptDraftOffset = 0;
  let accumulatedLengthDelta = 0;
  const originalPromptDraftCursorOffset = Math.max(0, Math.min(input.promptDraftCursorOffset, input.promptDraft.length));
  let promptDraftCursorOffset = originalPromptDraftCursorOffset;
  const pendingPromptImageAttachments = input.promptImageAttachmentPlaceholderRanges.map((placeholderRange, index) => {
    const nextPlaceholderText = `[Image ${index + 1}]`;
    const originalPlaceholderText = input.promptDraft.slice(placeholderRange.startOffset, placeholderRange.endOffset);
    const replacementLengthDelta = nextPlaceholderText.length - originalPlaceholderText.length;
    const adjustedStartOffset = placeholderRange.startOffset + accumulatedLengthDelta;
    if (originalPromptDraftCursorOffset > placeholderRange.endOffset) {
      promptDraftCursorOffset += replacementLengthDelta;
    } else if (originalPromptDraftCursorOffset >= placeholderRange.startOffset) {
      promptDraftCursorOffset = adjustedStartOffset + Math.min(
        originalPromptDraftCursorOffset - placeholderRange.startOffset,
        nextPlaceholderText.length,
      );
    }

    nextPromptDraft += input.promptDraft.slice(copiedPromptDraftOffset, placeholderRange.startOffset);
    nextPromptDraft += nextPlaceholderText;
    copiedPromptDraftOffset = placeholderRange.endOffset;
    accumulatedLengthDelta += replacementLengthDelta;

    return {
      attachment: placeholderRange.pendingPromptImageAttachment.attachment,
      promptDraftPlaceholderText: nextPlaceholderText,
    };
  });

  nextPromptDraft += input.promptDraft.slice(copiedPromptDraftOffset);
  return {
    promptDraft: nextPromptDraft,
    promptDraftCursorOffset: Math.max(0, Math.min(promptDraftCursorOffset, nextPromptDraft.length)),
    pendingPromptImageAttachments,
  };
}

function listPendingPromptImageAttachmentPlaceholderRanges(
  chatSessionState: ChatSessionState,
): PromptImageAttachmentPlaceholderRange[] {
  const placeholderRanges: PromptImageAttachmentPlaceholderRange[] = [];
  let searchStartOffset = 0;

  for (const pendingPromptImageAttachment of chatSessionState.pendingPromptImageAttachments) {
    const startOffset = chatSessionState.promptDraft.indexOf(
      pendingPromptImageAttachment.promptDraftPlaceholderText,
      searchStartOffset,
    );
    if (startOffset === -1) {
      continue;
    }

    const endOffset = startOffset + pendingPromptImageAttachment.promptDraftPlaceholderText.length;
    placeholderRanges.push({
      pendingPromptImageAttachment,
      startOffset,
      endOffset,
    });
    searchStartOffset = endOffset;
  }

  return placeholderRanges;
}

function removePromptImageAttachmentPlaceholderRange(
  chatSessionState: ChatSessionState,
  placeholderRange: PromptImageAttachmentPlaceholderRange,
): ChatSessionState {
  const placeholderRemovalEndOffset = promptImageAttachmentPlaceholderRemovalEndOffset(
    chatSessionState.promptDraft,
    placeholderRange,
  );
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft:
      chatSessionState.promptDraft.slice(0, placeholderRange.startOffset) +
      chatSessionState.promptDraft.slice(placeholderRemovalEndOffset),
    promptDraftCursorOffset: placeholderRange.startOffset,
    pendingPromptImageAttachments: chatSessionState.pendingPromptImageAttachments.filter(
      (pendingPromptImageAttachment) => pendingPromptImageAttachment !== placeholderRange.pendingPromptImageAttachment,
    ),
  });
}

function promptImageAttachmentPlaceholderRemovalEndOffset(
  promptDraft: string,
  placeholderRange: PromptImageAttachmentPlaceholderRange,
): number {
  return promptDraft[placeholderRange.endOffset] === " " ? placeholderRange.endOffset + 1 : placeholderRange.endOffset;
}

function clampPromptDraftCursorOffset(chatSessionState: ChatSessionState): number {
  return Math.max(0, Math.min(chatSessionState.promptDraftCursorOffset, chatSessionState.promptDraft.length));
}

export function movePromptDraftCursorLeft(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: Math.max(0, chatSessionState.promptDraftCursorOffset - 1),
  };
}

export function movePromptDraftCursorRight(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: Math.min(chatSessionState.promptDraft.length, chatSessionState.promptDraftCursorOffset + 1),
  };
}

export function movePromptDraftCursorToStart(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: 0,
  };
}

export function movePromptDraftCursorToEnd(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraftCursorOffset: chatSessionState.promptDraft.length,
  };
}

export function removePromptDraftCharacterBeforeCursor(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptDraftCursorOffset === 0) {
    return chatSessionState;
  }

  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset - 1);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset);
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft: `${promptDraftPrefix}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset - 1,
  });
}

export function removePromptDraftCharacterAtCursor(chatSessionState: ChatSessionState): ChatSessionState {
  if (chatSessionState.promptDraftCursorOffset >= chatSessionState.promptDraft.length) {
    return chatSessionState;
  }

  const promptDraftPrefix = chatSessionState.promptDraft.slice(0, chatSessionState.promptDraftCursorOffset);
  const promptDraftSuffix = chatSessionState.promptDraft.slice(chatSessionState.promptDraftCursorOffset + 1);
  return createPromptDraftEditedState({
    chatSessionState,
    promptDraft: `${promptDraftPrefix}${promptDraftSuffix}`,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset,
  });
}

export function submitPromptDraft(chatSessionState: ChatSessionState): PromptDraftSubmission {
  const submittedUserPrompt = readSubmittablePromptDraft(chatSessionState);
  if (
    !submittedUserPrompt ||
    chatSessionState.conversationTurnStatus !== "waiting_for_user_input" ||
    chatSessionState.promptContextSelectionState.step !== "hidden" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden"
  ) {
    return { nextChatSessionState: chatSessionState, submittedPromptText: undefined, submittedPromptImageAttachments: [] };
  }

  return {
    submittedPromptText: submittedUserPrompt.submittedPromptText,
    submittedPromptImageAttachments: submittedUserPrompt.submittedPromptImageAttachments,
    nextChatSessionState: appendSubmittedUserPromptToConversation({
      chatSessionState: clearSubmittedPromptDraft(chatSessionState),
      submittedPromptText: submittedUserPrompt.submittedPromptText,
      submittedPromptImageAttachments: submittedUserPrompt.submittedPromptImageAttachments,
    }),
  };
}

export function queuePromptDraftForLaterSubmission(chatSessionState: ChatSessionState): PromptDraftSubmission {
  const submittedUserPrompt = readSubmittablePromptDraft(chatSessionState);
  if (
    !submittedUserPrompt ||
    chatSessionState.conversationTurnStatus !== "streaming_assistant_response" ||
    chatSessionState.promptContextSelectionState.step !== "hidden" ||
    chatSessionState.modelAndReasoningSelectionState.step !== "hidden"
  ) {
    return { nextChatSessionState: chatSessionState, submittedPromptText: undefined, submittedPromptImageAttachments: [] };
  }

  return {
    submittedPromptText: submittedUserPrompt.submittedPromptText,
    submittedPromptImageAttachments: submittedUserPrompt.submittedPromptImageAttachments,
    nextChatSessionState: clearSubmittedPromptDraft(chatSessionState),
  };
}

function readSubmittablePromptDraft(chatSessionState: ChatSessionState): SubmittedUserPrompt | undefined {
  const submittedPromptText = expandPendingPromptTextPastes(chatSessionState).trim();
  const submittedPromptImageAttachments = chatSessionState.pendingPromptImageAttachments.map(
    (pendingPromptImageAttachment) => pendingPromptImageAttachment.attachment,
  );

  if (submittedPromptText.length === 0 && submittedPromptImageAttachments.length === 0) {
    return undefined;
  }

  return {
    submittedPromptText,
    submittedPromptImageAttachments,
  };
}

function clearSubmittedPromptDraft(chatSessionState: ChatSessionState): ChatSessionState {
  return {
    ...chatSessionState,
    promptDraft: "",
    promptDraftCursorOffset: 0,
    pendingPromptImageAttachments: [],
    pendingPromptTextPastes: [],
    promptContextSelectionState: { step: "hidden" },
    selectedPromptContextReferenceTexts: [],
  };
}

export function appendSubmittedUserPromptToConversation(input: {
  chatSessionState: ChatSessionState;
  submittedPromptText: string;
  submittedPromptImageAttachments: readonly UserPromptImageAttachment[];
}): ChatSessionState {
  const userMessageId = `user-${randomUUID()}`;
  const userTextConversationMessagePart = input.submittedPromptText.length > 0
    ? {
        id: `user-text-${randomUUID()}`,
        partKind: "user_text" as const,
        text: input.submittedPromptText,
      }
    : undefined;
  const userImageAttachmentConversationMessageParts = input.submittedPromptImageAttachments.map((attachment) => ({
    id: `user-image-${randomUUID()}`,
    partKind: "user_image_attachment" as const,
    attachment,
  }));
  const userConversationMessageParts = [
    ...(userTextConversationMessagePart ? [userTextConversationMessagePart] : []),
    ...userImageAttachmentConversationMessageParts,
  ];
  const submittedAtMs = Date.now();
  const userConversationMessage: ConversationMessage = {
    id: userMessageId,
    role: "user",
    messageStatus: "completed",
    createdAtMs: submittedAtMs,
    partIds: userConversationMessageParts.map((conversationMessagePart) => conversationMessagePart.id),
  };

  return appendConversationMessage({
    chatSessionState: {
      ...input.chatSessionState,
      conversationTurnStatus: "streaming_assistant_response",
      latestTokenUsage: undefined,
      latestContextWindowUsage: undefined,
      pendingToolApprovalRequest: undefined,
    },
    conversationMessage: userConversationMessage,
    conversationMessageParts: userConversationMessageParts,
  });
}

export function getActivePromptContextQueryText(chatSessionState: ChatSessionState): string | undefined {
  return extractActivePromptContextQueryFromPromptDraft(
    chatSessionState.promptDraft,
    chatSessionState.promptDraftCursorOffset,
  )?.decodedQueryText;
}
