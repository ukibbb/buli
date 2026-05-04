import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { comfortableTerminalSizeTier, compactTerminalSizeTier } from "@buli/assistant-design-tokens";
import { CommandHelpModal } from "../../src/components/CommandHelpModal.tsx";

const availableSlashCommands = [
  { name: "help", value: "help", description: "Show available commands" },
  { name: "model", value: "model", description: "Choose OpenAI model and reasoning effort" },
];

describe("CommandHelpModal", () => {
  test("renders_command_help_instead_of_keyboard_shortcuts", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <CommandHelpModal
        onCloseRequested={() => {}}
        availableModalRowCount={12}
        terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
        availableSlashCommands={availableSlashCommands}
      />,
      { width: 120, height: 18 },
    );

    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("help · commands");
    expect(frame).toContain("/help");
    expect(frame).toContain("Show available commands");
    expect(frame).toContain("/model");
    expect(frame).toContain("Choose OpenAI model and reasoning effort");
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
    expect(widestRenderedRowWidth).toBeLessThanOrEqual(70);
  });
});
