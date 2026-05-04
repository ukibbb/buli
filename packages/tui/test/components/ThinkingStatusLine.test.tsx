import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import { ThinkingStatusLine } from "../../src/components/ThinkingStatusLine.tsx";

describe("ThinkingStatusLine", () => {
  test("renders_thinking_label_and_elapsed_duration", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ThinkingStatusLine thinkingStartedAtMs={Date.now() - 1500} />,
      { width: 40, height: 3 },
    );

    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toMatch(/\d+\.\ds/);
  });

  test("uses_existing_reasoning_status_colours", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ThinkingStatusLine thinkingStartedAtMs={Date.now() - 500} />,
      { width: 40, height: 3 },
    );

    await renderOnce();
    expect(captureCharFrame()).toContain("Thinking");
    expect(chatScreenTheme.accentAmber).toBe("#F59E0B");
    expect(chatScreenTheme.textMuted).toBe("#64748B");
    expect(chatScreenTheme.textDim).toBe("#475569");
  });
});
