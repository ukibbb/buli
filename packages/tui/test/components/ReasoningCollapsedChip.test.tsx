import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { ReasoningCollapsedChip } from "../../src/components/ReasoningCollapsedChip.tsx";

describe("ReasoningCollapsedChip", () => {
  test("renders_pending_token_label_when_token_count_is_unavailable", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningCollapsedChip reasoningDurationMs={2500} reasoningTokenCount={undefined} />,
      { width: 60, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toContain("2.5s");
    expect(frame).toContain("reasoning tokens pending");
  });

  test("renders_token_count_when_provided", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningCollapsedChip reasoningDurationMs={1000} reasoningTokenCount={512} />,
      { width: 60, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toContain("512 reasoning tok");
  });

  test("renders_duration_in_textMuted_and_token_count_in_textDim", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ReasoningCollapsedChip reasoningDurationMs={3200} reasoningTokenCount={1248} />,
      { width: 80, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("Thinking");
    expect(frame).toContain("3.2s");
    expect(frame).toContain("1248 reasoning tok");
    expect(chatScreenTheme.textMuted).toBe("#64748B");
    expect(chatScreenTheme.textDim).toBe("#475569");
  });
});
