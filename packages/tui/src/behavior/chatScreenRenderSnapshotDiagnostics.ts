import type { BuliDiagnosticLogFields } from "@buli/contracts";
import type { ChatSessionState } from "@buli/chat-session-state";
import type { TerminalSizeTierForChatScreen } from "@buli/assistant-design-tokens";
import type { ConversationSessionCompactionStatus } from "./chatScreenConversationSessionStatus.ts";

export function buildChatScreenRenderSnapshotDiagnosticFields(input: {
  chatSessionState: ChatSessionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
  terminalRowCount: number;
  terminalColumnCount: number;
  terminalSizeTierForChatScreen: TerminalSizeTierForChatScreen;
  orderedConversationMessageCount: number;
  orderedConversationMessagePartCount: number;
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
    selectedPromptContextReferenceCount: input.chatSessionState.selectedPromptContextReferenceTexts.length,
    conversationMessageCount: input.orderedConversationMessageCount,
    conversationMessagePartCount: input.orderedConversationMessagePartCount,
    hasPendingToolApprovalRequest: input.chatSessionState.pendingToolApprovalRequest !== undefined,
    promptContextSelectionStep: input.chatSessionState.promptContextSelectionState.step,
    slashCommandSelectionStep: input.chatSessionState.slashCommandSelectionState.step,
    modelSelectionStep: input.chatSessionState.modelAndReasoningSelectionState.step,
    isCommandHelpModalVisible: input.chatSessionState.isCommandHelpModalVisible,
    isReasoningSummaryVisible: input.chatSessionState.isReasoningSummaryVisible,
    totalContextTokensUsed: input.totalContextTokensUsed ?? null,
    contextWindowTokenCapacity: input.contextWindowTokenCapacity ?? null,
  };
}
