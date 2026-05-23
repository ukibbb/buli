import { expect, test } from "bun:test";
import { chatScreenTheme } from "@buli/assistant-design-tokens";
import { resolveReasoningEffortColor } from "../../src/components/resolveReasoningEffortColor.ts";

test("minimal effort renders as textDim", () => {
  expect(resolveReasoningEffortColor("minimal")).toBe(chatScreenTheme.textDim);
});

test("low effort renders as textMuted", () => {
  expect(resolveReasoningEffortColor("low")).toBe(chatScreenTheme.textMuted);
});

test("medium effort renders as textPrimary", () => {
  expect(resolveReasoningEffortColor("medium")).toBe(chatScreenTheme.textPrimary);
});

test("high effort renders as accentCyan", () => {
  expect(resolveReasoningEffortColor("high")).toBe(chatScreenTheme.accentCyan);
});

test("xhigh effort renders as accentPink", () => {
  expect(resolveReasoningEffortColor("xhigh")).toBe(chatScreenTheme.accentPink);
});

test("unknown effort falls back to textMuted", () => {
  expect(resolveReasoningEffortColor("default")).toBe(chatScreenTheme.textMuted);
  expect(resolveReasoningEffortColor("")).toBe(chatScreenTheme.textMuted);
});
