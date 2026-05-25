import type { BuliDiagnosticLogFields } from "@buli/contracts";
import type { ConversationSessionCompactionStatus } from "@buli/chat-app-controller";
import type { ChatSessionState, ReasoningSummaryDisplayMode } from "@buli/chat-session-state";
import type { TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { AssistantOperatingMode, ConversationTurnStatus, ReasoningEffort } from "@buli/contracts";

type ChatScreenSelectionDiagnosticState = Pick<
  ChatSessionState,
  | "conversationSessionSelectionState"
  | "modelAndReasoningSelectionState"
  | "promptContextSelectionState"
  | "slashCommandSelectionState"
  | "isCommandHelpModalVisible"
>;

export function buildChatScreenRenderSnapshotDiagnosticFields(input: {
  chatSessionState: ChatSessionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  orderedConversationMessageCount: number;
  renderedConversationMessageCount: number;
  hiddenOlderConversationMessageCount: number;
  orderedConversationMessagePartCount: number;
  renderedConversationMessagePartCount: number;
  queuedPromptCount: number;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
}): BuliDiagnosticLogFields {
  return {
    rows: input.terminalRowCount,
    columns: input.terminalColumnCount,
    terminalSizeTier: input.terminalSizeTierForChatScreen,
    conversationTurnStatus: input.chatSessionState.conversationTurnStatus,
    conversationSessionSelectionStep: input.chatSessionState.conversationSessionSelectionState.step,
    conversationCompactionStep: input.conversationSessionCompactionStatus.step,
    conversationCompactionSource: input.conversationSessionCompactionStatus.step === "compacting"
      ? input.conversationSessionCompactionStatus.source
      : null,
    selectedAssistantOperatingMode: input.chatSessionState.selectedAssistantOperatingMode,
    selectedModelId: input.chatSessionState.selectedModelId,
    selectedModelDefaultReasoningEffort: input.chatSessionState.selectedModelDefaultReasoningEffort ?? null,
    selectedReasoningEffort: input.chatSessionState.selectedReasoningEffort ?? null,
    promptDraftLength: input.chatSessionState.promptDraft.length,
    queuedPromptCount: input.queuedPromptCount,
    selectedPromptContextReferenceCount: input.chatSessionState.selectedPromptContextReferenceTexts.length,
    conversationMessageCount: input.orderedConversationMessageCount,
    renderedConversationMessageCount: input.renderedConversationMessageCount,
    hiddenOlderConversationMessageCount: input.hiddenOlderConversationMessageCount,
    conversationMessagePartCount: input.orderedConversationMessagePartCount,
    renderedConversationMessagePartCount: input.renderedConversationMessagePartCount,
    hasPendingToolApprovalRequest: input.chatSessionState.pendingToolApprovalRequest !== undefined,
    promptContextSelectionStep: input.chatSessionState.promptContextSelectionState.step,
    slashCommandSelectionStep: input.chatSessionState.slashCommandSelectionState.step,
    modelSelectionStep: input.chatSessionState.modelAndReasoningSelectionState.step,
    isCommandHelpModalVisible: input.chatSessionState.isCommandHelpModalVisible,
    reasoningSummaryDisplayMode: input.chatSessionState.reasoningSummaryDisplayMode,
    totalContextTokensUsed: input.totalContextTokensUsed ?? null,
    contextWindowTokenCapacity: input.contextWindowTokenCapacity ?? null,
  };
}

export function buildChatScreenTranscriptRenderDiagnosticFields(input: {
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  orderedConversationMessageCount: number;
  renderedConversationMessageCount: number;
  hiddenOlderConversationMessageCount: number;
  orderedConversationMessagePartCount: number;
  renderedConversationMessagePartCount: number;
  interactionViewModelBuildDurationMs?: number | undefined;
  transcriptViewModelBuildDurationMs?: number | undefined;
}): BuliDiagnosticLogFields {
  return {
    rows: input.terminalRowCount,
    columns: input.terminalColumnCount,
    terminalSizeTier: input.terminalSizeTierForChatScreen,
    conversationMessageCount: input.orderedConversationMessageCount,
    renderedConversationMessageCount: input.renderedConversationMessageCount,
    hiddenOlderConversationMessageCount: input.hiddenOlderConversationMessageCount,
    conversationMessagePartCount: input.orderedConversationMessagePartCount,
    renderedConversationMessagePartCount: input.renderedConversationMessagePartCount,
    ...(input.interactionViewModelBuildDurationMs !== undefined
      ? { interactionViewModelBuildDurationMs: input.interactionViewModelBuildDurationMs }
      : {}),
    ...(input.transcriptViewModelBuildDurationMs !== undefined
      ? { transcriptViewModelBuildDurationMs: input.transcriptViewModelBuildDurationMs }
      : {}),
  };
}

export function buildChatScreenPromptRenderDiagnosticFields(input: {
  conversationTurnStatus: ConversationTurnStatus;
  selectedAssistantOperatingMode: AssistantOperatingMode;
  selectedModelId: string;
  selectedModelDefaultReasoningEffort: ReasoningEffort | undefined;
  selectedReasoningEffort: ReasoningEffort | undefined;
  promptDraftLength: number;
  pendingPromptImageAttachmentCount: number;
  selectedPromptContextReferenceCount: number;
  queuedPromptCount: number;
  totalContextTokensUsed: number | undefined;
  contextWindowTokenCapacity: number | undefined;
}): BuliDiagnosticLogFields {
  return {
    conversationTurnStatus: input.conversationTurnStatus,
    selectedAssistantOperatingMode: input.selectedAssistantOperatingMode,
    selectedModelId: input.selectedModelId,
    selectedModelDefaultReasoningEffort: input.selectedModelDefaultReasoningEffort ?? null,
    selectedReasoningEffort: input.selectedReasoningEffort ?? null,
    promptDraftLength: input.promptDraftLength,
    pendingPromptImageAttachmentCount: input.pendingPromptImageAttachmentCount,
    selectedPromptContextReferenceCount: input.selectedPromptContextReferenceCount,
    queuedPromptCount: input.queuedPromptCount,
    totalContextTokensUsed: input.totalContextTokensUsed ?? null,
    contextWindowTokenCapacity: input.contextWindowTokenCapacity ?? null,
  };
}

export function buildChatScreenInteractionStatusDiagnosticFields(input: {
  conversationTurnStatus: ConversationTurnStatus;
  selectionState: ChatScreenSelectionDiagnosticState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  hasPendingToolApprovalRequest: boolean;
  reasoningSummaryDisplayMode: ReasoningSummaryDisplayMode;
}): BuliDiagnosticLogFields {
  return {
    conversationTurnStatus: input.conversationTurnStatus,
    conversationSessionSelectionStep: input.selectionState.conversationSessionSelectionState.step,
    conversationCompactionStep: input.conversationSessionCompactionStatus.step,
    conversationCompactionSource: input.conversationSessionCompactionStatus.step === "compacting"
      ? input.conversationSessionCompactionStatus.source
      : null,
    hasPendingToolApprovalRequest: input.hasPendingToolApprovalRequest,
    promptContextSelectionStep: input.selectionState.promptContextSelectionState.step,
    slashCommandSelectionStep: input.selectionState.slashCommandSelectionState.step,
    modelSelectionStep: input.selectionState.modelAndReasoningSelectionState.step,
    isCommandHelpModalVisible: input.selectionState.isCommandHelpModalVisible,
    reasoningSummaryDisplayMode: input.reasoningSummaryDisplayMode,
  };
}
