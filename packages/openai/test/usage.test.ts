import { expect, test } from "bun:test";
import { normalizeOpenAiUsage } from "../src/index.ts";

test("normalizeOpenAiUsage separates cached and reasoning tokens", () => {
  const usage = normalizeOpenAiUsage({
    input_tokens: 140,
    input_tokens_details: {
      cached_tokens: 20,
    },
    output_tokens: 80,
    output_tokens_details: {
      reasoning_tokens: 30,
    },
    total_tokens: 220,
  });

  expect(usage.total).toBe(220);
  expect(usage.input).toBe(120);
  expect(usage.output).toBe(50);
  expect(usage.reasoning).toBe(30);
  expect(usage.cache.read).toBe(20);
  expect(usage.cache.write).toBe(0);
});
