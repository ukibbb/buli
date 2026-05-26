import { describe, expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { testRender } from "../testRenderWithCleanup.ts";
import {
  ContextWindowMeter,
  resolveContextMeterUsedTokenColor,
} from "../../src/components/ContextWindowMeter.tsx";

describe("resolveContextMeterUsedTokenColor", () => {
  test("used color is muted when used count is undefined", () => {
    expect(resolveContextMeterUsedTokenColor(undefined, 400_000)).toBe(chatScreenTheme.textMuted);
  });

  test("used color is muted when capacity is undefined", () => {
    expect(resolveContextMeterUsedTokenColor(1000, undefined)).toBe(chatScreenTheme.textMuted);
  });

  test("fill below 60 percent colors used token as accentGreen", () => {
    expect(resolveContextMeterUsedTokenColor(50_000, 100_000)).toBe(chatScreenTheme.accentGreen);
  });

  test("fill at exactly 60 percent colors used token as accentAmber", () => {
    expect(resolveContextMeterUsedTokenColor(60_000, 100_000)).toBe(chatScreenTheme.accentAmber);
  });

  test("fill between 60 and 85 percent colors used token as accentAmber", () => {
    expect(resolveContextMeterUsedTokenColor(80_000, 100_000)).toBe(chatScreenTheme.accentAmber);
  });

  test("fill at exactly 85 percent colors used token as accentPink", () => {
    expect(resolveContextMeterUsedTokenColor(85_000, 100_000)).toBe(chatScreenTheme.accentPink);
  });

  test("fill above 85 percent colors used token as accentPink", () => {
    expect(resolveContextMeterUsedTokenColor(99_000, 100_000)).toBe(chatScreenTheme.accentPink);
  });
});

describe("ContextWindowMeter (opentui)", () => {
  test("renders_fallback_when_usage_and_capacity_are_unknown", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={undefined} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("--");
  });

  test("renders_unknown_usage_fallback_when_usage_is_unknown_but_capacity_is_known", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={undefined} contextWindowTokenCapacity={100_000} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("--");
  });

  test("renders_used_token_count_when_no_capacity", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={500} contextWindowTokenCapacity={undefined} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    expect(captureCharFrame()).toContain("500");
  });

  test("renders_used_limit_and_percent_when_capacity_known", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={50_000} contextWindowTokenCapacity={200_000} />,
      { width: 40, height: 3 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("50k / 200k (25%)");
    expect(frame).not.toContain("ctx");
  });

  test("renders_decimal_thousands_without_ctx_label", async () => {
    const { captureCharFrame, renderOnce } = await testRender(
      <ContextWindowMeter totalTokensUsed={22_200} contextWindowTokenCapacity={320_000} />,
      { width: 60, height: 2 },
    );
    await renderOnce();
    const frame = captureCharFrame();
    expect(frame).toContain("22.2k / 320k (7%)");
    expect(frame).not.toContain("ctx");
  });
});
