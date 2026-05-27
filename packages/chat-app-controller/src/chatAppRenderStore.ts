import type { ConversationMessage, ConversationMessagePart } from "@buli/contracts";
import { canChatSessionPromptDraftBeEdited, type ChatSessionState } from "@buli/chat-session-state";
import {
  isConversationSessionCompactionBlockingPromptInput,
  type ConversationSessionCompactionStatus,
  type ConversationSessionExportStatus,
} from "./conversationSessionStatus.ts";

export type ChatAppRenderStoreListener = () => void;

export type ChatAppRenderStoreChangeSet = {
  changedConversationMessageIds: readonly string[];
  didConversationMessageOrderChange: boolean;
  didTranscriptGlobalStateChange: boolean;
  didPromptComposerStateChange: boolean;
  didInteractionStatusStateChange: boolean;
};

export type ChatAppRenderStoreStateReplacement = {
  nextChatSessionState: ChatSessionState;
  changeSet: ChatAppRenderStoreChangeSet;
};

export type ChatAppQueuedPromptPreview = {
  queuedPromptId: string;
  submittedPromptText: string;
  submittedPromptImageAttachmentCount: number;
};

export type ChatAppControllerChromeRenderState = {
  conversationSessionExportStatus: ConversationSessionExportStatus;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  queuedPromptCount: number;
  queuedPromptPreviews: readonly ChatAppQueuedPromptPreview[];
  isActiveTurnInterruptConfirmationArmed: boolean;
  isInitialConversationSessionHydrationPending: boolean;
};

export type ChatAppControllerChromeRenderStateReplacement = {
  nextControllerChromeRenderState: ChatAppControllerChromeRenderState;
};

export type ChatAppConversationMessageRowSnapshot = {
  conversationMessage: ConversationMessage;
  conversationMessageParts: readonly ConversationMessagePart[];
};

export type ChatAppTranscriptRenderSnapshot = Pick<
  ChatSessionState,
  | "conversationMessagesById"
  | "conversationMessagePartsById"
  | "orderedConversationMessageIds"
  | "conversationMessagePartCount"
  | "reasoningSummaryDisplayMode"
  | "isCommandHelpModalVisible"
>;

export type ChatAppPromptComposerRenderSnapshot = Pick<
  ChatSessionState,
  | "conversationTurnStatus"
  | "promptDraft"
  | "promptDraftCursorOffset"
  | "pendingPromptImageAttachments"
  | "pendingPromptTextPastes"
  | "selectedPromptContextReferenceTexts"
  | "selectedAssistantOperatingMode"
  | "selectedModelId"
  | "selectedModelDefaultReasoningEffort"
  | "selectedReasoningEffort"
  | "latestContextWindowUsage"
> & Pick<
  ChatAppControllerChromeRenderState,
  | "conversationSessionCompactionStatus"
  | "queuedPromptCount"
  | "queuedPromptPreviews"
  | "isActiveTurnInterruptConfirmationArmed"
  | "isInitialConversationSessionHydrationPending"
> & {
  isPromptInputDisabled: boolean;
};

export type ChatAppInteractionStatusRenderSnapshot = Pick<
  ChatSessionState,
  | "conversationTurnStatus"
  | "pendingToolApprovalRequest"
  | "conversationSessionSelectionState"
  | "modelAndReasoningSelectionState"
  | "slashCommandSelectionState"
  | "promptContextSelectionState"
  | "isCommandHelpModalVisible"
> & Pick<
  ChatAppControllerChromeRenderState,
  | "conversationSessionExportStatus"
  | "conversationSessionCompactionStatus"
  | "queuedPromptCount"
  | "queuedPromptPreviews"
>;

export type ChatAppTranscriptAuxiliaryRenderSnapshot = Pick<
  ChatSessionState,
  "pendingToolApprovalRequest" | "latestContextWindowUsage" | "selectedModelId"
> & Pick<ChatAppControllerChromeRenderState, "conversationSessionCompactionStatus" | "queuedPromptCount">;

