import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { resolveContextMeterUsedTokenColor } from "../../src/components/ContextWindowMeter.tsx";

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
