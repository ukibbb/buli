import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import {
  comfortableTerminalSizeTier,
  compactTerminalSizeTier,
  minimumTerminalSizeTier,
} from "@buli/assistant-design-tokens";
import { ShortcutsModal } from "../../src/components/ShortcutsModal.tsx";

describe("ShortcutsModal", () => {
  test("renders_full_chrome_including_footer_when_terminal_is_comfortable_and_room_is_ample", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal
        onCloseRequested={() => {}}
        availableModalRowCount={31}
        terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
      />,
      { width: 120, height: 40 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("help · shortcuts");
    expect(frame).toContain("// keyboard");
    expect(frame).toContain("// help");
    expect(frame).toContain("buli · tui · v0.1");
    expect(frame).toContain("close with ? or esc");
  });

  test("drops_chrome_but_keeps_both_sections_at_compact_tier_with_room_for_help", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal
        onCloseRequested={() => {}}
        availableModalRowCount={11}
        terminalSizeTierForChatScreen={compactTerminalSizeTier}
      />,
      { width: 80, height: 20 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("help · shortcuts");
    expect(frame).toContain("// keyboard");
    expect(frame).toContain("// help");
    expect(frame).not.toContain("buli · tui · v0.1");
    expect(frame).not.toContain("close with ? or esc");
  });

  test("drops_help_section_when_compact_tier_does_not_leave_room_for_both_sections", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal
        onCloseRequested={() => {}}
        availableModalRowCount={7}
        terminalSizeTierForChatScreen={compactTerminalSizeTier}
      />,
      { width: 80, height: 16 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("help · shortcuts");
    expect(frame).toContain("// keyboard");
    expect(frame).not.toContain("// help");
    expect(frame).not.toContain("buli · tui · v0.1");
  });

  test("renders_keyboard_section_only_at_minimum_tier", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal
        onCloseRequested={() => {}}
        availableModalRowCount={5}
        terminalSizeTierForChatScreen={minimumTerminalSizeTier}
      />,
      { width: 50, height: 8 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("help · shortcuts");
    expect(frame).toContain("// keyboard");
    expect(frame).not.toContain("// help");
    expect(frame).not.toContain("buli · tui · v0.1");
  });

  test("never_renders_more_rows_than_the_available_modal_row_count_so_text_never_overlaps_under_overflow", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal
        onCloseRequested={() => {}}
        availableModalRowCount={7}
        terminalSizeTierForChatScreen={compactTerminalSizeTier}
      />,
      { width: 80, height: 16 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const populatedModalRowCount = frame
      .split("\n")
      .filter((row) => row.includes("─") || row.includes("help · shortcuts") || row.includes("// keyboard"))
      .length;
    expect(populatedModalRowCount).toBeLessThanOrEqual(7);
  });

  test("clamps_modal_width_so_descriptions_do_not_overflow_wide_terminals", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ShortcutsModal
        onCloseRequested={() => {}}
        availableModalRowCount={31}
        terminalSizeTierForChatScreen={comfortableTerminalSizeTier}
      />,
      { width: 200, height: 40 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const widestRenderedRowWidth = frame
      .split("\n")
      .map((row) => row.replace(/\s+$/, "").length)
      .reduce((widest, current) => Math.max(widest, current), 0);
    expect(widestRenderedRowWidth).toBeLessThanOrEqual(70);
  });
});
