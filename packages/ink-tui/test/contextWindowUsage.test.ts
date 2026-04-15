import { expect, test } from "bun:test";
import { calculateContextWindowFillPercentage } from "../src/contextWindowUsage.ts";

test("calculateContextWindowFillPercentage reports zero when nothing has been used", () => {
  expect(
    calculateContextWindowFillPercentage({ totalTokensUsed: 0, contextWindowTokenCapacity: 100 }),
  ).toBe(0);
});

test("calculateContextWindowFillPercentage reports full percentage when usage equals capacity", () => {
  expect(
    calculateContextWindowFillPercentage({ totalTokensUsed: 100, contextWindowTokenCapacity: 100 }),
  ).toBe(100);
});

test("calculateContextWindowFillPercentage rounds to the nearest integer percent", () => {
  expect(
    calculateContextWindowFillPercentage({ totalTokensUsed: 42, contextWindowTokenCapacity: 100 }),
  ).toBe(42);
  expect(
    calculateContextWindowFillPercentage({ totalTokensUsed: 425, contextWindowTokenCapacity: 1000 }),
  ).toBe(43);
});

test("calculateContextWindowFillPercentage clamps overage to one hundred", () => {
  expect(
    calculateContextWindowFillPercentage({ totalTokensUsed: 150, contextWindowTokenCapacity: 100 }),
  ).toBe(100);
});
