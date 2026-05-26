import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { comfortableTerminalSizeTier, compactTerminalSizeTier } from "@buli/assistant-design-tokens";
import { CommandHelpModal } from "../../src/components/CommandHelpModal.tsx";
import { listChatScreenKeyboardShortcutHelpEntries } from "../../src/keyboard/chatScreenKeyboardShortcutCatalog.ts";

const availableSlashCommands = [
  { name: "help", value: "help", description: "Show available commands and shortcuts" },
  { name: "model", value: "model", description: "Choose OpenAI model and reasoning effort" },
];

describe("CommandHelpModal", () => {
  test("renders_command_help_with_keyboard_shortcuts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <CommandHelpModal
        onCloseRequested={() => {}}
        availableModalRowCount={24}
        terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
        availableSlashCommands={availableSlashCommands}
      />,
      { width: 120, height: 28 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("help · commands + shortcuts");
    expect(frame).toContain("commands");
    expect(frame).toContain("/help");
    expect(frame).toContain("Show available commands and shortcuts");
    expect(frame).toContain("/model");
    expect(frame).toContain("Choose OpenAI model and reasoning effort");
    expect(frame).toContain("shortcuts");
    for (const keyboardShortcutHelpEntry of listChatScreenKeyboardShortcutHelpEntries()) {
      expect(frame).toContain(keyboardShortcutHelpEntry.helpLabel);
      expect(frame).toContain(keyboardShortcutHelpEntry.description);
    }
    expect(frame).not.toContain("ctrl + l");
    expect(frame).not.toContain("[ ? ]");
  });

  test("clamps_command_help_width", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <CommandHelpModal
        onCloseRequested={() => {}}
        availableModalRowCount={12}
        terminalSizeTierForChatScreen={compactTerminalSizeTier}
        availableSlashCommands={availableSlashCommands}
      />,
      { width: 200, height: 18 },
    );

    await renderOnce();

    const widestRenderedRowWidth = captureCharFrame()
      .split("\n")
      .map((row) => row.replace(/\s+$/, "").length)
      .reduce((widest, current) => Math.max(widest, current), 0);
    expect(widestRenderedRowWidth).toBeLessThanOrEqual(112);
  });
});
