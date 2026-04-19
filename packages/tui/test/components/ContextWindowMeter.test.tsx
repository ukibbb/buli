import { describe, expect, test } from "bun:test";
import { testRender } from "../testRenderWithCleanup.ts";
import { ContextWindowMeter } from "../../src/components/ContextWindowMeter.tsx";
import { chatScreenTheme } from "@buli/assistant-design-tokens";

describe("ContextWindowMeter (opentui)", () => {
  test("renders_fallback_when_no_tokens_used", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={undefined} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("ctx --");
  });

  test("renders_raw_token_count_when_no_capacity", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={500} contextWindowTokenCapacity={undefined} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("500 tok");
  });

  test("renders_bar_and_percentage_when_capacity_known", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={50000} contextWindowTokenCapacity={200000} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("25%");
    expect(frame).toContain("ctx");
  });

  test("renders_ctx_and_percent_text", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={42_000} contextWindowTokenCapacity={100_000} />,
      { width: 60, height: 2 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("ctx");
    expect(frame).toContain("42%");
    expect(chatScreenTheme.accentCyan).toBe("#22D3EE");
  });

  test("falls_back_to_ctx_double_dash_without_usage", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={100_000} />,
      { width: 30, height: 2 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("ctx --");
  });
});