export type ChatAppRenderStore = {
  readChatSessionState: () => ChatSessionState;
  readControllerChromeRenderState: () => ChatAppControllerChromeRenderState;
  readConversationMessageRowSnapshot: (conversationMessageId: string) => ChatAppConversationMessageRowSnapshot | undefined;
  subscribeConversationMessageRow: (
    conversationMessageId: string,
    listener: ChatAppRenderStoreListener,
  ) => () => void;
  readTranscriptSnapshot: () => ChatAppTranscriptRenderSnapshot;
  subscribeTranscript: (listener: ChatAppRenderStoreListener) => () => void;
  readPromptComposerSnapshot: () => ChatAppPromptComposerRenderSnapshot;
  subscribePromptComposer: (listener: ChatAppRenderStoreListener) => () => void;
  readInteractionStatusSnapshot: () => ChatAppInteractionStatusRenderSnapshot;
  subscribeInteractionStatus: (listener: ChatAppRenderStoreListener) => () => void;
  readTranscriptAuxiliarySnapshot: () => ChatAppTranscriptAuxiliaryRenderSnapshot;
  subscribeTranscriptAuxiliary: (listener: ChatAppRenderStoreListener) => () => void;
  replaceChatSessionState: (replacement: ChatAppRenderStoreStateReplacement) => void;
  replaceControllerChromeRenderState: (replacement: ChatAppControllerChromeRenderStateReplacement) => void;
};

export function buildChatAppRenderStoreChangeSetFromChatSessionStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): ChatAppRenderStoreChangeSet {
  if (input.previousChatSessionState === input.nextChatSessionState) {
    return createEmptyChatAppRenderStoreChangeSet();
  }

  return {
    changedConversationMessageIds: listChangedConversationMessageRowIds(input),
    didConversationMessageOrderChange:
      input.previousChatSessionState.orderedConversationMessageIds !== input.nextChatSessionState.orderedConversationMessageIds,
    didTranscriptGlobalStateChange: didTranscriptRenderStateChange(input),
    didPromptComposerStateChange: didPromptComposerRenderStateChange(input),
    didInteractionStatusStateChange: didInteractionStatusRenderStateChange(input),
  };
}

