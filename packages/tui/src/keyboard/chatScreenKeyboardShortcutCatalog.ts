export type ChatScreenKeyboardShortcutId =
  | "assistant_mode_cycle"
  | "prompt_submit_or_choose"
  | "prompt_insert_newline"
  | "panel_close_or_interrupt"
  | "selection_move"
  | "transcript_page_scroll"
  | "prompt_cursor_move"
  | "prompt_cursor_jump"
  | "delete_or_backspace"
  | "tool_approval_decision"
  | "clipboard_image_paste";

export type ChatScreenKeyboardShortcutGroup =
  | "assistant_mode"
  | "prompt"
  | "panel_navigation"
  | "transcript_navigation"
  | "tool_approval"
  | "clipboard";

export type ChatScreenKeyboardShortcutCatalogEntry = {
  readonly shortcutId: ChatScreenKeyboardShortcutId;
  readonly shortcutGroup: ChatScreenKeyboardShortcutGroup;
  readonly helpLabel: string;
  readonly description: string;
  readonly keycapLabel?: string;
};

const chatScreenKeyboardShortcutCatalogEntries = [
  {
    shortcutId: "assistant_mode_cycle",
    shortcutGroup: "assistant_mode",
    helpLabel: "Tab",
    keycapLabel: "tab",
    description: "Cycle operating mode",
  },
  {
    shortcutId: "prompt_submit_or_choose",
    shortcutGroup: "prompt",
    helpLabel: "Enter",
    description: "Submit or choose item",
  },
  {
    shortcutId: "prompt_insert_newline",
    shortcutGroup: "prompt",
    helpLabel: "Shift/Ctrl+Enter",
    description: "Insert newline in prompt",
  },
  {
    shortcutId: "panel_close_or_interrupt",
    shortcutGroup: "panel_navigation",
    helpLabel: "Esc",
    description: "Close panel or interrupt turn",
  },
  {
    shortcutId: "selection_move",
    shortcutGroup: "panel_navigation",
    helpLabel: "Up/Down",
    description: "Move through selections",
  },
  {
    shortcutId: "transcript_page_scroll",
    shortcutGroup: "transcript_navigation",
    helpLabel: "PageUp/PageDown",
    description: "Scroll transcript by page",
  },
  {
    shortcutId: "prompt_cursor_move",
    shortcutGroup: "prompt",
    helpLabel: "Left/Right",
    description: "Move prompt cursor",
  },
  {
    shortcutId: "prompt_cursor_jump",
    shortcutGroup: "prompt",
    helpLabel: "Home/End",
    description: "Jump prompt cursor",
  },
  {
    shortcutId: "delete_or_backspace",
    shortcutGroup: "prompt",
    helpLabel: "Delete/Backspace",
    description: "Delete text or session",
  },
  {
    shortcutId: "tool_approval_decision",
    shortcutGroup: "tool_approval",
    helpLabel: "Y/N",
    description: "Approve or deny tool",
  },
  {
    shortcutId: "clipboard_image_paste",
    shortcutGroup: "clipboard",
    helpLabel: "Ctrl+V",
    description: "Paste clipboard image",
  },
] as const satisfies readonly ChatScreenKeyboardShortcutCatalogEntry[];

export function listChatScreenKeyboardShortcutHelpEntries(): readonly ChatScreenKeyboardShortcutCatalogEntry[] {
  return chatScreenKeyboardShortcutCatalogEntries;
}

export function readChatScreenKeyboardShortcutCatalogEntry(
  shortcutId: ChatScreenKeyboardShortcutId,
): ChatScreenKeyboardShortcutCatalogEntry {
  const keyboardShortcutCatalogEntry = chatScreenKeyboardShortcutCatalogEntries.find(
    (candidateKeyboardShortcutCatalogEntry) => candidateKeyboardShortcutCatalogEntry.shortcutId === shortcutId,
  );
  if (!keyboardShortcutCatalogEntry) {
    throw new Error(`Unknown chat screen keyboard shortcut: ${shortcutId}`);
  }

  return keyboardShortcutCatalogEntry;
}
