import { expect, test } from "bun:test";
import type { ConversationSessionSummary, PendingToolApprovalRequest } from "@buli/contracts";
import type { PromptContextCandidate } from "@buli/prompt-context-core";
import {
  applyChatSessionKeyboardInputToChatSessionState,
  appendPromptImageAttachmentToDraft,
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

const deleteKeyboardInput = {
  keyName: "delete",
  textInput: undefined,
  isCtrlPressed: false,
  isMetaPressed: false,
} as const satisfies ChatSessionKeyboardInput;

const backspaceKeyboardInput = {
  keyName: "backspace",
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

test("applyChatSessionKeyboardInputToChatSessionState_cycles_from_plan_to_implementation_with_tab", () => {
  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState: {
      ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
      selectedAssistantOperatingMode: "plan",
    },
    chatSessionKeyboardInput: {
      keyName: "tab",
      textInput: undefined,
      isCtrlPressed: false,
      isMetaPressed: false,
    },
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.selectedAssistantOperatingMode).toBe("implementation");
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
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
    submittedAssistantOperatingMode: "understand",
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
    buildChatSlashCommands({ reasoningSummaryDisplayMode: "expanded" }),
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
      description: "Show available commands and shortcuts",
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

test("applyChatSessionKeyboardInputToChatSessionState_returns_selected_session_delete_effect", () => {
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
    chatSessionKeyboardInput: deleteKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState).toBe(chatSessionState);
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "request_conversation_session_deletion",
    conversationSessionId: "session-a",
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_uses_backspace_for_selected_session_delete_effect", () => {
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
    chatSessionKeyboardInput: backspaceKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "request_conversation_session_deletion",
    conversationSessionId: "session-a",
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_does_not_delete_the_only_empty_session", () => {
  const conversationSessions = [
    {
      sessionId: "session-empty",
      title: "New session",
      createdAtMs: 1,
      updatedAtMs: 1,
      conversationSessionEntryCount: 0,
    },
  ] as const satisfies readonly ConversationSessionSummary[];
  const chatSessionState = showAvailableConversationSessionsForSelection(
    createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationSessions,
    "session-empty",
  );

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: deleteKeyboardInput,
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
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

test("applyChatSessionKeyboardInputToChatSessionState_edits_prompt_draft_while_streaming", () => {
  const chatSessionState: ChatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "next prompt"),
    conversationTurnStatus: "streaming_assistant_response",
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: createTextKeyboardInput("x"),
    isPromptSubmissionInFlight: false,
  });

  expect(interaction.nextChatSessionState.promptDraft).toBe("next promptx");
  expect(interaction.nextChatSessionState.promptDraftCursorOffset).toBe("next promptx".length);
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});

test("applyChatSessionKeyboardInputToChatSessionState_returns_enqueue_effect_while_streaming", () => {
  const promptImageAttachment = {
    attachmentId: "image-1",
    mimeType: "image/png" as const,
    dataUrl: "data:image/png;base64,aGVsbG8=",
  };
  const chatSessionState: ChatSessionState = {
    ...appendPromptImageAttachmentToDraft(
      insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "Run this next "),
      promptImageAttachment,
    ),
    conversationTurnStatus: "streaming_assistant_response",
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: enterKeyboardInput,
    isPromptSubmissionInFlight: true,
  });

  expect(interaction.nextChatSessionState.conversationTurnStatus).toBe("streaming_assistant_response");
  expect(interaction.nextChatSessionState.promptDraft).toBe("");
  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "enqueue_submitted_prompt",
    submittedPromptText: "Run this next [Image 1]",
    submittedPromptImageAttachments: [promptImageAttachment],
    submittedAssistantOperatingMode: "understand",
  });
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});

test("applyChatSessionKeyboardInputToChatSessionState_captures_selected_mode_for_queued_prompt", () => {
  const chatSessionState: ChatSessionState = {
    ...insertTextIntoPromptDraftAtCursor(createInitialChatSessionState({ selectedModelId: "gpt-5.4" }), "Plan this next"),
    conversationTurnStatus: "streaming_assistant_response",
    selectedAssistantOperatingMode: "plan",
  };

  const interaction = applyChatSessionKeyboardInputToChatSessionState({
    chatSessionState,
    chatSessionKeyboardInput: enterKeyboardInput,
    isPromptSubmissionInFlight: true,
  });

  expect(interaction.chatSessionKeyboardEffect).toEqual({
    effectType: "enqueue_submitted_prompt",
    submittedPromptText: "Plan this next",
    submittedPromptImageAttachments: [],
    submittedAssistantOperatingMode: "plan",
  });
});

test("applyChatSessionKeyboardInputToChatSessionState_cycles_assistant_operating_mode_while_streaming", () => {
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

  expect(interaction.nextChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});

test("applyChatSessionKeyboardInputToChatSessionState_cycles_assistant_operating_mode_during_tool_approval", () => {
  const chatSessionState: ChatSessionState = {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    conversationTurnStatus: "waiting_for_tool_approval",
    pendingToolApprovalRequest: {
      approvalId: "approval-1",
      pendingToolCallId: "call-1",
      pendingToolCallDetail: { toolName: "bash", commandLine: "pwd" },
      riskExplanation: "Prints the working directory.",
    },
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

  expect(interaction.nextChatSessionState.selectedAssistantOperatingMode).toBe("plan");
  expect(interaction.chatSessionKeyboardEffect).toBeUndefined();
  expect(interaction.shouldConsumeKeyboardInput).toBe(true);
});