export function createChatAppRenderStore(input: {
  initialChatSessionState: ChatSessionState;
  initialControllerChromeRenderState?: ChatAppControllerChromeRenderState | undefined;
}): ChatAppRenderStore {
  let currentChatSessionState = input.initialChatSessionState;
  let currentControllerChromeRenderState = input.initialControllerChromeRenderState ??
    createInitialChatAppControllerChromeRenderState();
  const rowSnapshotsByConversationMessageId = new Map<string, ChatAppConversationMessageRowSnapshot>();
  let transcriptSnapshot: ChatAppTranscriptRenderSnapshot | undefined;
  let promptComposerSnapshot: ChatAppPromptComposerRenderSnapshot | undefined;
  let interactionStatusSnapshot: ChatAppInteractionStatusRenderSnapshot | undefined;
  let transcriptAuxiliarySnapshot: ChatAppTranscriptAuxiliaryRenderSnapshot | undefined;

  const rowListenersByConversationMessageId = new Map<string, Set<ChatAppRenderStoreListener>>();
  const transcriptListeners = new Set<ChatAppRenderStoreListener>();
  const promptComposerListeners = new Set<ChatAppRenderStoreListener>();
  const interactionStatusListeners = new Set<ChatAppRenderStoreListener>();
  const transcriptAuxiliaryListeners = new Set<ChatAppRenderStoreListener>();

  return {
    readChatSessionState() {
      return currentChatSessionState;
    },
    readControllerChromeRenderState() {
      return currentControllerChromeRenderState;
    },
    readConversationMessageRowSnapshot(conversationMessageId) {
      const conversationMessage = currentChatSessionState.conversationMessagesById[conversationMessageId];
      if (!conversationMessage) {
        rowSnapshotsByConversationMessageId.delete(conversationMessageId);
        return undefined;
      }

      const conversationMessageParts = listConversationMessageParts({
        chatSessionState: currentChatSessionState,
        conversationMessage,
      });
      const previousSnapshot = rowSnapshotsByConversationMessageId.get(conversationMessageId);
      if (
        previousSnapshot &&
        previousSnapshot.conversationMessage === conversationMessage &&
        areConversationMessagePartReferencesEqual(previousSnapshot.conversationMessageParts, conversationMessageParts)
      ) {
        return previousSnapshot;
      }

      const nextSnapshot = { conversationMessage, conversationMessageParts };
      rowSnapshotsByConversationMessageId.set(conversationMessageId, nextSnapshot);
      return nextSnapshot;
    },
    subscribeConversationMessageRow(conversationMessageId, listener) {
      return subscribeConversationMessageRow({
        rowListenersByConversationMessageId,
        conversationMessageId,
        listener,
      });
    },
    readTranscriptSnapshot() {
      transcriptSnapshot = selectStableTranscriptSnapshot({
        previousSnapshot: transcriptSnapshot,
        nextSnapshot: buildTranscriptSnapshot(currentChatSessionState),
      });
      return transcriptSnapshot;
    },
    subscribeTranscript(listener) {
      return subscribeListener(transcriptListeners, listener);
    },
    readPromptComposerSnapshot() {
      promptComposerSnapshot = selectStablePromptComposerSnapshot({
        previousSnapshot: promptComposerSnapshot,
        nextSnapshot: buildPromptComposerSnapshot(currentChatSessionState, currentControllerChromeRenderState),
      });
      return promptComposerSnapshot;
    },
    subscribePromptComposer(listener) {
      return subscribeListener(promptComposerListeners, listener);
    },
    readInteractionStatusSnapshot() {
      interactionStatusSnapshot = selectStableInteractionStatusSnapshot({
        previousSnapshot: interactionStatusSnapshot,
        nextSnapshot: buildInteractionStatusSnapshot(currentChatSessionState, currentControllerChromeRenderState),
      });
      return interactionStatusSnapshot;
    },
    subscribeInteractionStatus(listener) {
      return subscribeListener(interactionStatusListeners, listener);
    },
    readTranscriptAuxiliarySnapshot() {
      transcriptAuxiliarySnapshot = selectStableTranscriptAuxiliarySnapshot({
        previousSnapshot: transcriptAuxiliarySnapshot,
        nextSnapshot: buildTranscriptAuxiliarySnapshot(currentChatSessionState, currentControllerChromeRenderState),
      });
      return transcriptAuxiliarySnapshot;
    },
    subscribeTranscriptAuxiliary(listener) {
      return subscribeListener(transcriptAuxiliaryListeners, listener);
    },
    replaceChatSessionState(replacement) {
      const previousChatSessionState = currentChatSessionState;
      currentChatSessionState = replacement.nextChatSessionState;
      for (const conversationMessageId of replacement.changeSet.changedConversationMessageIds) {
        rowSnapshotsByConversationMessageId.delete(conversationMessageId);
        notifyListeners(rowListenersByConversationMessageId.get(conversationMessageId));
      }

      if (
        replacement.changeSet.didConversationMessageOrderChange ||
        replacement.changeSet.didTranscriptGlobalStateChange
      ) {
        notifyListeners(transcriptListeners);
      }
      if (replacement.changeSet.didPromptComposerStateChange || replacement.changeSet.didInteractionStatusStateChange) {
        notifyListeners(promptComposerListeners);
      }
      if (replacement.changeSet.didInteractionStatusStateChange) {
        notifyListeners(interactionStatusListeners);
      }
      if (didTranscriptAuxiliaryRenderStateChange({
        previousChatSessionState,
        nextChatSessionState: replacement.nextChatSessionState,
      })) {
        notifyListeners(transcriptAuxiliaryListeners);
      }
    },
    replaceControllerChromeRenderState(replacement) {
      const previousControllerChromeRenderState = currentControllerChromeRenderState;
      currentControllerChromeRenderState = replacement.nextControllerChromeRenderState;
      if (didPromptComposerControllerChromeStateChange({
        previousControllerChromeRenderState,
        nextControllerChromeRenderState: currentControllerChromeRenderState,
      })) {
        notifyListeners(promptComposerListeners);
      }
      if (didInteractionStatusControllerChromeStateChange({
        previousControllerChromeRenderState,
        nextControllerChromeRenderState: currentControllerChromeRenderState,
      })) {
        notifyListeners(interactionStatusListeners);
      }
      if (didTranscriptAuxiliaryControllerChromeStateChange({
        previousControllerChromeRenderState,
        nextControllerChromeRenderState: currentControllerChromeRenderState,
      })) {
        notifyListeners(transcriptAuxiliaryListeners);
      }
    },
  };
}

