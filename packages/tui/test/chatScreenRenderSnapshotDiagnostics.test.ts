import { expect, test } from "bun:test";
import { createInitialChatSessionState, type ChatSessionState } from "@buli/chat-session-state";
import {
  buildChatScreenInteractionStatusDiagnosticFields,
  buildChatScreenPromptRenderDiagnosticFields,
  buildChatScreenRenderSnapshotDiagnosticFields,
  buildChatScreenTranscriptRenderDiagnosticFields,
} from "../src/behavior/chatScreenRenderSnapshotDiagnostics.ts";

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
      reasoningSummaryDisplayMode: "collapsed",
    }),
    conversationSessionCompactionStatus: { step: "compacting", source: "auto" },
    terminalRowCount: 24,
    terminalColumnCount: 120,
    terminalSizeTierForChatScreen: "comfortable",
    orderedConversationMessageCount: 2,
    renderedConversationMessageCount: 2,
    hiddenOlderConversationMessageCount: 0,
    orderedConversationMessagePartCount: 5,
    renderedConversationMessagePartCount: 4,
    queuedPromptCount: 2,
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
    queuedPromptCount: 2,
    selectedPromptContextReferenceCount: 1,
    conversationMessageCount: 2,
    renderedConversationMessageCount: 2,
    hiddenOlderConversationMessageCount: 0,
    conversationMessagePartCount: 5,
    renderedConversationMessagePartCount: 4,
    hasPendingToolApprovalRequest: true,
    promptContextSelectionStep: "showing_prompt_context_candidates",
    slashCommandSelectionStep: "showing_slash_commands",
    modelSelectionStep: "loading_available_models",
    isCommandHelpModalVisible: true,
    reasoningSummaryDisplayMode: "collapsed",
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
      renderedConversationMessagePartCount: 0,
      queuedPromptCount: 0,
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

test("split render diagnostic builders keep transcript, prompt, and status fields separate", () => {
  expect(
    buildChatScreenTranscriptRenderDiagnosticFields({
      terminalRowCount: 24,
      terminalColumnCount: 120,
      terminalSizeTierForChatScreen: "comfortable",
      orderedConversationMessageCount: 10,
      renderedConversationMessageCount: 4,
      hiddenOlderConversationMessageCount: 6,
      orderedConversationMessagePartCount: 18,
      renderedConversationMessagePartCount: 7,
    }),
  ).toEqual({
    rows: 24,
    columns: 120,
    terminalSizeTier: "comfortable",
    conversationMessageCount: 10,
    renderedConversationMessageCount: 4,
    hiddenOlderConversationMessageCount: 6,
    conversationMessagePartCount: 18,
    renderedConversationMessagePartCount: 7,
  });

  expect(
    buildChatScreenPromptRenderDiagnosticFields({
      conversationTurnStatus: "streaming_assistant_response",
      selectedAssistantOperatingMode: "implementation",
      selectedModelId: "gpt-5.5",
      selectedModelDefaultReasoningEffort: undefined,
      selectedReasoningEffort: "high",
      promptDraftLength: 12,
      pendingPromptImageAttachmentCount: 1,
      selectedPromptContextReferenceCount: 2,
      queuedPromptCount: 3,
      totalContextTokensUsed: undefined,
      contextWindowTokenCapacity: 400_000,
    }),
  ).toMatchObject({
    conversationTurnStatus: "streaming_assistant_response",
    selectedAssistantOperatingMode: "implementation",
    selectedModelDefaultReasoningEffort: null,
    selectedReasoningEffort: "high",
    queuedPromptCount: 3,
    totalContextTokensUsed: null,
  });

  expect(
    buildChatScreenInteractionStatusDiagnosticFields({
      conversationTurnStatus: "waiting_for_user_input",
      selectionState: createChatSessionState({ isCommandHelpModalVisible: true }),
      conversationSessionCompactionStatus: { step: "idle" },
      hasPendingToolApprovalRequest: false,
      reasoningSummaryDisplayMode: "expanded",
    }),
  ).toMatchObject({
    conversationTurnStatus: "waiting_for_user_input",
    conversationCompactionStep: "idle",
    conversationCompactionSource: null,
    isCommandHelpModalVisible: true,
    reasoningSummaryDisplayMode: "expanded",
  });
});

test("buildChatScreenTranscriptRenderDiagnosticFields includes build durations when supplied", () => {
  expect(
    buildChatScreenTranscriptRenderDiagnosticFields({
      terminalRowCount: 24,
      terminalColumnCount: 120,
      terminalSizeTierForChatScreen: "comfortable",
      orderedConversationMessageCount: 10,
      renderedConversationMessageCount: 4,
      hiddenOlderConversationMessageCount: 6,
      orderedConversationMessagePartCount: 18,
      renderedConversationMessagePartCount: 7,
      interactionViewModelBuildDurationMs: 3,
      transcriptViewModelBuildDurationMs: 5,
    }),
  ).toMatchObject({
    interactionViewModelBuildDurationMs: 3,
    transcriptViewModelBuildDurationMs: 5,
  });
});
