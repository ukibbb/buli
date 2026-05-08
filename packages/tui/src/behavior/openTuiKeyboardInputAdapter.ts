import type { ChatSessionKeyboardInput, ChatSessionKeyboardKeyName } from "@buli/chat-session-state";

export type OpenTuiKeyboardEventForChatSession = {
  name: string | undefined;
  sequence: string | undefined;
  ctrl: boolean | undefined;
  meta: boolean | undefined;
};

export function normalizeOpenTuiKeyEventForChatSession(
  openTuiKeyboardEvent: OpenTuiKeyboardEventForChatSession,
): ChatSessionKeyboardInput {
  const keyName = mapOpenTuiKeyNameToChatSessionKeyboardKeyName(
    openTuiKeyboardEvent.name,
    openTuiKeyboardEvent.sequence,
  );
  return {
    keyName,
    textInput: keyName ? undefined : resolvePlainTextInput(openTuiKeyboardEvent.sequence),
    isCtrlPressed: openTuiKeyboardEvent.ctrl === true,
    isMetaPressed: openTuiKeyboardEvent.meta === true,
  };
}

export function normalizeOpenTuiPasteTextForChatSession(pastedText: string): ChatSessionKeyboardInput {
  return {
    keyName: undefined,
    textInput: pastedText.length > 0 ? pastedText : undefined,
    isCtrlPressed: false,
    isMetaPressed: false,
  };
}

function mapOpenTuiKeyNameToChatSessionKeyboardKeyName(
  openTuiKeyName: string | undefined,
  keySequence: string | undefined,
): ChatSessionKeyboardKeyName | undefined {
  if (keySequence === "\t") {
    return "tab";
  }

  if (keySequence === "\x1b") {
    return "escape";
  }

  const normalizedOpenTuiKeyName = openTuiKeyName?.toLowerCase();
  switch (normalizedOpenTuiKeyName) {
    case "backspace":
    case "delete":
    case "down":
    case "end":
    case "esc":
    case "escape":
    case "home":
    case "left":
    case "pagedown":
    case "pageup":
    case "return":
    case "right":
    case "tab":
    case "up":
      return normalizedOpenTuiKeyName === "esc" ? "escape" : normalizedOpenTuiKeyName;
    case "enter":
      return "return";
    default:
      return undefined;
  }
}

function resolvePlainTextInput(keySequence: string | undefined): string | undefined {
  return keySequence && keySequence.length === 1 ? keySequence : undefined;
}