export function createInitialChatAppControllerChromeRenderState(): ChatAppControllerChromeRenderState {
  return {
    conversationSessionExportStatus: { step: "idle" },
    conversationSessionCompactionStatus: { step: "idle" },
    queuedPromptCount: 0,
    queuedPromptPreviews: [],
    isActiveTurnInterruptConfirmationArmed: false,
    isInitialConversationSessionHydrationPending: false,
  };
}

function createEmptyChatAppRenderStoreChangeSet(): ChatAppRenderStoreChangeSet {
  return {
    changedConversationMessageIds: [],
    didConversationMessageOrderChange: false,
    didTranscriptGlobalStateChange: false,
    didPromptComposerStateChange: false,
    didInteractionStatusStateChange: false,
  };
}

function listChangedConversationMessageRowIds(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): string[] {
  if (
    input.previousChatSessionState.conversationMessagesById === input.nextChatSessionState.conversationMessagesById &&
    input.previousChatSessionState.conversationMessagePartsById === input.nextChatSessionState.conversationMessagePartsById
  ) {
    return [];
  }

  return mergeConversationMessageIds(
    input.previousChatSessionState.orderedConversationMessageIds,
    input.nextChatSessionState.orderedConversationMessageIds,
  ).filter((conversationMessageId) =>
    didConversationMessageRowChange({
      previousChatSessionState: input.previousChatSessionState,
      nextChatSessionState: input.nextChatSessionState,
      conversationMessageId,
    })
  );
}

function didConversationMessageRowChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
  conversationMessageId: string;
}): boolean {
  const previousConversationMessage = input.previousChatSessionState.conversationMessagesById[input.conversationMessageId];
  const nextConversationMessage = input.nextChatSessionState.conversationMessagesById[input.conversationMessageId];
  if (previousConversationMessage !== nextConversationMessage) {
    return true;
  }

  const conversationMessage = nextConversationMessage ?? previousConversationMessage;
  if (!conversationMessage) {
    return false;
  }

  return conversationMessage.partIds.some((conversationMessagePartId) =>
    input.previousChatSessionState.conversationMessagePartsById[conversationMessagePartId] !==
      input.nextChatSessionState.conversationMessagePartsById[conversationMessagePartId]
  );
}

function didTranscriptRenderStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationMessagesById !== input.nextChatSessionState.conversationMessagesById ||
    input.previousChatSessionState.conversationMessagePartsById !== input.nextChatSessionState.conversationMessagePartsById ||
    input.previousChatSessionState.orderedConversationMessageIds !== input.nextChatSessionState.orderedConversationMessageIds ||
    input.previousChatSessionState.conversationMessagePartCount !== input.nextChatSessionState.conversationMessagePartCount ||
    input.previousChatSessionState.reasoningSummaryDisplayMode !== input.nextChatSessionState.reasoningSummaryDisplayMode ||
    input.previousChatSessionState.isCommandHelpModalVisible !== input.nextChatSessionState.isCommandHelpModalVisible;
}

function didPromptComposerRenderStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationTurnStatus !== input.nextChatSessionState.conversationTurnStatus ||
    input.previousChatSessionState.promptDraft !== input.nextChatSessionState.promptDraft ||
    input.previousChatSessionState.promptDraftCursorOffset !== input.nextChatSessionState.promptDraftCursorOffset ||
    input.previousChatSessionState.pendingPromptImageAttachments !== input.nextChatSessionState.pendingPromptImageAttachments ||
    input.previousChatSessionState.pendingPromptTextPastes !== input.nextChatSessionState.pendingPromptTextPastes ||
    input.previousChatSessionState.selectedPromptContextReferenceTexts !== input.nextChatSessionState.selectedPromptContextReferenceTexts ||
    input.previousChatSessionState.selectedAssistantOperatingMode !== input.nextChatSessionState.selectedAssistantOperatingMode ||
    input.previousChatSessionState.selectedModelId !== input.nextChatSessionState.selectedModelId ||
    input.previousChatSessionState.selectedModelDefaultReasoningEffort !== input.nextChatSessionState.selectedModelDefaultReasoningEffort ||
    input.previousChatSessionState.selectedReasoningEffort !== input.nextChatSessionState.selectedReasoningEffort ||
    input.previousChatSessionState.latestContextWindowUsage !== input.nextChatSessionState.latestContextWindowUsage;
}

function didInteractionStatusRenderStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.conversationTurnStatus !== input.nextChatSessionState.conversationTurnStatus ||
    input.previousChatSessionState.pendingToolApprovalRequest !== input.nextChatSessionState.pendingToolApprovalRequest ||
    input.previousChatSessionState.conversationSessionSelectionState !==
      input.nextChatSessionState.conversationSessionSelectionState ||
    input.previousChatSessionState.modelAndReasoningSelectionState !== input.nextChatSessionState.modelAndReasoningSelectionState ||
    input.previousChatSessionState.slashCommandSelectionState !== input.nextChatSessionState.slashCommandSelectionState ||
    input.previousChatSessionState.promptContextSelectionState !== input.nextChatSessionState.promptContextSelectionState ||
    input.previousChatSessionState.isCommandHelpModalVisible !== input.nextChatSessionState.isCommandHelpModalVisible;
}

function didTranscriptAuxiliaryRenderStateChange(input: {
  previousChatSessionState: ChatSessionState;
  nextChatSessionState: ChatSessionState;
}): boolean {
  return input.previousChatSessionState.pendingToolApprovalRequest !== input.nextChatSessionState.pendingToolApprovalRequest ||
    input.previousChatSessionState.latestContextWindowUsage !== input.nextChatSessionState.latestContextWindowUsage ||
    input.previousChatSessionState.selectedModelId !== input.nextChatSessionState.selectedModelId;
}

function didPromptComposerControllerChromeStateChange(input: {
  previousControllerChromeRenderState: ChatAppControllerChromeRenderState;
  nextControllerChromeRenderState: ChatAppControllerChromeRenderState;
}): boolean {
  return input.previousControllerChromeRenderState.conversationSessionCompactionStatus !==
      input.nextControllerChromeRenderState.conversationSessionCompactionStatus ||
    input.previousControllerChromeRenderState.queuedPromptCount !== input.nextControllerChromeRenderState.queuedPromptCount ||
    input.previousControllerChromeRenderState.queuedPromptPreviews !== input.nextControllerChromeRenderState.queuedPromptPreviews ||
    input.previousControllerChromeRenderState.isActiveTurnInterruptConfirmationArmed !==
      input.nextControllerChromeRenderState.isActiveTurnInterruptConfirmationArmed ||
    input.previousControllerChromeRenderState.isInitialConversationSessionHydrationPending !==
      input.nextControllerChromeRenderState.isInitialConversationSessionHydrationPending;
}

function didInteractionStatusControllerChromeStateChange(input: {
  previousControllerChromeRenderState: ChatAppControllerChromeRenderState;
  nextControllerChromeRenderState: ChatAppControllerChromeRenderState;
}): boolean {
  return input.previousControllerChromeRenderState.conversationSessionExportStatus !==
      input.nextControllerChromeRenderState.conversationSessionExportStatus ||
    input.previousControllerChromeRenderState.conversationSessionCompactionStatus !==
      input.nextControllerChromeRenderState.conversationSessionCompactionStatus ||
    input.previousControllerChromeRenderState.queuedPromptCount !== input.nextControllerChromeRenderState.queuedPromptCount ||
    input.previousControllerChromeRenderState.queuedPromptPreviews !== input.nextControllerChromeRenderState.queuedPromptPreviews;
}

function didTranscriptAuxiliaryControllerChromeStateChange(input: {
  previousControllerChromeRenderState: ChatAppControllerChromeRenderState;
  nextControllerChromeRenderState: ChatAppControllerChromeRenderState;
}): boolean {
  return input.previousControllerChromeRenderState.conversationSessionCompactionStatus !==
      input.nextControllerChromeRenderState.conversationSessionCompactionStatus ||
    input.previousControllerChromeRenderState.queuedPromptCount !== input.nextControllerChromeRenderState.queuedPromptCount;
}

function mergeConversationMessageIds(
  previousConversationMessageIds: readonly string[],
  nextConversationMessageIds: readonly string[],
): string[] {
  const mergedConversationMessageIds = [...previousConversationMessageIds];
  const mergedConversationMessageIdSet = new Set(mergedConversationMessageIds);
  for (const conversationMessageId of nextConversationMessageIds) {
    if (!mergedConversationMessageIdSet.has(conversationMessageId)) {
      mergedConversationMessageIds.push(conversationMessageId);
      mergedConversationMessageIdSet.add(conversationMessageId);
    }
  }
  return mergedConversationMessageIds;
}

