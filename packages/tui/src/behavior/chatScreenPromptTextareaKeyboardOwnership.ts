import type { ChatSessionKeyboardInput, ChatSessionState } from "@buli/chat-session-state";

export function canPromptTextareaEditChatSessionState(chatSessionState: ChatSessionState): boolean {
  return chatSessionState.conversationTurnStatus === "waiting_for_user_input" &&
    !chatSessionState.isCommandHelpModalVisible &&
    chatSessionState.modelAndReasoningSelectionState.step === "hidden" &&
    chatSessionState.conversationSessionSelectionState.step === "hidden";
}

export function canPromptTextareaEditChatScreenInput(input: {
  chatSessionState: ChatSessionState;
  isConversationCompactionInFlight: boolean;
}): boolean {
  return !input.isConversationCompactionInFlight && canPromptTextareaEditChatSessionState(input.chatSessionState);
}

export function isPromptInteractionKeyboardInput(chatSessionKeyboardInput: ChatSessionKeyboardInput): boolean {
  return chatSessionKeyboardInput.keyName === "tab" || isPromptTextareaEditingKeyboardInput(chatSessionKeyboardInput);
}

export function shouldPromptTextareaHandleKeyboardInput(input: {
  chatSessionState: ChatSessionState;
  chatSessionKeyboardInput: ChatSessionKeyboardInput;
}): boolean {
  if (!canPromptTextareaEditChatSessionState(input.chatSessionState)) {
    return false;
  }

  if (
    input.chatSessionKeyboardInput.keyName === "tab" ||
    input.chatSessionKeyboardInput.keyName === "pageup" ||
    input.chatSessionKeyboardInput.keyName === "pagedown"
  ) {
    return false;
  }

  if (
    input.chatSessionState.slashCommandSelectionState.step !== "hidden" ||
    input.chatSessionState.promptContextSelectionState.step !== "hidden"
  ) {
    return isPromptTextareaEditingKeyboardInput(input.chatSessionKeyboardInput) &&
      input.chatSessionKeyboardInput.keyName !== "up" &&
      input.chatSessionKeyboardInput.keyName !== "down" &&
      input.chatSessionKeyboardInput.keyName !== "return" &&
      input.chatSessionKeyboardInput.keyName !== "escape";
  }

  return isPromptTextareaEditingKeyboardInput(input.chatSessionKeyboardInput) &&
    input.chatSessionKeyboardInput.keyName !== "escape";
}

export function isPromptTextareaEditingKeyboardInput(chatSessionKeyboardInput: ChatSessionKeyboardInput): boolean {
  if (chatSessionKeyboardInput.textInput !== undefined) {
    return true;
  }

  return chatSessionKeyboardInput.keyName === "backspace" ||
    chatSessionKeyboardInput.keyName === "delete" ||
    chatSessionKeyboardInput.keyName === "down" ||
    chatSessionKeyboardInput.keyName === "end" ||
    chatSessionKeyboardInput.keyName === "home" ||
    chatSessionKeyboardInput.keyName === "left" ||
    chatSessionKeyboardInput.keyName === "return" ||
    chatSessionKeyboardInput.keyName === "right" ||
    chatSessionKeyboardInput.keyName === "up";
}
