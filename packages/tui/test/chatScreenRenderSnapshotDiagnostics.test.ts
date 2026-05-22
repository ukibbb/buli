import { expect, test } from "bun:test";
import { createInitialChatSessionState, type ChatSessionState } from "@buli/chat-session-state";
import { buildChatScreenRenderSnapshotDiagnosticFields } from "../src/behavior/chatScreenRenderSnapshotDiagnostics.ts";

function createChatSessionState(overrides: Partial<ChatSessionState> = {}): ChatSessionState {
  return {
    ...createInitialChatSessionState({
      selectedAssistantOperatingMode: "plan",
      selectedModelId: "gpt-5.4",
      selectedModelDefaultReasoningEffort: "medium",
      selectedReasoningEffort: "high",
    }),
    ...overrides,
  };
}

test("buildChatScreenRenderSnapshotDiagnosticFields summarizes render state without raw prompt context", () => {
  const diagnosticFields = buildChatScreenRenderSnapshotDiagnosticFields({
    chatSessionState: createChatSessionState({
      promptDraft: "secret prompt text",
      selectedPromptContextReferenceTexts: ["secret selected context"],
      pendingToolApprovalRequest: {
        approvalId: "approval-1",
        pendingToolCallId: "call-1",
        pendingToolCallDetail: { toolName: "bash", commandLine: "pwd" },
        riskExplanation: "Runs a command.",
      },
      promptContextSelectionState: {
        step: "showing_prompt_context_candidates",
        promptContextQueryText: "secret-query",
        promptContextCandidates: [],
        highlightedPromptContextCandidateIndex: 0,
      },
      slashCommandSelectionState: {
        step: "showing_slash_commands",
        slashCommandQueryText: "model",
        availableSlashCommands: [{ name: "model", value: "/model", description: "Change model" }],
        highlightedSlashCommandIndex: 0,
      },
      modelAndReasoningSelectionState: { step: "loading_available_models" },
      isCommandHelpModalVisible: true,
      isReasoningSummaryVisible: false,
    }),
    conversationSessionCompactionStatus: { step: "compacting", source: "auto" },
    terminalRowCount: 24,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
    orderedConversationMessageCount: 2,
    renderedConversationMessageCount: 2,
    hiddenOlderConversationMessageCount: 0,
    orderedConversationMessagePartCount: 5,
    totalContextTokensUsed: 123,
    contextWindowTokenCapacity: 400000,
  });

  expect(diagnosticFields).toEqual({
    rows: 24,
    columns: 120,
    terminalSizeTier: "comfortable",
    conversationTurnStatus: "waiting_for_user_input",
    conversationSessionSelectionStep: "hidden",
    conversationCompactionStep: "compacting",
    conversationCompactionSource: "auto",
    selectedAssistantOperatingMode: "plan",
    selectedModelId: "gpt-5.4",
    selectedModelDefaultReasoningEffort: "medium",
    selectedReasoningEffort: "high",
    promptDraftLength: "secret prompt text".length,
    selectedPromptContextReferenceCount: 1,
    conversationMessageCount: 2,
    renderedConversationMessageCount: 2,
    hiddenOlderConversationMessageCount: 0,
    conversationMessagePartCount: 5,
    hasPendingToolApprovalRequest: true,
    promptContextSelectionStep: "showing_prompt_context_candidates",
    slashCommandSelectionStep: "showing_slash_commands",
    modelSelectionStep: "loading_available_models",
    isCommandHelpModalVisible: true,
    isReasoningSummaryVisible: false,
    totalContextTokensUsed: 123,
    contextWindowTokenCapacity: 400000,
  });
  const serializedDiagnosticFields = JSON.stringify(diagnosticFields);
  expect(serializedDiagnosticFields).not.toContain("secret prompt text");
  expect(serializedDiagnosticFields).not.toContain("secret selected context");
  expect(serializedDiagnosticFields).not.toContain("secret-query");
});

test("buildChatScreenRenderSnapshotDiagnosticFields normalizes missing token counts to null", () => {
  expect(
    buildChatScreenRenderSnapshotDiagnosticFields({
      chatSessionState: createChatSessionState({
        selectedModelDefaultReasoningEffort: undefined,
        selectedReasoningEffort: undefined,
      }),
      conversationSessionCompactionStatus: { step: "idle" },
      terminalRowCount: 10,
      terminalColumnCount: 40,
      terminalSizeTierForChatScreen: "minimum",
      orderedConversationMessageCount: 0,
      renderedConversationMessageCount: 0,
      hiddenOlderConversationMessageCount: 0,
      orderedConversationMessagePartCount: 0,
      totalContextTokensUsed: undefined,
      contextWindowTokenCapacity: undefined,
    }),
  ).toMatchObject({
    selectedModelDefaultReasoningEffort: null,
    selectedReasoningEffort: null,
    totalContextTokensUsed: null,
    contextWindowTokenCapacity: null,
    conversationCompactionStep: "idle",
    conversationCompactionSource: null,
  });
});