function listConversationMessageParts(input: {
  chatSessionState: ChatSessionState;
  conversationMessage: ConversationMessage;
}): ConversationMessagePart[] {
  return input.conversationMessage.partIds.flatMap((conversationMessagePartId) => {
    const conversationMessagePart = input.chatSessionState.conversationMessagePartsById[conversationMessagePartId];
    return conversationMessagePart ? [conversationMessagePart] : [];
  });
}

function subscribeConversationMessageRow(input: {
  rowListenersByConversationMessageId: Map<string, Set<ChatAppRenderStoreListener>>;
  conversationMessageId: string;
  listener: ChatAppRenderStoreListener;
}): () => void {
  const conversationMessageRowListeners = input.rowListenersByConversationMessageId.get(input.conversationMessageId) ?? new Set();
  conversationMessageRowListeners.add(input.listener);
  input.rowListenersByConversationMessageId.set(input.conversationMessageId, conversationMessageRowListeners);

  return () => {
    conversationMessageRowListeners.delete(input.listener);
    if (conversationMessageRowListeners.size === 0) {
      input.rowListenersByConversationMessageId.delete(input.conversationMessageId);
    }
  };
}

function subscribeListener(
  listeners: Set<ChatAppRenderStoreListener>,
  listener: ChatAppRenderStoreListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(listeners: Set<ChatAppRenderStoreListener> | undefined): void {
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

function buildTranscriptSnapshot(chatSessionState: ChatSessionState): ChatAppTranscriptRenderSnapshot {
  return {
    conversationMessagesById: chatSessionState.conversationMessagesById,
    conversationMessagePartsById: chatSessionState.conversationMessagePartsById,
    orderedConversationMessageIds: chatSessionState.orderedConversationMessageIds,
    conversationMessagePartCount: chatSessionState.conversationMessagePartCount,
    reasoningSummaryDisplayMode: chatSessionState.reasoningSummaryDisplayMode,
    isCommandHelpModalVisible: chatSessionState.isCommandHelpModalVisible,
  };
}

function buildPromptComposerSnapshot(
  chatSessionState: ChatSessionState,
  controllerChromeRenderState: ChatAppControllerChromeRenderState,
): ChatAppPromptComposerRenderSnapshot {
  return {
    conversationTurnStatus: chatSessionState.conversationTurnStatus,
    promptDraft: chatSessionState.promptDraft,
    promptDraftCursorOffset: chatSessionState.promptDraftCursorOffset,
    pendingPromptImageAttachments: chatSessionState.pendingPromptImageAttachments,
    pendingPromptTextPastes: chatSessionState.pendingPromptTextPastes,
    selectedPromptContextReferenceTexts: chatSessionState.selectedPromptContextReferenceTexts,
    selectedAssistantOperatingMode: chatSessionState.selectedAssistantOperatingMode,
    selectedModelId: chatSessionState.selectedModelId,
    selectedModelDefaultReasoningEffort: chatSessionState.selectedModelDefaultReasoningEffort,
    selectedReasoningEffort: chatSessionState.selectedReasoningEffort,
    latestContextWindowUsage: chatSessionState.latestContextWindowUsage,
    conversationSessionCompactionStatus: controllerChromeRenderState.conversationSessionCompactionStatus,
    queuedPromptCount: controllerChromeRenderState.queuedPromptCount,
    queuedPromptPreviews: controllerChromeRenderState.queuedPromptPreviews,
    isActiveTurnInterruptConfirmationArmed: controllerChromeRenderState.isActiveTurnInterruptConfirmationArmed,
    isInitialConversationSessionHydrationPending: controllerChromeRenderState.isInitialConversationSessionHydrationPending,
    isPromptInputDisabled:
      controllerChromeRenderState.isInitialConversationSessionHydrationPending ||
      isConversationSessionCompactionBlockingPromptInput(controllerChromeRenderState.conversationSessionCompactionStatus) ||
      !canChatSessionPromptDraftBeEdited(chatSessionState),
  };
}

function buildInteractionStatusSnapshot(
  chatSessionState: ChatSessionState,
  controllerChromeRenderState: ChatAppControllerChromeRenderState,
): ChatAppInteractionStatusRenderSnapshot {
  return {
    conversationTurnStatus: chatSessionState.conversationTurnStatus,
    pendingToolApprovalRequest: chatSessionState.pendingToolApprovalRequest,
    conversationSessionSelectionState: chatSessionState.conversationSessionSelectionState,
    modelAndReasoningSelectionState: chatSessionState.modelAndReasoningSelectionState,
    slashCommandSelectionState: chatSessionState.slashCommandSelectionState,
    promptContextSelectionState: chatSessionState.promptContextSelectionState,
    isCommandHelpModalVisible: chatSessionState.isCommandHelpModalVisible,
    conversationSessionExportStatus: controllerChromeRenderState.conversationSessionExportStatus,
    conversationSessionCompactionStatus: controllerChromeRenderState.conversationSessionCompactionStatus,
    queuedPromptCount: controllerChromeRenderState.queuedPromptCount,
    queuedPromptPreviews: controllerChromeRenderState.queuedPromptPreviews,
  };
}

function buildTranscriptAuxiliarySnapshot(
  chatSessionState: ChatSessionState,
  controllerChromeRenderState: ChatAppControllerChromeRenderState,
): ChatAppTranscriptAuxiliaryRenderSnapshot {
  return {
    pendingToolApprovalRequest: chatSessionState.pendingToolApprovalRequest,
    latestContextWindowUsage: chatSessionState.latestContextWindowUsage,
    selectedModelId: chatSessionState.selectedModelId,
    conversationSessionCompactionStatus: controllerChromeRenderState.conversationSessionCompactionStatus,
    queuedPromptCount: controllerChromeRenderState.queuedPromptCount,
  };
}

function selectStableTranscriptSnapshot(input: {
  previousSnapshot: ChatAppTranscriptRenderSnapshot | undefined;
  nextSnapshot: ChatAppTranscriptRenderSnapshot;
}): ChatAppTranscriptRenderSnapshot {
  if (
    input.previousSnapshot &&
    input.previousSnapshot.conversationMessagesById === input.nextSnapshot.conversationMessagesById &&
    input.previousSnapshot.conversationMessagePartsById === input.nextSnapshot.conversationMessagePartsById &&
    input.previousSnapshot.orderedConversationMessageIds === input.nextSnapshot.orderedConversationMessageIds &&
    input.previousSnapshot.conversationMessagePartCount === input.nextSnapshot.conversationMessagePartCount &&
    input.previousSnapshot.reasoningSummaryDisplayMode === input.nextSnapshot.reasoningSummaryDisplayMode &&
    input.previousSnapshot.isCommandHelpModalVisible === input.nextSnapshot.isCommandHelpModalVisible
  ) {
    return input.previousSnapshot;
  }
  return input.nextSnapshot;
}

function selectStablePromptComposerSnapshot(input: {
  previousSnapshot: ChatAppPromptComposerRenderSnapshot | undefined;
  nextSnapshot: ChatAppPromptComposerRenderSnapshot;
}): ChatAppPromptComposerRenderSnapshot {
  if (
    input.previousSnapshot &&
    input.previousSnapshot.conversationTurnStatus === input.nextSnapshot.conversationTurnStatus &&
    input.previousSnapshot.promptDraft === input.nextSnapshot.promptDraft &&
    input.previousSnapshot.promptDraftCursorOffset === input.nextSnapshot.promptDraftCursorOffset &&
    input.previousSnapshot.pendingPromptImageAttachments === input.nextSnapshot.pendingPromptImageAttachments &&
    input.previousSnapshot.pendingPromptTextPastes === input.nextSnapshot.pendingPromptTextPastes &&
    input.previousSnapshot.selectedPromptContextReferenceTexts === input.nextSnapshot.selectedPromptContextReferenceTexts &&
    input.previousSnapshot.selectedAssistantOperatingMode === input.nextSnapshot.selectedAssistantOperatingMode &&
    input.previousSnapshot.selectedModelId === input.nextSnapshot.selectedModelId &&
    input.previousSnapshot.selectedModelDefaultReasoningEffort === input.nextSnapshot.selectedModelDefaultReasoningEffort &&
    input.previousSnapshot.selectedReasoningEffort === input.nextSnapshot.selectedReasoningEffort &&
    input.previousSnapshot.latestContextWindowUsage === input.nextSnapshot.latestContextWindowUsage &&
    input.previousSnapshot.conversationSessionCompactionStatus === input.nextSnapshot.conversationSessionCompactionStatus &&
    input.previousSnapshot.queuedPromptCount === input.nextSnapshot.queuedPromptCount &&
    input.previousSnapshot.queuedPromptPreviews === input.nextSnapshot.queuedPromptPreviews &&
    input.previousSnapshot.isActiveTurnInterruptConfirmationArmed ===
      input.nextSnapshot.isActiveTurnInterruptConfirmationArmed &&
    input.previousSnapshot.isInitialConversationSessionHydrationPending ===
      input.nextSnapshot.isInitialConversationSessionHydrationPending &&
    input.previousSnapshot.isPromptInputDisabled === input.nextSnapshot.isPromptInputDisabled
  ) {
    return input.previousSnapshot;
  }
  return input.nextSnapshot;
}

function selectStableInteractionStatusSnapshot(input: {
  previousSnapshot: ChatAppInteractionStatusRenderSnapshot | undefined;
  nextSnapshot: ChatAppInteractionStatusRenderSnapshot;
}): ChatAppInteractionStatusRenderSnapshot {
  if (
    input.previousSnapshot &&
    input.previousSnapshot.conversationTurnStatus === input.nextSnapshot.conversationTurnStatus &&
    input.previousSnapshot.pendingToolApprovalRequest === input.nextSnapshot.pendingToolApprovalRequest &&
    input.previousSnapshot.conversationSessionSelectionState === input.nextSnapshot.conversationSessionSelectionState &&
    input.previousSnapshot.modelAndReasoningSelectionState === input.nextSnapshot.modelAndReasoningSelectionState &&
    input.previousSnapshot.slashCommandSelectionState === input.nextSnapshot.slashCommandSelectionState &&
    input.previousSnapshot.promptContextSelectionState === input.nextSnapshot.promptContextSelectionState &&
    input.previousSnapshot.isCommandHelpModalVisible === input.nextSnapshot.isCommandHelpModalVisible &&
    input.previousSnapshot.conversationSessionExportStatus === input.nextSnapshot.conversationSessionExportStatus &&
    input.previousSnapshot.conversationSessionCompactionStatus === input.nextSnapshot.conversationSessionCompactionStatus &&
    input.previousSnapshot.queuedPromptCount === input.nextSnapshot.queuedPromptCount &&
    input.previousSnapshot.queuedPromptPreviews === input.nextSnapshot.queuedPromptPreviews
  ) {
    return input.previousSnapshot;
  }
  return input.nextSnapshot;
}

function selectStableTranscriptAuxiliarySnapshot(input: {
  previousSnapshot: ChatAppTranscriptAuxiliaryRenderSnapshot | undefined;
  nextSnapshot: ChatAppTranscriptAuxiliaryRenderSnapshot;
}): ChatAppTranscriptAuxiliaryRenderSnapshot {
  if (
    input.previousSnapshot &&
    input.previousSnapshot.pendingToolApprovalRequest === input.nextSnapshot.pendingToolApprovalRequest &&
    input.previousSnapshot.latestContextWindowUsage === input.nextSnapshot.latestContextWindowUsage &&
    input.previousSnapshot.selectedModelId === input.nextSnapshot.selectedModelId &&
    input.previousSnapshot.conversationSessionCompactionStatus === input.nextSnapshot.conversationSessionCompactionStatus &&
    input.previousSnapshot.queuedPromptCount === input.nextSnapshot.queuedPromptCount
  ) {
    return input.previousSnapshot;
  }
  return input.nextSnapshot;
}

function areConversationMessagePartReferencesEqual(
  previousConversationMessageParts: readonly ConversationMessagePart[],
  nextConversationMessageParts: readonly ConversationMessagePart[],
): boolean {
  if (previousConversationMessageParts.length !== nextConversationMessageParts.length) {
    return false;
  }

  return previousConversationMessageParts.every((previousConversationMessagePart, index) =>
    previousConversationMessagePart === nextConversationMessageParts[index]
  );
}
