import { describe, expect, test } from "bun:test";
import { testRender } from "../../testRenderWithCleanup.ts";
import {
  ToolCallHeaderLeft,
  ToolCallHeaderRight,
} from "../../../src/components/toolCalls/ToolCallCardHeaderSlots.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("ToolCallCardHeaderSlots (opentui)", () => {
  test("ToolCallHeaderLeft renders glyph, label, and target on a single row", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderLeft
        toolGlyph="▸"
        toolGlyphColor={chatScreenTheme.accentAmber}
        toolNameLabel="Bash"
        toolTargetContent={<text fg={chatScreenTheme.textMuted}>bun test</text>}
      />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    const singleHeaderLine = frame.split("\n").find((line) => line.includes("Bash"));
    expect(singleHeaderLine).toBeDefined();
    expect(singleHeaderLine ?? "").toContain("▸");
    expect(singleHeaderLine ?? "").toContain("bun test");
  });

  test("ToolCallHeaderLeft omits the target slot when no target content is provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderLeft
        toolGlyph="☐"
        toolGlyphColor={chatScreenTheme.accentGreen}
        toolNameLabel="TodoWrite"
      />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("TodoWrite");
    expect(frame).not.toContain("·");
  });

  test("ToolCallHeaderRight renders status label and ✓ on success", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ToolCallHeaderRight
        statusColor={chatScreenTheme.accentGreen}
        statusKind="success"
        statusLabel="exit 0 · 620ms"
      />,
      { width: 30, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("exit 0 · 620ms");
    expect(frame).toContain("✓");
  });
});
