import { expect, test } from "bun:test";
import {
  listChatScreenKeyboardShortcutHelpEntries,
  readChatScreenKeyboardShortcutCatalogEntry,
} from "../src/keyboard/chatScreenKeyboardShortcutCatalog.ts";

test("chat screen keyboard shortcut catalog exposes command-help entries in display order", () => {
  expect(listChatScreenKeyboardShortcutHelpEntries().map((shortcutEntry) => ({
    shortcutId: shortcutEntry.shortcutId,
    helpLabel: shortcutEntry.helpLabel,
    description: shortcutEntry.description,
  }))).toEqual([
    { shortcutId: "assistant_mode_cycle", helpLabel: "Tab", description: "Cycle operating mode" },
    { shortcutId: "prompt_submit_or_choose", helpLabel: "Enter", description: "Submit or choose item" },
    { shortcutId: "prompt_insert_newline", helpLabel: "Shift/Ctrl+Enter", description: "Insert newline in prompt" },
    { shortcutId: "panel_close_or_interrupt", helpLabel: "Esc", description: "Close panel or interrupt turn" },
    { shortcutId: "selection_move", helpLabel: "Up/Down", description: "Move through selections" },
    { shortcutId: "transcript_page_scroll", helpLabel: "PageUp/PageDown", description: "Scroll transcript by page" },
    { shortcutId: "prompt_cursor_move", helpLabel: "Left/Right", description: "Move prompt cursor" },
    { shortcutId: "prompt_cursor_jump", helpLabel: "Home/End", description: "Jump prompt cursor" },
    { shortcutId: "delete_or_backspace", helpLabel: "Delete/Backspace", description: "Delete text or session" },
    { shortcutId: "tool_approval_decision", helpLabel: "Y/N", description: "Approve or deny tool" },
    { shortcutId: "clipboard_image_paste", helpLabel: "Ctrl+V", description: "Paste clipboard image" },
  ]);
});

test("chat screen keyboard shortcut catalog exposes the footer keycap label for mode cycling", () => {
  expect(readChatScreenKeyboardShortcutCatalogEntry("assistant_mode_cycle")).toMatchObject({
    helpLabel: "Tab",
    keycapLabel: "tab",
  });
});
