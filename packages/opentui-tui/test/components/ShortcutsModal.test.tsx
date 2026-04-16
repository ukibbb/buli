import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { ShortcutsModal } from "../../src/components/ShortcutsModal.tsx";

describe("ShortcutsModal", () => {
  test("renders_help_shortcuts_heading", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal onCloseRequested={() => {}} />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("help · shortcuts");
  });

  test("renders_keyboard_shortcut_rows", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal onCloseRequested={() => {}} />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("enter");
    expect(frame).toContain("esc");
  });
});
