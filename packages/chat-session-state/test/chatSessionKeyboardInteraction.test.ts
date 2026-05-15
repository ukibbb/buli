import { expect, test } from "bun:test";
import type { ConversationSessionSummary, PendingToolApprovalRequest } from "@buli/contracts";
import type { PromptContextCandidate } from "@buli/engine";
import {
  applyChatSessionKeyboardInputToChatSessionState,
  buildChatSlashCommands,
  createInitialChatSessionState,
  insertTextIntoPromptDraftAtCursor,
  refreshSlashCommandSelectionForPromptDraft,
  showAvailableConversationSessionsForSelection,
  showPromptContextCandidatesForSelection,
  type ChatSessionState,
  type ChatSessionKeyboardInput,
} from "../src/index.ts";

const enterKeyboardInput = {
  keyName: "return",
  textInput: undefined,
  isCtrlPressed: false,
  isMetaPressed: false,
} as const satisfies ChatSessionKeyboardInput;

const escapeKeyboardInput = {
  keyName: "escape",
  textInput: undefined,
  isCtrlPressed: false,
  isMetaPressed: false,
} as const satisfies ChatSessionKeyboardInput;

function createTextKeyboardInput(textInput: string): ChatSessionKeyboardInput {
  return {
    keyName: undefined,
    textInput,
    isCtrlPressed: false,
    isMetaPressed: false,
  };
}

test("applyChatSessionKeyboardInputToChatSessionState_cycles_assistant_operating_mode_with_tab", () => {
  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState: createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    chatSessionKeyboardInput: {
      keyName: "tab",
      textInput: undefined,
      isCtrlPressed: false,
      isMetaPressed: false,
    },
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
});

test("applyChatSessionKeyboardInputToChatSessionState_returns_submit_effect_for_submitted_prompt", () => {
  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState: insertTextIntoPromptDraftAtCursor(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      "Tell me what changed",
    ),
    chatSessionKeyboardInput: enterKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "stream_assistant_response_for_submitted_prompt",
    submittedPromptText: "Tell me what changed",
    submittedPromptImageAttachments: [],
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_rejects_duplicate_prompt_submission", () => {
  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState: insertTextIntoPromptDraftAtCursor(
      createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      "Submit once",
    ),
    chatSessionKeyboardInput: enterKeyboardInput,
    isPromptSubmissionInFlight: true,
  });

  expect(interaction.nextChatSessionState.promptDraft).toBe("Submit once");
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
  expect(interaction.promptSubmissionRejectionReason).toBe("prompt_submission_already_in_flight");
});

test("applyChatSessionKeyboardInputToChatSessionState_returns_selected_slash_command_effect", () => {
  const chatSessionState = refreshSlashCommandSelectionForPromptDraft(
    insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "/help"),
    buildChatSlashCommands({ isReasoningSummaryVisible: true, selectedAssistantOperatingMode: "implementation" }),
  );

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: enterKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.promptDraft).toBe("");
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "execute_selected_slash_command",
    selectedSlashCommand: {
      name: "help",
      value: "help",
      description: "Show available commands",
    },
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_returns_selected_session_switch_effect", () => {
  const conversationSessions = [
    {
      sessionId: "session-a",
      title: "First session",
      createdAtMs: 1,
      updatedAtMs: 2,
      conversationSessionEntryCount: 2,
    },
  ] as const satisfies readonly ConversationSessionSummary[];
  const chatSessionState = showAvailableConversationSessionsForSelection(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessions,
    undefined,
  );

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: enterKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.conversationSessionSelectionState).toEqual({ step: "hidden" });
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "switch_to_selected_conversation_session",
    conversationSessionId: "session-a",
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_dismisses_prompt_context_query_on_escape", () => {
  const promptContextCandidates = [
    {
      kind: "file",
      displayPath: "packages/tui/src/ChatScreen.tsx",
      promptReferenceText: "@packages/tui/src/ChatScreen.tsx",
    },
  ] as const satisfies readonly PromptContextCandidate[];
  const chatSessionStateWithPromptContextQuery = showPromptContextCandidatesForSelection(
    insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "@packages"),
    "packages",
    promptContextCandidates,
  );

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState: chatSessionStateWithPromptContextQuery,
    chatSessionKeyboardInput: escapeKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.promptContextSelectionState).toEqual({ step: "hidden" });
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "dismiss_active_prompt_context_query",
    dismissedPromptContextQueryIdentity: {
      promptContextQueryStartOffset: 0,
      promptContextRawQueryText: "packages",
    },
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_returns_keyboard_tool_approval_effects", () => {
  const pendingToolApprovalRequest = {
    approvalId: "approval-1",
    pendingToolCallId: "call-1",
    pendingToolCallDetail: { toolName: "bash", commandLine: "rm -rf build" },
    riskExplanation: "This command deletes files.",
  } as const satisfies PendingToolApprovalRequest;
  const chatSessionState: ChatSessionState = {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationTurnStatus: "waiting_for_tool_approval",
    pendingToolApprovalRequest,
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: createTextKeyboardInput("y"),
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "submit_pending_tool_approval_decision",
    decision: "approved",
    source: "keyboard",
  });
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});

test("applyChatSessionKeyboardInputToChatSessionState_returns_interrupt_effect_on_escape_while_streaming", () => {
  const chatSessionState: ChatSessionState = {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationTurnStatus: "streaming_assistant_response",
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: escapeKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "active_conversation_turn_interrupt_key_pressed",
  });
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});

test("applyChatSessionKeyboardInputToChatSessionState_ignores_prompt_edits_while_streaming", () => {
  const chatSessionState: ChatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "next prompt"),
    conversationTurnStatus: "streaming_assistant_response",
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: createTextKeyboardInput("x"),
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.promptDraft).toBe("next prompt");
  expect(interaction.nextChatSessionState.promptDraftCursorOffset).toBe("next prompt".length);
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});

test("applyChatSessionKeyboardInputToChatSessionState_does_not_cycle_mode_while_streaming", () => {
  const chatSessionState: ChatSessionState = {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationTurnStatus: "streaming_assistant_response",
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: {
      keyName: "tab",
      textInput: undefined,
      isCtrlPressed: false,
      isMetaPressed: false,
    },
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.selectedAssistantOperatingMode).toBe("implementation");
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});
