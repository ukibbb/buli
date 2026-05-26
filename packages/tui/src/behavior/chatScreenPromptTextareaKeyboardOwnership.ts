import {
  canChatSessionPromptDraftBeEdited,
  resolveChatSessionInteractionScope,
  type ChatSessionKeyboardInput,
  type ChatSessionState,
} from "@buli/chat-session-state";
import {
  canChatAppPromptDraftBeEdited,
  isConversationSessionCompactionBlockingPromptInput,
  type ConversationSessionCompactionStatus,
} from "@buli/chat-app-controller";

export function canPromptTextareaEditChatSessionState(chatSessionState: ChatSessionState): boolean {
  return canChatSessionPromptDraftBeEdited(chatSessionState);
}

export function canPromptTextareaEditChatScreenInput(input: {
  chatSessionState: ChatSessionState;
  conversationSessionCompactionStatus: ConversationSessionCompactionStatus;
}): boolean {
  return canChatAppPromptDraftBeEdited({
    chatSessionState: input.chatSessionState,
    isConversationCompactionBlockingPromptInput: isConversationSessionCompactionBlockingPromptInput(
      input.conversationSessionCompactionStatus,
    ),
  });
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

  const interactionScope = resolveChatSessionInteractionScope(input.chatSessionState);

  if (interactionScope === "slash_command_selection" || interactionScope === "prompt_context_selection") {
    return isPromptTextareaEditingKeyboardInput(input.chatSessionKeyboardInput) &&
      input.chatSessionKeyboardInput.keyName !== "up" &&
      input.chatSessionKeyboardInput.keyName !== "down" &&
      input.chatSessionKeyboardInput.keyName !== "return" &&
      input.chatSessionKeyboardInput.keyName !== "escape";
  }

  if (interactionScope === "prompt_draft_editing") {
    return isPromptTextareaEditingKeyboardInput(input.chatSessionKeyboardInput) &&
      input.chatSessionKeyboardInput.keyName !== "escape";
  }

  return false;
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
