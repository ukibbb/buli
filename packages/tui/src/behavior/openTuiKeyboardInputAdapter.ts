import type { ChatSessionKeyboardInput, ChatSessionKeyboardKeyName } from "@buli/chat-session-state";

export type OpenTuiKeyboardEventForChatSession = {
  name: string | undefined;
  sequence: string | undefined;
  ctrl: boolean | undefined;
  shift?: boolean | undefined;
  meta: boolean | undefined;
};

export function normalizeOpenTuiKeyEventForChatSession(
  openTuiKeyboardEvent: OpenTuiKeyboardEventForChatSession,
): ChatSessionKeyboardInput {
  const keyName = mapOpenTuiKeyNameToChatSessionKeyboardKeyName(
    openTuiKeyboardEvent.name,
    openTuiKeyboardEvent.sequence,
    openTuiKeyboardEvent.ctrl === true,
  );
  return {
    keyName,
    textInput: keyName ? undefined : resolvePlainTextInput(openTuiKeyboardEvent.sequence),
    isCtrlPressed: openTuiKeyboardEvent.ctrl === true,
    ...(openTuiKeyboardEvent.shift === true ? { isShiftPressed: true } : {}),
    isMetaPressed: openTuiKeyboardEvent.meta === true,
  };
}

function mapOpenTuiKeyNameToChatSessionKeyboardKeyName(
  openTuiKeyName: string | undefined,
  keySequence: string | undefined,
  isCtrlPressed = false,
): ChatSessionKeyboardKeyName | undefined {
  const normalizedOpenTuiKeyName = openTuiKeyName?.toLowerCase();
  if (isCtrlPressed && (normalizedOpenTuiKeyName === "v" || keySequence === "\x16")) {
    return "paste";
  }

  if (keySequence === "\t") {
    return "tab";
  }

  if (keySequence === "\x1b") {
    return "escape";
  }

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
