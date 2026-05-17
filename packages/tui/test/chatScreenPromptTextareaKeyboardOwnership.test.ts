import { expect, test } from "bun:test";
import {
  createInitialChatSessionState,
  type ChatSessionKeyboardInput,
  type ChatSessionKeyboardKeyName,
  type ChatSessionState,
} from "@buli/chat-session-state";
import {
  canPromptTextareaEditChatScreenInput,
  canPromptTextareaEditChatSessionState,
  isPromptInteractionKeyboardInput,
  shouldPromptTextareaHandleKeyboardInput,
} from "../src/behavior/chatScreenPromptTextareaKeyboardOwnership.ts";

function createChatSessionState(overrides: Partial<ChatSessionState> = {}): ChatSessionState {
  return {
    ...createInitialChatSessionState({ selectedModelId: "gpt-5.4" }),
    ...overrides,
  };
}

function createKeyboardInput(input: {
  keyName?: ChatSessionKeyboardKeyName | undefined;
  textInput?: string | undefined;
}): ChatSessionKeyboardInput {
  return {
    keyName: input.keyName,
    textInput: input.textInput,
    isCtrlPressed: false,
    isMetaPressed: false,
  };
}

function shouldPromptTextareaHandleInput(input: {
  chatSessionState?: ChatSessionState;
  keyName?: ChatSessionKeyboardKeyName | undefined;
  textInput?: string | undefined;
}): boolean {
  return shouldPromptTextareaHandleKeyboardInput({
    chatSessionState: input.chatSessionState ?? createChatSessionState(),
    chatSessionKeyboardInput: createKeyboardInput({ keyName: input.keyName, textInput: input.textInput }),
  });
}

test("prompt textarea owns editing input while the chat session is editable", () => {
  expect(canPromptTextareaEditChatSessionState(createChatSessionState())).toBe(true);
  expect(canPromptTextareaEditChatScreenInput({
    chatSessionState: createChatSessionState(),
    isConversationCompactionInFlight: false,
  })).toBe(true);
  expect(shouldPromptTextareaHandleInput({ textInput: "x" })).toBe(true);
  expect(shouldPromptTextareaHandleInput({ keyName: "left" })).toBe(true);
  expect(shouldPromptTextareaHandleInput({ keyName: "right" })).toBe(true);
  expect(shouldPromptTextareaHandleInput({ keyName: "backspace" })).toBe(true);
  expect(shouldPromptTextareaHandleInput({ keyName: "return" })).toBe(true);
});

test("prompt textarea cannot edit while conversation compaction is in flight", () => {
  expect(canPromptTextareaEditChatScreenInput({
    chatSessionState: createChatSessionState(),
    isConversationCompactionInFlight: true,
  })).toBe(false);
});

test("prompt interaction input includes editing keys and mode cycling", () => {
  expect(isPromptInteractionKeyboardInput(createKeyboardInput({ textInput: "x" }))).toBe(true);
  expect(isPromptInteractionKeyboardInput(createKeyboardInput({ keyName: "return" }))).toBe(true);
  expect(isPromptInteractionKeyboardInput(createKeyboardInput({ keyName: "tab" }))).toBe(true);
  expect(isPromptInteractionKeyboardInput(createKeyboardInput({ keyName: "pageup" }))).toBe(false);
});

test("prompt textarea leaves global navigation keys for chat screen handling", () => {
  expect(shouldPromptTextareaHandleInput({ keyName: "tab" })).toBe(false);
  expect(shouldPromptTextareaHandleInput({ keyName: "pageup" })).toBe(false);
  expect(shouldPromptTextareaHandleInput({ keyName: "pagedown" })).toBe(false);
  expect(shouldPromptTextareaHandleInput({ keyName: "escape" })).toBe(false);
});

test("selection panes let prompt textarea keep text editing keys but not selection keys", () => {
  const chatSessionStateWithSlashCommands = createChatSessionState({
    slashCommandSelectionState: {
      step: "showing_slash_commands",
      slashCommandQueryText: "mod",
      availableSlashCommands: [{ name: "model", value: "/model", description: "Change model" }],
      highlightedSlashCommandIndex: 0,
    },
  });
  const chatSessionStateWithPromptContextCandidates = createChatSessionState({
    promptContextSelectionState: {
      step: "showing_prompt_context_candidates",
      promptContextQueryText: "rea",
      promptContextCandidates: [],
      highlightedPromptContextCandidateIndex: 0,
    },
  });

  for (const chatSessionState of [chatSessionStateWithSlashCommands, chatSessionStateWithPromptContextCandidates]) {
    expect(shouldPromptTextareaHandleInput({ chatSessionState, textInput: "x" })).toBe(true);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "left" })).toBe(true);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "right" })).toBe(true);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "backspace" })).toBe(true);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "up" })).toBe(false);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "down" })).toBe(false);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "return" })).toBe(false);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "escape" })).toBe(false);
  }
});

test("prompt textarea cannot edit while another top-level chat screen state owns input", () => {
  const nonEditableChatSessionStates: ChatSessionState[] = [
    createChatSessionState({ conversationTurnStatus: "streaming_assistant_response" }),
    createChatSessionState({ isCommandHelpModalVisible: true }),
    createChatSessionState({ modelAndReasoningSelectionState: { step: "loading_available_models" } }),
    createChatSessionState({ conversationSessionSelectionState: { step: "loading_conversation_sessions" } }),
  ];

  for (const chatSessionState of nonEditableChatSessionStates) {
    expect(canPromptTextareaEditChatSessionState(chatSessionState)).toBe(false);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, textInput: "x" })).toBe(false);
    expect(shouldPromptTextareaHandleInput({ chatSessionState, keyName: "left" })).toBe(false);
  }
});
